CREATE DATABASE IF NOT EXISTS people_counter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE people_counter;

CREATE TABLE IF NOT EXISTS cfg_shops (
    shop_id VARCHAR(32) NOT NULL PRIMARY KEY,
    shop_name VARCHAR(128) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    redash_label VARCHAR(128) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kpi_daily_overview (
    shop_id VARCHAR(32) NOT NULL,
    kpi_date DATE NOT NULL,
    visitors_total INT NOT NULL DEFAULT 0,
    visitors_male INT NOT NULL DEFAULT 0,
    visitors_female INT NOT NULL DEFAULT 0,
    visitors_unknown INT NOT NULL DEFAULT 0,
    sales_net DECIMAL(14,2) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (shop_id, kpi_date),
    CONSTRAINT fk_daily_shop FOREIGN KEY (shop_id) REFERENCES cfg_shops(shop_id)
);

CREATE TABLE IF NOT EXISTS kpi_age_distribution (
    shop_id VARCHAR(32) NOT NULL,
    kpi_date DATE NOT NULL,
    age_bucket VARCHAR(64) NOT NULL,
    visitors_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (shop_id, kpi_date, age_bucket),
    CONSTRAINT fk_age_shop FOREIGN KEY (shop_id) REFERENCES cfg_shops(shop_id)
);

CREATE TABLE IF NOT EXISTS kpi_hourly_visitors (
    shop_id VARCHAR(32) NOT NULL,
    kpi_date DATE NOT NULL,
    visit_hour VARCHAR(32) NOT NULL,
    visitors_male INT NOT NULL DEFAULT 0,
    visitors_female INT NOT NULL DEFAULT 0,
    visitors_unknown INT NOT NULL DEFAULT 0,
    visitors_total INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (shop_id, kpi_date, visit_hour),
    CONSTRAINT fk_hourly_shop FOREIGN KEY (shop_id) REFERENCES cfg_shops(shop_id)
);

CREATE TABLE IF NOT EXISTS etl_import_log (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_timestamp DATETIME NOT NULL,
    shop_id VARCHAR(32) NULL,
    kpi_date DATE NULL,
    status VARCHAR(16) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_log_run_timestamp (run_timestamp),
    KEY idx_log_shop_date (shop_id, kpi_date)
);

CREATE OR REPLACE VIEW redash_daily_summary AS
SELECT
    d.shop_id,
    s.shop_name,
    s.redash_label,
    d.kpi_date,
    d.visitors_total,
    d.visitors_male,
    d.visitors_female,
    d.visitors_unknown,
    d.sales_net
FROM kpi_daily_overview d
JOIN cfg_shops s ON s.shop_id = d.shop_id;

CREATE OR REPLACE VIEW redash_hourly_summary AS
SELECT
    h.shop_id,
    s.shop_name,
    h.kpi_date,
    h.visit_hour,
    h.visitors_total,
    h.visitors_male,
    h.visitors_female,
    h.visitors_unknown
FROM kpi_hourly_visitors h
JOIN cfg_shops s ON s.shop_id = h.shop_id;

CREATE OR REPLACE VIEW redash_age_summary AS
SELECT
    a.shop_id,
    s.shop_name,
    a.kpi_date,
    a.age_bucket,
    a.visitors_count
FROM kpi_age_distribution a
JOIN cfg_shops s ON s.shop_id = a.shop_id;