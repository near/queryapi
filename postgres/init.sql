-- pgbouncer
CREATE ROLE pgbouncer LOGIN;
ALTER ROLE pgbouncer WITH PASSWORD 'pgbouncer';
CREATE OR REPLACE FUNCTION public.user_lookup(in i_username text, out uname text, out phash text)
RETURNS record AS $$
BEGIN
    SELECT usename, passwd FROM pg_catalog.pg_shadow
    WHERE usename = i_username INTO uname, phash;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.user_lookup(text) FROM public;
GRANT EXECUTE ON FUNCTION public.user_lookup(text) TO pgbouncer;

-- pg_cron
CREATE EXTENSION pg_cron;
