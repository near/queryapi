CREATE TYPE alert_rule_kind AS ENUM(
    'ACTIONS', -- RECEIPTS Action (receipts)
    'EVENTS' --- Event(execution outcome logs)
    --- ACCOUNT_BALANCES state change (accounts)
);

CREATE TYPE chain_id AS ENUM (
    'MAINNET',
    'TESTNET'
);

CREATE TYPE destination_type AS ENUM(
    'WEBHOOK'
    --- 'SLACK',
    --- 'TELEGRAM',
    --- 'EMAIL',
);

CREATE TABLE alert_rules (
    id serial PRIMARY KEY,
    name text NOT NULL,
    chain_id chain_id NOT NULL,
    alert_rule_kind alert_rule_kind NOT NULL,
    matching_rule json NOT NULL,
    is_paused bool NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE destinations (
    id serial PRIMARY KEY,
    name text NOT NULL,
    active bool NOT NULL DEFAULT true,
    type notification_channel_kind NOT NULL
);

CREATE TABLE enabled_destinations (
    id serial PRIMARY KEY,
    alert_id int NOT NULL,
    destination_id int NOT NULL,
    FOREIGN KEY (destination_id) REFERENCES destinations (id),
    FOREIGN KEY (alert_id) REFERENCES alert_rules (id)
);

CREATE TABLE triggered_alerts (
    id serial PRIMARY KEY,
    alert_id int NOT NULL,
    triggered_in_block_hash text NOT NULL,
    triggered_in_transaction_hash text,
    triggered_in_receipt_id text,
    triggered_at timestamptz NOT NULL,
    FOREIGN KEY (alert_id) REFERENCES alert_rules (id)
);

CREATE TABLE triggered_alerts_destinations (
    triggered_alert_id int NOT NULL,
    alert_id int NOT NULL,
    destination_id int NOT NULL,
    status int NOT NULL,
    response text NOT NULL,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (triggered_alert_id) REFERENCES triggered_alerts (id),
    FOREIGN KEY (alert_id) REFERENCES alert_rules (id),
    FOREIGN KEY (destination_id) REFERENCES destinations (id)
);

ALTER TABLE triggered_alerts_destinations
    ADD CONSTRAINT triggered_alerts_destinations_pk PRIMARY KEY (triggered_alert_id, alert_id, destination_id);

