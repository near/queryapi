FROM postgres:14

RUN apt-get update && apt-get install -y postgresql-14-cron

RUN echo "shared_preload_libraries = 'pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample

COPY ./init.sql /docker-entrypoint-initdb.d/

EXPOSE 5432

CMD ["postgres"]
