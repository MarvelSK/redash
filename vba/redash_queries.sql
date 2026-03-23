-- Daily traffic summary
SELECT
    shop_id,
    shop_name,
    kpi_date,
    visitors_total,
    visitors_male,
    visitors_female,
    visitors_unknown,
    sales_net
FROM redash_daily_summary
ORDER BY kpi_date DESC, shop_id;


-- Daily trend by shop
SELECT
    kpi_date,
    shop_id,
    visitors_total
FROM redash_daily_summary
WHERE shop_id = 'ZURICH'
ORDER BY kpi_date;


-- Hourly traffic for a selected day
SELECT
    shop_id,
    shop_name,
    kpi_date,
    visit_hour,
    visitors_total,
    visitors_male,
    visitors_female,
    visitors_unknown
FROM redash_hourly_summary
WHERE kpi_date = '2026-03-10'
ORDER BY shop_id, visit_hour;


-- Age distribution for a selected day
SELECT
    shop_id,
    shop_name,
    kpi_date,
    age_bucket,
    visitors_count
FROM redash_age_summary
WHERE kpi_date = '2026-03-10'
ORDER BY shop_id, age_bucket;


-- ETL monitoring
SELECT
    run_timestamp,
    shop_id,
    kpi_date,
    status,
    message
FROM etl_import_log
ORDER BY run_timestamp DESC
LIMIT 50;


-- ETL errors only
SELECT
    run_timestamp,
    shop_id,
    kpi_date,
    message
FROM etl_import_log
WHERE status = 'ERROR'
ORDER BY run_timestamp DESC
LIMIT 50;