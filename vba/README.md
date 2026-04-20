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

## Windows scheduled run

The ETL already archives processed ZIP files. In `people_counter_etl.py`, each successfully processed ZIP is moved to the `archive` folder after parsing and database write.

Two helper scripts are included for Windows Task Scheduler:

- `run_people_counter_etl.ps1`: runs `people_counter_etl.py run`, optionally loading variables from `.env`, and writes logs to `runtime/logs`.
- `register_people_counter_task.ps1`: creates a daily Scheduled Task that calls the runner script.

### 1) Prepare environment

From this `vba` folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` with your MySQL and folder paths.

### 2) Test ETL runner manually

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run_people_counter_etl.ps1
```

Optional single-zip test:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run_people_counter_etl.ps1 -SingleZip
```

### 3) Register daily schedule

Example: run every day at 06:30.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\register_people_counter_task.ps1 -TaskName PeopleCounterETL -RunAt 06:30
```

Optional flags for the task:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\register_people_counter_task.ps1 -TaskName PeopleCounterETL -RunAt 06:30 -SingleZip -VerboseLogging
```

### 4) Validate and operate task

```powershell
Get-ScheduledTask -TaskName PeopleCounterETL
Start-ScheduledTask -TaskName PeopleCounterETL
Get-ScheduledTaskInfo -TaskName PeopleCounterETL
```

Logs are written to `runtime/logs`.