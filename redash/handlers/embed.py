import os
from urllib.parse import urlparse

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from flask import current_app, redirect, request
from flask_login import current_user, login_required, login_user
from sqlalchemy.orm.attributes import flag_modified

from redash import models
from redash.handlers import routes
from redash.handlers.base import (
    get_object_or_404,
    json_response,
    org_scoped_rule,
    record_event,
)
from redash.handlers.static import render_index
from redash.security import csp_allows_embeding, csrf

from .authentication import current_org

EMBED_STATE_KEY = "embed_state"
EMBED_SESSION_SALT = "redash-embed-session"
EMBED_SESSION_MAX_AGE = 60 * 60 * 12
EMBED_SESSION_COOKIE_NAME = "redash_embed_session"
EMBED_DEFAULT_ADMIN_CODE = os.environ.get("REDASH_EMBED_DEFAULT_ADMIN_CODE", "0000")


def _validate_redash_admin_target(raw_target):
    target = str(raw_target or "").strip()
    if not target:
        return "/admin"

    parsed = urlparse(target)

    # Support relative targets and keep them constrained to the admin area.
    if not parsed.scheme and not parsed.netloc:
        if target.startswith("/admin"):
            return target
        return "/admin"

    # Allow only Redash admin on localhost:5001 or current-hostname:5001.
    expected_host = (request.host.split(":", 1)[0] or "").lower()
    allowed_hosts = {"localhost"}
    if expected_host:
        allowed_hosts.add(expected_host)

    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "http":
        return "/admin"
    if hostname not in allowed_hosts:
        return "/admin"
    if parsed.port != 5001:
        return "/admin"
    if not parsed.path.startswith("/admin"):
        return "/admin"

    return parsed.geturl()


def _embed_admin_user(org):
    admin_group = org.admin_group
    if not admin_group:
        return None

    return (
        models.User.query.filter(
            models.User.org_id == org.id,
            models.User.disabled_at.is_(None),
            models.User.group_ids.any(admin_group.id),
        )
        .order_by(models.User.id.asc())
        .first()
    )


def _safe_store_list(raw_stores):
    if not isinstance(raw_stores, list):
        return []

    cleaned = []
    for raw in raw_stores:
        if not isinstance(raw, dict):
            continue
        store_id = str(raw.get("id") or "").strip()
        if not store_id:
            continue
        cleaned.append(
            {
                "id": store_id,
                "name": str(raw.get("name") or "").strip(),
                "accessCode": str(raw.get("accessCode") or "").strip(),
            }
        )
    return cleaned


def _safe_embed_state(org):
    settings = org.settings or {}
    state = settings.get(EMBED_STATE_KEY)
    if not isinstance(state, dict):
        state = {}

    dashboards = state.get("dashboards")
    if not isinstance(dashboards, dict):
        dashboards = {}

    stores = _safe_store_list(state.get("stores"))
    home_dashboard_slug = str(state.get("homeDashboardSlug") or "").strip()
    admin_code = str(state.get("adminCode") or "").strip() or EMBED_DEFAULT_ADMIN_CODE

    return {
        "dashboards": dashboards,
        "stores": stores,
        "homeDashboardSlug": home_dashboard_slug,
        "adminCode": admin_code,
    }


def _session_serializer():
    return URLSafeTimedSerializer(current_app.config.get("SECRET_KEY"), salt=EMBED_SESSION_SALT)


def _issue_embed_token(org_id, role, store_id=None):
    payload = {"org_id": org_id, "role": role, "store_id": store_id}
    return _session_serializer().dumps(payload)


def _read_embed_token(token):
    if not token:
        return None

    try:
        return _session_serializer().loads(token, max_age=EMBED_SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def _extract_embed_token():
    header_value = request.headers.get("X-Embed-Session", "")
    if header_value:
        return header_value.strip()

    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("embed "):
        return auth_header[6:].strip()

    cookie_token = request.cookies.get(EMBED_SESSION_COOKIE_NAME, "")
    if cookie_token:
        return cookie_token.strip()

    return ""


def _session_payload(org):
    token = _extract_embed_token()
    payload = _read_embed_token(token)
    if not isinstance(payload, dict):
        return None

    if payload.get("org_id") != org.id:
        return None

    return payload


def _is_admin_session(org):
    payload = _session_payload(org)
    return bool(payload and payload.get("role") == "admin")


def _validate_pin(code):
    if not isinstance(code, str):
        return False
    return code.isdigit() and len(code) == 4


@routes.route(
    org_scoped_rule("/embed/query/<query_id>/visualization/<visualization_id>"),
    methods=["GET"],
)
@login_required
@csp_allows_embeding
def embed(query_id, visualization_id, org_slug=None):
    record_event(
        current_org,
        current_user._get_current_object(),
        {
            "action": "view",
            "object_id": visualization_id,
            "object_type": "visualization",
            "query_id": query_id,
            "embed": True,
            "referer": request.headers.get("Referer"),
        },
    )
    return render_index()


@routes.route(org_scoped_rule("/public/dashboards/<token>"), methods=["GET"])
@login_required
@csp_allows_embeding
def public_dashboard(token, org_slug=None):
    if current_user.is_api_user():
        dashboard = current_user.object
    else:
        api_key = get_object_or_404(models.ApiKey.get_by_api_key, token)
        dashboard = api_key.object

    record_event(
        current_org,
        current_user,
        {
            "action": "view",
            "object_id": dashboard.id,
            "object_type": "dashboard",
            "public": True,
            "headless": "embed" in request.args,
            "referer": request.headers.get("Referer"),
        },
    )
    return render_index()


@routes.route(org_scoped_rule("/api/embed/config"), methods=["GET"])
def embed_config(org_slug=None):
    state = _safe_embed_state(current_org)
    public_stores = [{"id": row["id"], "name": row["name"]} for row in state["stores"]]

    return json_response(
        {
            "dashboards": state["dashboards"],
            "stores": public_stores,
            "homeDashboardSlug": state["homeDashboardSlug"],
        }
    )


@routes.route(org_scoped_rule("/api/embed/admin/config"), methods=["GET"])
def embed_admin_config(org_slug=None):
    org = current_org._get_current_object()
    if not _is_admin_session(org):
        return json_response({"message": "Forbidden"}), 403

    state = _safe_embed_state(org)
    return json_response(state)


@csrf.exempt
@routes.route(org_scoped_rule("/api/embed/access/verify"), methods=["POST"])
def verify_embed_access_code(org_slug=None):
    payload = request.get_json(silent=True) or {}
    code = str(payload.get("code") or "").strip()
    if not _validate_pin(code):
        return json_response({"message": "Code must contain exactly 4 digits."}), 400

    org = current_org._get_current_object()
    state = _safe_embed_state(org)

    if state["adminCode"] and code == state["adminCode"]:
        token = _issue_embed_token(org.id, "admin")
        response = json_response({"role": "admin"})
        response.set_cookie(
            EMBED_SESSION_COOKIE_NAME,
            token,
            max_age=EMBED_SESSION_MAX_AGE,
            httponly=True,
            samesite="Lax",
            secure=request.is_secure,
            path="/",
        )
        return response

    for store in state["stores"]:
        if store.get("accessCode") == code:
            token = _issue_embed_token(org.id, "store", store_id=store["id"])
            response = json_response({"role": "store", "storeId": store["id"]})
            response.set_cookie(
                EMBED_SESSION_COOKIE_NAME,
                token,
                max_age=EMBED_SESSION_MAX_AGE,
                httponly=True,
                samesite="Lax",
                secure=request.is_secure,
                path="/",
            )
            return response

    return json_response({"message": "Invalid code."}), 401


@routes.route(org_scoped_rule("/api/embed/access/session"), methods=["GET"])
def embed_access_session(org_slug=None):
    org = current_org._get_current_object()
    payload = _session_payload(org)
    if not payload:
        return json_response({"role": None}), 401

    return json_response({"role": payload.get("role"), "storeId": payload.get("store_id")})


@csrf.exempt
@routes.route(org_scoped_rule("/api/embed/access/logout"), methods=["POST"])
def embed_access_logout(org_slug=None):
    response = json_response({"ok": True})
    response.set_cookie(EMBED_SESSION_COOKIE_NAME, "", max_age=0, path="/")
    return response


@csrf.exempt
@routes.route(org_scoped_rule("/api/embed/config"), methods=["POST"])
def save_embed_config(org_slug=None):
    org = current_org._get_current_object()
    if not _is_admin_session(org):
        return json_response({"message": "Forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    stores = _safe_store_list(payload.get("stores"))

    invalid_store_code = next(
        (row for row in stores if row.get("accessCode") and not _validate_pin(row.get("accessCode"))),
        None,
    )
    if invalid_store_code is not None:
        return json_response({"message": f"Store {invalid_store_code['id']} has invalid code."}), 400

    admin_code = str(payload.get("adminCode") or "").strip()
    if admin_code and not _validate_pin(admin_code):
        return json_response({"message": "Admin code must contain exactly 4 digits."}), 400

    dashboards = payload.get("dashboards")
    if not isinstance(dashboards, dict):
        return json_response({"message": "dashboards must be an object."}), 400

    state = {
        "dashboards": dashboards,
        "stores": stores,
        "homeDashboardSlug": str(payload.get("homeDashboardSlug") or "").strip(),
        "adminCode": admin_code,
    }

    org.settings = org.settings or {}
    org.settings[EMBED_STATE_KEY] = state
    flag_modified(org, "settings")
    models.db.session.add(org)
    models.db.session.commit()

    return json_response({"ok": True})


@routes.route(org_scoped_rule("/api/embed/admin/redash/sso"), methods=["GET"])
def embed_admin_redash_sso(org_slug=None):
    org = current_org._get_current_object()
    if not _is_admin_session(org):
        return json_response({"message": "Forbidden"}), 403

    user = _embed_admin_user(org)
    if not user:
        return json_response({"message": "No active admin user found for this organization."}), 404

    # Issue a regular Redash login session for iframe navigation.
    login_user(user, remember=True)

    target = _validate_redash_admin_target(request.args.get("target"))
    return redirect(target)
