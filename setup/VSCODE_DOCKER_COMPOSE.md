# Redash: VS Code Repository to Docker Compose Run

This guide shows the shortest path from opening the repository in VS Code to running Redash containers with Docker Compose.

## 1. Prerequisites

- Docker Desktop installed and running
- Compose support enabled (`docker compose` command available)
- Git installed
- VS Code installed

Verify in terminal:

```bash
docker --version
docker compose version
git --version
```

## 2. Open Project in VS Code

1. Clone repository (if needed):

```bash
git clone https://github.com/getredash/redash.git
cd redash
```

2. Open folder in VS Code:

```bash
code .
```

## 3. Configure Environment

The root `compose.yaml` file already includes default services and env wiring.

Optionally create/update your local environment file if your team uses one:

- `.env`
- `.env.local`

Set at least secrets and passwords required by your deployment policy.

## 4. Build Images

From repository root:

```bash
docker compose build
```

If you changed frontend/build code and need a clean rebuild:

```bash
docker compose build --no-cache
```

## 5. Start Containers

Start in detached mode:

```bash
docker compose up -d
```

Follow logs:

```bash
docker compose logs -f
```

Stop:

```bash
docker compose down
```

Stop and remove volumes (destructive):

```bash
docker compose down -v
```

## 6. Verify Services

Check running containers:

```bash
docker compose ps
```

Open Redash in browser using the URL/port from your compose setup (commonly `http://localhost:5000`).

## 7. Useful Developer Workflow

- Rebuild single service after code changes:

```bash
docker compose build server
docker compose up -d server
```

- Restart one service quickly:

```bash
docker compose restart server
```

- Execute command inside running service:

```bash
docker compose exec server bash
```

## 8. Troubleshooting

- Port conflict: adjust host port mapping in `compose.yaml`.
- Stale images: run `docker compose down` then `docker compose build --no-cache`.
- Broken DB state in local dev: `docker compose down -v` and start again.
- On Windows, ensure Docker Desktop uses Linux containers.

## 9. Date Preset Configuration (Dashboard Options)

For quick date buttons (`date_from`/`date_to`), set dashboard options:

```json
{
  "dateRangeQuickPresets": [
    {
      "key": "today",
      "label": "Today",
      "labelsByLocale": {
        "fr": "Aujourd'hui",
        "de": "Heute"
      },
      "visibleToGroupIds": [1, 2],
      "hideOnPublic": false
    },
    "current-week",
    "previous-week",
    "last-7-days",
    "year-to-date"
  ],
  "defaultDateRangeQuickPreset": "current-week"
}
```

Supported keys:

- `today`
- `current-week`
- `previous-week`
- `current-month`
- `previous-month`
- `last-7-days`
- `last-30-days`
- `this-quarter`
- `previous-quarter`
- `year-to-date`

Notes:

- String items are shorthand presets.
- Object items allow custom labels, localized labels, group visibility, and public visibility control.
- Default preset auto-applies only when URL does not already contain `p_date_from` or `p_date_to`.
