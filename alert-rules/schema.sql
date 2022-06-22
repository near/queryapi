CREATE TYPE alert_rule_kind AS ENUM(
    'ACTIONS', -- RECEIPTS Action (receipts)
    'EVENTS' --- Event(execution outcome logs)
    --- ACCOUNT_BALANCES state change (accounts)
);

CREATE TYPE chain_id AS ENUM (
    'MAINNET',
    'TESTNET'
);

CREATE TYPE notification_channel_kind AS ENUM(
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
-- --- DevConsole
-- description text NOT NULL,
-- environment_id integer NOT NULL
-- active bool NOT NULL, --- soft delete

-- created_at datetime NOT NULL,
-- created_by integer NOT NULL
-- updated_by integer NOT NULL
-- ---

CREATE TABLE alert_notification_channel (
    id serial PRIMARY KEY,
    alert_rule_id serial NOT NULL,
    channel notification_channel_kind NOT NULL,
    channel_parameters json NOT NULL,
    --- WEBHOOK {"endpoint": url}
    FOREIGN KEY (alert_rule_id) REFERENCES alert_rules (id)
);
