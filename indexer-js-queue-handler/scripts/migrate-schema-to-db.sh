#!/bin/bash

set -e

export PGUSER=postgres
export PGPASSWORD=postgrespassword
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=postgres

PASSWORD_LENGTH=12

if [ $# -eq 0 ]
then
  echo "Please pass schema name as first argument"
  exit 1
fi

SCHEMA=$1 
echo "Processing schema $SCHEMA..."

ACCOUNT=${SCHEMA%_near_*}
INDEXER=${SCHEMA#*_near_}

DATABASE="${ACCOUNT}_near"
USER="$DATABASE"
PASSWORD=$(openssl rand -base64 $PASSWORD_LENGTH | tr -d '/+' | cut -c 1-$PASSWORD_LENGTH)

DB_EXISTS=$(psql -t -c "SELECT 1 FROM pg_database WHERE datname='$DATABASE'")
if [[ -z "$DB_EXISTS" ]]; then
    echo "Database $DATABASE does not exist, creating it..."

    echo "Creating user $USER with password $PASSWORD"
    psql --command="CREATE USER \"$USER\" WITH PASSWORD '$PASSWORD';"

    createdb --owner="$USER" --template=template0 "$DATABASE"

    echo "Restricting connection to database $DATABASE to $USER..."
    psql --command="REVOKE CONNECT ON DATABASE \"$DATABASE\" FROM PUBLIC;"
    psql --command="GRANT ALL PRIVILEGES ON DATABASE \"$DATABASE\" TO \"$USER\";"
else
    echo "Database $DATABASE already exists, skipping creation..."
fi

echo "Dumping schema $SCHEMA..."
pg_dump --schema=$SCHEMA --file="$SCHEMA.sql"

echo "Restoring schema $SCHEMA in $DATABASE..."
psql --dbname=$DATABASE < "$SCHEMA.sql"

echo "Renaming schema to $INDEXER..."
psql --dbname=$DATABASE --command="ALTER SCHEMA \"$SCHEMA\" RENAME TO \"$INDEXER\";"

echo "Changing schema ownership to $USER..."
psql --dbname=$DATABASE --command "
  ALTER SCHEMA \"$INDEXER\" OWNER TO \"$USER\";
  ALTER DEFAULT PRIVILEGES IN SCHEMA \"$INDEXER\" GRANT ALL ON TABLES TO \"$USER\";
"

echo "Changing ownership of all tables in $INDEXER to $USER"
psql --dbname=$DATABASE <<EOF
DO
\$\$
DECLARE 
    table_name text;
    l_schema text := '$INDEXER';
    l_user text := '$USER';
BEGIN 
    FOR table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = l_schema)
    LOOP 
        RAISE NOTICE 'Altering table: %', table_name;
        EXECUTE format('ALTER TABLE %I.%I OWNER TO %I', l_schema, table_name, l_user); 
    END LOOP;
END 
\$\$
EOF
