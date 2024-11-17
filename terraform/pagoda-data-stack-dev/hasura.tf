data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}

resource "google_cloud_run_service" "queryapi_hasura_auth_mainnet" {
  name     = "queryapi-hasura-auth-mainnet"
  location = "europe-west1"
  project  = var.project_id

  template {
    spec {
      containers {
        image = "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-hasura-auth:latest"

        env {
          name  = "DEFAULT_HASURA_ROLE"
          value = "append"
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  lifecycle {
    ignore_changes = [
      traffic,                                 # Ignore changes to the traffic block
      template[0].spec[0].containers[0].image, # Ignore image updates made via CI
      template[0].metadata                     # Ignore metadata updates made by Cloud Build
    ]
  }
}

resource "google_cloud_run_service_iam_policy" "queryapi_hasura_auth_mainnet_noauth" {
  location = google_cloud_run_service.queryapi_hasura_auth_mainnet.location
  project  = google_cloud_run_service.queryapi_hasura_auth_mainnet.project
  service  = google_cloud_run_service.queryapi_hasura_auth_mainnet.name

  policy_data = data.google_iam_policy.noauth.policy_data
}

output "queryapi_hasura_auth_mainnet_endpoint" {
  value = google_cloud_run_service.queryapi_hasura_auth_mainnet.status[0].url
}

resource "google_cloud_run_service" "queryapi_hasura_graphql_mainnet" {
  name     = "queryapi-hasura-graphql-mainnet"
  location = "europe-west1"
  project  = var.project_id

  template {
    spec {
      service_account_name = data.google_service_account.queryapi_sa.email
      containers {
        image = "index.docker.io/hasura/graphql-engine:v2.31.0"

        resources {
          limits = {
            cpu    = "2"
            memory = "4Gi"
          }
        }

        env {
          name = "HASURA_GRAPHQL_ADMIN_SECRET"
          value_from {
            secret_key_ref {
              name = data.google_secret_manager_secret.queryapi_hasura_mainnet_admin_secret.secret_id
              key  = "latest"
            }
          }
        }

        env {
          name = "HASURA_GRAPHQL_DATABASE_URL"
          value_from {
            secret_key_ref {
              name = data.google_secret_manager_secret.queryapi_postgres_mainnet_default_connection_url.secret_id
              key  = "latest"
            }
          }
        }

        env {
          name = "HASURA_GRAPHQL_METADATA_DATABASE_URL"
          value_from {
            secret_key_ref {
              name = data.google_secret_manager_secret.queryapi_postgres_mainnet_metadata_connection_url.secret_id
              key  = "latest"
            }
          }
        }

        env {
          name  = "HASURA_GRAPHQL_AUTH_HOOK"
          value = "${google_cloud_run_service.queryapi_hasura_auth_mainnet.status[0].url}/auth"
        }

        env {
          name  = "HASURA_GRAPHQL_ENABLE_CONSOLE"
          value = "true"
        }

        env {
          name  = "HASURA_GRAPHQL_SERVER_PORT"
          value = "8080"
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_cloud_run_service.queryapi_hasura_auth_mainnet,
    google_secret_manager_secret.queryapi_hasura_mainnet_admin_secret,
    google_secret_manager_secret.queryapi_postgres_mainnet_default_connection_url,
    google_secret_manager_secret.queryapi_postgres_mainnet_metadata_connection_url
  ]
}

resource "google_cloud_run_service_iam_policy" "queryapi_hasura_graphql_mainnet_noauth" {
  location = google_cloud_run_service.queryapi_hasura_graphql_mainnet.location
  project  = google_cloud_run_service.queryapi_hasura_graphql_mainnet.project
  service  = google_cloud_run_service.queryapi_hasura_graphql_mainnet.name

  policy_data = data.google_iam_policy.noauth.policy_data
}

output "queryapi_hasura_graphql_mainnet_endpoint" {
  value = google_cloud_run_service.queryapi_hasura_graphql_mainnet.status[0].url
}
