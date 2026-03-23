USE people_counter;

INSERT INTO cfg_shops (shop_id, shop_name, active, redash_label)
VALUES
    ('TIVOLI', 'Tivoli', 1, 'Tivoli'),
    ('ZURICH', 'Zurich', 1, 'Zurich')
ON DUPLICATE KEY UPDATE
    shop_name = VALUES(shop_name),
    active = VALUES(active),
    redash_label = VALUES(redash_label);