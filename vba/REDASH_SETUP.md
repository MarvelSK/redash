# Existing Redash setup

Your existing Redash on `http://localhost:5000` is reachable but redirects to login, so datasource creation requires your Redash admin session.

## MySQL datasource settings

Use these values in Redash when adding a new MySQL data source:

- Name: `People Counter MySQL`
- Host: `host.docker.internal`
- Port: `3306`
- Database name: `people_counter`
- User: `people_counter`
- Password: `change_me`

If your Redash is not running in Docker, you can also use:

- Host: `127.0.0.1`
- Port: `3306`

## Test query

Use this as the first validation query inside Redash:

```sql
SELECT *
FROM redash_daily_summary
ORDER BY kpi_date DESC, shop_id;
```

Expected demo result after the local ETL test:

- `shop_id = ZURICH`
- `kpi_date = 2026-03-10`
- `visitors_total = 270`

## Recommended Redash queries

The file [redash_queries.sql](redash_queries.sql) contains ready-made queries for:

- daily summary
- hourly traffic
- age distribution
- ETL status monitoring

## Notes

- The datasource should point to the MySQL views, not directly to raw tables, unless you want low-level operational analysis.
- If you later move MySQL to a dedicated server, change only the Redash datasource host and keep the same schema.