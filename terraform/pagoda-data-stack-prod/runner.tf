module "queryapi_runner_mainnet_container" {
  source  = "terraform-google-modules/container-vm/google"
  version = "v3.1.0"

  container = {
    args  = []
    image = "europe-west1-docker.pkg.dev/pagoda-data-stack-prod/queryapi/queryapi-runner:latest"

    env = [
      {
        name  = "AWS_ACCESS_KEY_ID"
        value = data.google_secret_manager_secret_version.queryapi_mainnet_lake_aws_access_key.secret_data
      },
      {
        name  = "AWS_SECRET_ACCESS_KEY"
        value = data.google_secret_manager_secret_version.queryapi_mainnet_lake_aws_secret_access_key.secret_data
      },
      {
        name  = "AWS_REGION"
        value = "eu-central-1"
      },
      {
        name  = "PGUSER"
        value = data.google_secret_manager_secret_version.queryapi_postgres_mainnet_admin_user.secret_data
      },
      {
        name  = "PGPASSWORD"
        value = data.google_secret_manager_secret_version.queryapi_postgres_mainnet_admin_password.secret_data
      },
      {
        name  = "PGDATABASE"
        value = "postgres"
      },
      {
        name  = "PGHOST"
        value = data.google_secret_manager_secret_version.queryapi_postgres_mainnet_host.secret_data
      },
      {
        name  = "PGHOST_PGBOUNCER"
        value = "0.0.0.0"
      },
      {
        name  = "PGHOST_HASURA"
        value = data.google_secret_manager_secret_version.queryapi_postgres_mainnet_host.secret_data
      },
      {
        name  = "PGPORT"
        value = "5432"
      },
      {
        name  = "PGPORT_PGBOUNCER"
        value = "6432"
      },
      {
        name  = "PGPORT_HASURA"
        value = "5432"
      },
      {
        name  = "MAX_PG_POOL_SIZE"
        value = "20"
      },
      {
        name  = "HASURA_ADMIN_SECRET"
        value = data.google_secret_manager_secret_version.queryapi_hasura_mainnet_admin_secret_value.secret_data
      },
      {
        name  = "HASURA_ENDPOINT"
        value = google_cloud_run_service.queryapi_hasura_graphql_mainnet.status[0].url
      },
      {
        name  = "REDIS_CONNECTION_STRING"
        value = data.google_secret_manager_secret_version.queryapi_mainnet_redis_connection_string.secret_data
      },
      {
        name  = "PORT"
        value = "9180"
      },
      {
        name  = "GRPC_SERVER_PORT"
        value = "7001"
      },
      {
        name  = "PREFETCH_QUEUE_LIMIT"
        value = "10"
      },
      {
        name  = "CRON_DATABASE"
        value = "cron"
      },
      {
        name  = "TRACING_EXPORTER"
        value = "NO-OP"
      },
      {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      },
      {
        name  = "TRACING_SAMPLE_RATE"
        value = "0"
      },
      {
        name  = "GCP_LOGGING_ENABLED"
        value = "true"
      },
      {
        name  = "NEAR_RPC_ENDPOINT"
        value = "https://beta.rpc.mainnet.near.org"
      }
    ]
  }
  restart_policy = "Always"
}

resource "google_compute_address" "queryapi_runner_mainnet_static_ip" {
  name         = "queryapi-runner-static-ip"
  region       = "europe-west1"
  address      = "10.161.0.18"
  address_type = "INTERNAL"
  subnetwork   = data.google_compute_subnetwork.prod_eu_subnetwork.id
}

resource "google_compute_instance" "queryapi_runner_mainnet" {
  project                   = var.project_id
  name                      = "queryapi-runner-mainnet"
  machine_type              = "n2-custom-22-173056"
  zone                      = "europe-west1-b"
  allow_stopping_for_update = "true"

  boot_disk {
    initialize_params {
      image = module.queryapi_runner_mainnet_container.source_image
    }
  }

  lifecycle {
    ignore_changes = [
      boot_disk[0].initialize_params[0].image,
    ]
  }

  network_interface {
    subnetwork_project = "pagoda-shared-infrastructure"
    subnetwork         = data.google_compute_subnetwork.prod_eu_subnetwork.id # "prod-europe-west1"
    network_ip         = google_compute_address.queryapi_runner_mainnet_static_ip.address
    access_config {}
  }

  metadata = {
    gce-container-declaration = module.queryapi_runner_mainnet_container.metadata_value
    google-logging-enabled    = "true"
    google-monitoring-enabled = "true"
  }

  tags = ["prod", "mainnet", "queryapi"]

  service_account {
    email = data.google_service_account.queryapi_sa.email
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
    ]
  }

  metadata_startup_script = <<EOH
    # Set sysctl parameter and run Docker container with the adjusted setting
    sysctl -w vm.max_map_count=655300

    # Pull the pgBouncer image
    docker pull darunrs/pgbouncer:auth_dbname

    # Run the pgBouncer container
    docker run -d --rm --network="host" --log-driver none --name pgbouncer \
      -e LISTEN_PORT=6432 \
      -e DB_HOST=${google_sql_database_instance.queryapi_postgres_mainnet.ip_address.0.ip_address} \
      -e DB_USER=pgbouncer \
      -e DB_PASSWORD=${random_password.queryapi_postgres_mainnet_pgbouncer_password.result} \
      -e ADMIN_USERS=postgres \
      -e DB_NAME="*" \
      -e AUTH_TYPE=scram-sha-256 \
      -e AUTH_FILE=/etc/pgbouncer/userlist.txt \
      -e AUTH_USER=pgbouncer \
      -e AUTH_QUERY="SELECT uname, phash FROM public.user_lookup(\$1::text)" \
      -e AUTH_DBNAME=postgres \
      -e MAX_CLIENT_CONN=4000 \
      -e DEFAULT_POOL_SIZE=20 \
      darunrs/pgbouncer:auth_dbname
  EOH
}

resource "google_compute_firewall" "queryapi_runner_mainnet_http_access" {
  name    = "queryapi-runner-mainnet-access"
  project = "pagoda-shared-infrastructure"
  network = data.google_compute_network.prod_network.name

  allow {
    protocol = "tcp"
    ports = [
      "22",   # SSH
      "9180", # Prometheus API
    ]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["queryapi"]
}

