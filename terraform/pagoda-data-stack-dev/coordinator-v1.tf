#TODO: Remove this file
module "gce-container" {
  source  = "terraform-google-modules/container-vm/google"
  version = "v3.1.0"

  container = {
    args  = ["mainnet", "from-interruption"]
    image = "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator-v1:latest"

    env = [
      {
        name  = "DATABASE_URL"
        value = data.google_secret_manager_secret_version.queryapi_testnet_database_url.secret_data
      },
      {
        name  = "AWS_ACCESS_KEY_ID"
        value = data.google_secret_manager_secret_version.queryapi_testnet_lake_aws_access_key.secret_data
      },
      {
        name  = "AWS_SECRET_ACCESS_KEY"
        value = data.google_secret_manager_secret_version.queryapi_testnet_lake_aws_secret_access_key.secret_data
      },
      {
        name  = "AWS_REGION"
        value = "eu-central-1"
      },
      {
        name = "REDIS_CONNECTION_STRING"
        #        value = module.redis.redis_host_ip
        value = data.google_secret_manager_secret_version.queryapi_testnet_redis_connection_string.secret_data
      },
      {
        name  = "REGISTRY_CONTRACT_ID"
        value = "dev-queryapi.dataplatform.near"
      },
      {
        name  = "PORT"
        value = "9180"
      }
    ]
  }
  restart_policy = "Always"
}

resource "google_compute_address" "queryapi_static_ip" {
  name         = "queryapi-coordinator-static-ip"
  region       = "europe-west1"
  address      = "10.101.0.104"
  address_type = "INTERNAL"
  subnetwork   = data.google_compute_subnetwork.dev_eu_subnetwork.id
}

resource "google_compute_firewall" "http-access" {
  name    = "queryapi-coordinator-access"
  project = "pagoda-shared-infrastructure"
  network = data.google_compute_network.dev_network.name

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

