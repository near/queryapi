FROM postgres:14

RUN apt-get update && apt-get install -y postgresql-14-cron

RUN echo "shared_preload_libraries = 'pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample

RUN echo "CREATE EXTENSION pg_cron;" > /docker-entrypoint-initdb.d/init-pg-cron.sql

EXPOSE 5432

CMD ["postgres"]
