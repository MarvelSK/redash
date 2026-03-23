# People Counter ETL migration

This workspace now contains a Python ETL that replaces the original VBA + Access + MS SQL flow.

## What changed

- ZIP ingestion stays in place.
- Excel parsing stays in place.
- Access tables are replaced by MySQL tables.
- Power BI is removed from the flow.
- MS SQL sales lookup is removed from the flow. The target schema keeps `sales_net` as nullable for future non-Microsoft enrichment.
- Redash can read directly from MySQL tables or from dedicated reporting views.

## Files

- `people_counter_etl.py`: main ETL and database seed entrypoint
- `mysql_schema.sql`: MySQL schema with Redash-friendly views
- `mysql_seed.sql`: baseline shop seed data
- `.env.example`: environment variable template
- `requirements.txt`: Python dependencies

## Suggested MySQL flow

1. Create a MySQL user and database access for the ETL.
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Set environment variables from `.env.example`.
4. Create schema and seed baseline data:

   ```bash
   python people_counter_etl.py seed
   ```

5. Run ETL:

   ```bash
   python people_counter_etl.py run --single-zip
   ```

## Local Docker demo

1. Start MySQL and Redash dependencies:

   ```bash
   docker compose up -d mysql redash-postgres redash-redis
   ```

2. Initialize Redash metadata database, then start Redash services:

   ```bash
   docker compose run --rm redash-server create_db
   docker compose up -d redash-server redash-worker redash-scheduler
   ```

3. Generate a local demo ZIP with a sample Excel workbook:

   ```bash
   python generate_demo_fixture.py
   ```

4. Point the ETL to the local demo source and Docker MySQL, then seed schema and run ETL.

5. In Redash, add a MySQL data source against host `host.docker.internal`, port `3306`, database `people_counter`, user `people_counter`.

   If you run the demo Redash from this repository, open it on `http://localhost:5001` to avoid conflicts with any existing Redash on port `5000`.

6. Query the Redash views:

   ```sql
   SELECT * FROM redash_daily_summary ORDER BY kpi_date DESC;
   ```

## Redash datasets

Redash can point to:

- `redash_daily_summary`
- `redash_hourly_summary`
- `redash_age_summary`

For an already running Redash instance, use the setup in [REDASH_SETUP.md](REDASH_SETUP.md) and the ready-made SQL in [redash_queries.sql](redash_queries.sql).

## Notes

- The original VBA code matched shops from ZIP names using `cfg_shops.shop_name`; the Python version keeps that behavior.
- The ETL still processes one ZIP by default when `--single-zip` is used.
- Excel handling expects the same workbook layout as the original VBA logic.
- If you need sales data in Redash later, add a non-Microsoft source importer and populate `kpi_daily_overview.sales_net`.
- Docker Compose includes the full Redash runtime, but the ETL itself only depends on MySQL.