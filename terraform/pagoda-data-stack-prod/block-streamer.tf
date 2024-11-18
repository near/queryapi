module "queryapi_block_streamer_mainnet_container" {
  source  = "terraform-google-modules/container-vm/google"
  version = "v3.1.0"

  container = {
    args  = []
    image = "europe-west1-docker.pkg.dev/pagoda-data-stack-prod/queryapi/queryapi-block-streamer:latest"

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
        name  = "REDIS_URL"
        value = data.google_secret_manager_secret_version.queryapi_mainnet_redis_connection_string.secret_data
      },
      {
        name  = "GRPC_PORT"
        value = "8002"
      },
      {
        name  = "METRICS_PORT"
        value = "9180"
      },
      {
        name  = "RUST_LOG"
        value = "info,aws_smithy_runtime=warn"
      },
      {
        name  = "GCP_LOGGING_ENABLED"
        value = "true"
      },
      {
        name  = "HASURA_GRAPHQL_ENDPOINT"
        value = "${google_cloud_run_service.queryapi_hasura_graphql_mainnet.status[0].url}/v1/graphql"
      }
    ]
    restart_policy = "Always"
  }
}

resource "google_compute_address" "queryapi_block_streamer_mainnet_static_ip" {
  name         = "queryapi-block-streamer-mainnet-static-ip"
  region       = "europe-west1"
  address      = "10.161.0.66"
  address_type = "INTERNAL"
  subnetwork   = data.google_compute_subnetwork.prod_eu_subnetwork.id
}

resource "google_compute_instance" "queryapi_block_streamer_mainnet" {
  project                   = var.project_id
  name                      = "queryapi-block-streamer-mainnet"
  machine_type              = "n2-custom-26-173056"
  zone                      = "europe-west1-b"
  allow_stopping_for_update = "true"

  boot_disk {
    initialize_params {
      image = module.queryapi_block_streamer_mainnet_container.source_image
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
    network_ip         = google_compute_address.queryapi_block_streamer_mainnet_static_ip.address
    access_config {}
  }

  metadata = {
    gce-container-declaration = module.queryapi_block_streamer_mainnet_container.metadata_value
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
}
