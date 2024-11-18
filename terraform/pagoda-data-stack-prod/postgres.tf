resource "random_password" "queryapi_postgres_mainnet_admin_password" {
  length  = 16
  special = false
}

resource "random_password" "queryapi_postgres_mainnet_pgbouncer_password" {
  length  = 16
  special = false
}

resource "random_password" "queryapi_postgres_mainnet_default_password" {
  length  = 16
  special = false
}

resource "random_password" "queryapi_postgres_mainnet_metadata_password" {
  length  = 16
  special = false
}

resource "google_sql_user" "queryapi_postgres_mainnet_admin_user" {
  name     = "admin"
  instance = google_sql_database_instance.queryapi_postgres_mainnet.name
  password = random_password.queryapi_postgres_mainnet_admin_password.result
}

resource "google_sql_database" "queryapi_postgres_mainnet_cron_database" {
  name      = "cron"
  instance  = google_sql_database_instance.queryapi_postgres_mainnet.name
  collation = "en_US.UTF8"

  provisioner "local-exec" {
    environment = {
      PGPASSWORD = random_password.queryapi_postgres_mainnet_admin_password.result
    }

    command = <<EOH
      psql -h ${google_sql_database_instance.queryapi_postgres_mainnet.ip_address.0.ip_address} -U admin -d 'cron' -c "
        CREATE EXTENSION IF NOT EXISTS pg_cron;
      "
    EOH
  }
}

resource "google_sql_database" "queryapi_postgres_mainnet_default_database" {
  name      = "default"
  instance  = google_sql_database_instance.queryapi_postgres_mainnet.name
  collation = "en_US.UTF8"
}

resource "google_sql_user" "queryapi_postgres_mainnet_default_user" {
  name     = "default"
  instance = google_sql_database_instance.queryapi_postgres_mainnet.name
  password = random_password.queryapi_postgres_mainnet_default_password.result

  provisioner "local-exec" {
    environment = {
      PGPASSWORD = random_password.queryapi_postgres_mainnet_admin_password.result
    }

    command = <<EOH
      psql -h ${google_sql_database_instance.queryapi_postgres_mainnet.ip_address.0.ip_address} -U admin -d 'default' -c "
        ALTER USER \"default\" NOCREATEDB;
        ALTER USER \"default\" NOCREATEROLE;
        REVOKE cloudsqlsuperuser FROM \"default\";
        REVOKE CONNECT ON DATABASE \"default\" FROM PUBLIC;
        GRANT ALL PRIVILEGES ON DATABASE \"default\" TO \"default\";
      "
    EOH
  }
}

resource "google_sql_database" "queryapi_postgres_mainnet_metadata_database" {
  name      = "metadata"
  instance  = google_sql_database_instance.queryapi_postgres_mainnet.name
  collation = "en_US.UTF8"
}

resource "google_sql_user" "queryapi_postgres_mainnet_metadata_user" {
  name     = "metadata"
  instance = google_sql_database_instance.queryapi_postgres_mainnet.name
  password = random_password.queryapi_postgres_mainnet_metadata_password.result

  provisioner "local-exec" {
    environment = {
      PGPASSWORD = random_password.queryapi_postgres_mainnet_admin_password.result
    }

    command = <<EOH
      psql -h ${google_sql_database_instance.queryapi_postgres_mainnet.ip_address.0.ip_address} -U admin -d 'metadata' -c "
        ALTER USER \"metadata\" NOCREATEDB;
        ALTER USER \"metadata\" NOCREATEROLE;
        REVOKE cloudsqlsuperuser FROM \"metadata\";
        REVOKE CONNECT ON DATABASE \"metadata\" FROM PUBLIC;
        GRANT ALL PRIVILEGES ON DATABASE \"metadata\" TO \"metadata\";
      "
    EOH
  }
}

resource "google_sql_user" "queryapi_postgres_mainnet_pgbouncer_user" {
  name     = "pgbouncer"
  instance = google_sql_database_instance.queryapi_postgres_mainnet.name
  password = random_password.queryapi_postgres_mainnet_pgbouncer_password.result

  provisioner "local-exec" {
    environment = {
      PGPASSWORD = random_password.queryapi_postgres_mainnet_pgbouncer_password.result
    }

    command = <<EOH
      psql -h ${google_sql_database_instance.queryapi_postgres_mainnet.ip_address.0.ip_address} -U pgbouncer -d 'postgres' -c '
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
      '
    EOH
  }
}

resource "google_sql_database_instance" "queryapi_postgres_mainnet" {
  name             = "queryapi-mainnet"
  database_version = "POSTGRES_14"
  region           = "europe-west1"

  settings {
    activation_policy = "ALWAYS"
    availability_type = "REGIONAL"
    disk_autoresize   = true
    pricing_plan      = "PER_USE"
    tier              = "db-custom-8-32768"

    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = false
      record_client_address   = true
    }

    database_flags {
      name  = "random_page_cost"
      value = "1.1"
    }
    database_flags {
      name  = "work_mem"
      value = "16384"
    }

    database_flags {
      name  = "cloudsql.enable_pg_cron"
      value = "on"
    }

    database_flags {
      name  = "cron.database_name"
      value = "cron"
    }
    database_flags {
      name  = "cloudsql.pg_shadow_select_role"
      value = "pgbouncer"
    }

    ip_configuration {
      authorized_networks {
        name  = "allow_all"
        value = "0.0.0.0/0"
      }
    }
  }
}

output "queryapi_postgres_mainnet_admin_password" {
  value     = random_password.queryapi_postgres_mainnet_admin_password.result
  sensitive = true
}

output "queryapi_postgres_mainnet_default_password" {
  value     = random_password.queryapi_postgres_mainnet_default_password.result
  sensitive = true
}

output "queryapi_postgres_mainnet_metadata_password" {
  value     = random_password.queryapi_postgres_mainnet_metadata_password.result
  sensitive = true
}

output "queryapi_postgres_mainnet_pgbouncer_password" {
  value     = random_password.queryapi_postgres_mainnet_pgbouncer_password.result
  sensitive = true
}
