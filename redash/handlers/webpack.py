import json
import os
from glob import glob

from flask import url_for

WEBPACK_MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "../../client/dist/", "asset-manifest.json")


def configure_webpack(app):
    app.extensions["webpack"] = {"assets": None}

    def load_assets():
        assets = app.extensions["webpack"]["assets"]
        # in debug we read in this file each request
        if assets is None or app.debug:
            try:
                with open(WEBPACK_MANIFEST_PATH) as fp:
                    assets = json.load(fp)
            except IOError:
                app.logger.exception("Unable to load webpack manifest")
                assets = {}
            app.extensions["webpack"]["assets"] = assets
        return assets

    def static_file_exists(path):
        file_path = path.split("?", 1)[0]
        return os.path.exists(os.path.join(app.static_folder, file_path))

    def resolve_asset_path(path, assets):
        asset_path = assets.get(path)
        if asset_path is not None:
            return asset_path

        # Some builds include hashed output files only in manifest values.
        # Fallback to matching "name.<hash>.ext" when "name.ext" key is missing.
        name, ext = os.path.splitext(path)
        hashed_prefix = "{}.".format(name)
        for candidate in assets.values():
            if candidate.startswith(hashed_prefix) and candidate.endswith(ext):
                return candidate

        # Fallback for dist folders that have hashed files but stale/partial manifests.
        pattern = os.path.join(app.static_folder, "{}.*{}".format(name, ext))
        files = sorted(glob(pattern))
        if files:
            return os.path.basename(files[-1])

        return path

    def get_asset(path):
        assets = load_assets()
        return url_for("static", filename=resolve_asset_path(path, assets))

    def get_asset_or_none(path):
        assets = load_assets()
        resolved_path = resolve_asset_path(path, assets)
        if resolved_path == path and not static_file_exists(path):
            return None
        return url_for("static", filename=resolved_path)

    @app.context_processor
    def webpack_assets():
        return {"asset_url": get_asset, "asset_url_or_none": get_asset_or_none}
