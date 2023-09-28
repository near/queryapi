SET check_function_bodies = false;

CREATE TABLE public.indexer_log_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    function_name text NOT NULL,
    block_height numeric NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    message text
);

CREATE TABLE public.indexer_state (
    function_name character varying NOT NULL,
    current_block_height numeric(21,0) NOT NULL,
    status text,
    current_historical_block_height numeric(21,0)
);

ALTER TABLE ONLY public.indexer_log_entries
    ADD CONSTRAINT indexer_log_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.indexer_state
    ADD CONSTRAINT indexer_state_pkey PRIMARY KEY (function_name);

CREATE INDEX idx_function_name ON indexer_log_entries(function_name);
CREATE INDEX idx_timestamp ON indexer_log_entries("timestamp");
