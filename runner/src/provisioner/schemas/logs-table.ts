export const logsTableDDL = (schemaName: string): string => `
CREATE TABLE __logs (
    id BIGSERIAL NOT NULL,
    block_height NUMERIC(20),
    date DATE NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    type TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    PRIMARY KEY (date, id)
) PARTITION BY RANGE (date);

CREATE INDEX __logs_timestamp_idx ON __logs USING btree (timestamp);
CREATE INDEX __logs_type_idx ON __logs USING btree (type);
CREATE INDEX __logs_level_idx ON __logs USING btree (level);
CREATE INDEX __logs_block_height_idx ON __logs USING btree (block_height);
CREATE INDEX __logs_search_vector_idx ON __logs USING GIN (to_tsvector('english', message));


CREATE OR REPLACE FUNCTION fn_create_partition(_tbl text, _date date, _interval_start text, _interval_end text)
RETURNS void
LANGUAGE plpgsql AS
$func$
DECLARE
_start text;
_end text;
_partition_name text;
BEGIN
_start := TO_CHAR(date_trunc('day', _date + (_interval_start)::interval), 'YYYY-MM-DD');
  _end := TO_CHAR(date_trunc('day', _date + (_interval_end)::interval), 'YYYY-MM-DD');
_partition_name := TO_CHAR(date_trunc('day', _date + (_interval_start)::interval), 'YYYYMMDD');
-- Create partition 
EXECUTE 'CREATE TABLE IF NOT EXISTS ' || _tbl || '_p' || _partition_name || ' PARTITION OF ' || _tbl || ' FOR VALUES FROM (''' || _start || ''') TO (''' || _end || ''')';
END
$func$;

SELECT fn_create_partition('${schemaName}.__logs', CURRENT_DATE, '0 day', '1 day');
SELECT fn_create_partition('${schemaName}.__logs', CURRENT_DATE, '1 day', '2 day');

CREATE OR REPLACE FUNCTION fn_delete_partition(_tbl text, _date date, _interval_start text, _interval_end text)
RETURNS void
LANGUAGE plpgsql AS
$func$
DECLARE
_start text;
_end text;
_partition_name text;
BEGIN
_start := TO_CHAR(date_trunc('day', _date + (_interval_start)::interval), 'YYYY-MM-DD');
_end := TO_CHAR(date_trunc('day', _date + (_interval_end)::interval), 'YYYY-MM-DD');
_partition_name := TO_CHAR(date_trunc('day', _date + (_interval_start)::interval), 'YYYYMMDD');
-- Detach partition 
EXECUTE 'ALTER TABLE ' || _tbl || ' DETACH PARTITION ' || _tbl || '_p' || _partition_name;
EXECUTE 'DROP TABLE '  || _tbl || '_p' || _partition_name;
END
$func$;
`;
