module "queryapi-coordinator-mainnet-container" {
  source  = "terraform-google-modules/container-vm/google"
  version = "v3.1.0"

  container = {
    args  = []
    image = "europe-west1-docker.pkg.dev/pagoda-data-stack-prod/queryapi/queryapi-coordinator:latest"

    env = [
      {
        name  = "REDIS_URL"
        value = data.google_secret_manager_secret_version.queryapi_mainnet_redis_connection_string.secret_data
      },
      {
        name  = "REGISTRY_CONTRACT_ID"
        value = "queryapi.dataplatform.near"
      },
      {
        name  = "BLOCK_STREAMER_URL",
        value = "http://${google_compute_instance.queryapi_block_streamer_mainnet.network_interface[0].network_ip}:8002"
      },
      {
        name  = "RUNNER_URL",
        value = "http://${google_compute_instance.queryapi_runner_mainnet.network_interface[0].network_ip}:7001",
      },
      {
        name  = "RPC_URL",
        value = "https://rpc.mainnet.near.org"
      },
      {
        name  = "RUST_LOG",
        value = "info"
      },
      {
        name  = "GRPC_PORT",
        value = "9003"
      },
      {
        name  = "GCP_LOGGING_ENABLED",
        value = "true"
      }
    ]
  }
  restart_policy = "Always"
}

resource "google_compute_address" "queryapi_coordinator_mainnet_static_ip" {
  name         = "queryapi-coordinator-mainnet-static-ip"
  region       = "europe-west1"
  address      = "10.161.0.65"
  address_type = "INTERNAL"
  subnetwork   = data.google_compute_subnetwork.prod_eu_subnetwork.id
}

resource "google_compute_instance" "queryapi-coordinator-mainnet" {
  project                   = var.project_id
  name                      = "queryapi-coordinator-mainnet"
  machine_type              = "e2-medium"
  zone                      = "europe-west1-b"
  allow_stopping_for_update = "true"

  boot_disk {
    initialize_params {
      image = module.queryapi-coordinator-mainnet-container.source_image
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
    network_ip         = google_compute_address.queryapi_coordinator_mainnet_static_ip.address
    access_config {}
  }

  metadata = {
    gce-container-declaration = module.queryapi-coordinator-mainnet-container.metadata_value
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
