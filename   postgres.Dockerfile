FROM postgres:14
RUN apt-get update && apt-get install -y postgresql-14-cron
EXPOSE 5432
CMD ["postgres", "-c", "shared_preload_libraries=pg_cron"]