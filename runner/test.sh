#!/bin/bash

# PostgreSQL superuser credentials
PG_SUPERUSER="postgres"
PG_SUPERUSER_PASSWORD="postgrespassword"

# Exclude these databases and users
EXCLUDED_DATABASES="'postgres', 'template0', 'template1'"
EXCLUDED_USERS="'postgres'"

# Get a list of databases, excluding the defaults
DATABASES=$(psql -U $PG_SUPERUSER -t -c "SELECT datname FROM pg_database WHERE datname NOT IN ($EXCLUDED_DATABASES);")

# Get a list of users, excluding 'postgres'
USERS=$(psql -U $PG_SUPERUSER -t -c "SELECT usename FROM pg_user WHERE usename NOT IN ($EXCLUDED_USERS);")

# Drop each database
for db in $DATABASES; do
    echo "Dropping database: $db"
    psql -U $PG_SUPERUSER -c "DROP DATABASE IF EXISTS $db;"
done

# Drop each user
for user in $USERS; do
    echo "Dropping user: $user"
    psql -U $PG_SUPERUSER -c "DROP USER IF EXISTS $user;"
done

echo "All non-default databases and users have been dropped."
