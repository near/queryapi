resource "google_cloudbuild_trigger" "queryapi_frontend_trigger" {
  name        = "queryapi-frontend"
  description = "Builds the queryapi frontend 'main' branch and deploys to queryapi-frontend"

  github {
    owner = "near"
    name  = "queryapi"
    push {
      branch = "^main"
    }
  }

  build {
    timeout = "2400s" # 40m
    # Build the container image and push to Artifact Registry
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["build", "-f", "frontend/Dockerfile",
        "--build-arg", "NEXT_PUBLIC_HASURA_ENDPOINT=${local.frontend_static_envs.NEXT_PUBLIC_HASURA_ENDPOINT}",
        "--build-arg", "NEXT_PUBLIC_REGISTRY_CONTRACT_ID=${local.frontend_static_envs.NEXT_PUBLIC_REGISTRY_CONTRACT_ID}",
      "-t", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-frontend:$COMMIT_SHA", "./frontend"]
      env = [
        "NEXT_PUBLIC_HASURA_ENDPOINT=${local.frontend_static_envs.NEXT_PUBLIC_HASURA_ENDPOINT}",
        "NEXT_PUBLIC_REGISTRY_CONTRACT_ID=${local.frontend_static_envs.NEXT_PUBLIC_REGISTRY_CONTRACT_ID}"
      ]
    }
    # Push to Artifact Registry
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["push", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-frontend:$COMMIT_SHA"]
    }
    # Tag commit hash
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["container", "images", "add-tag", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-frontend:$COMMIT_SHA", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-frontend:latest"]
    }
    # Deploy container image to Cloud Run
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["run", "deploy", "queryapi-frontend", "--image", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-frontend:$COMMIT_SHA", "--region", "europe-west1"]
    }

    artifacts {
      # Make built image part of the output Build Artifacts of the pipeline.
      images = ["us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-frontend:$COMMIT_SHA"]
    }
    options {
      machine_type = "E2_HIGHCPU_32"
    }
  }
}

locals {
  frontend_static_envs = {
    GCP                              = "true"
    NEXT_PUBLIC_REGISTRY_CONTRACT_ID = "dev-queryapi.dataplatform.near"
    NEXT_PUBLIC_HASURA_ENDPOINT      = "https://near-queryapi.dev.api.pagoda.co"
  }
  frontend_envs_from_secret = {}
}

resource "google_cloud_run_service" "queryapi_frontend" {
  provider                   = google-beta
  name                       = "queryapi-frontend"
  location                   = "europe-west1"
  project                    = var.project_id
  autogenerate_revision_name = true

  template {
    spec {
      service_account_name = "queryapi-frontend@pagoda-data-stack-dev.iam.gserviceaccount.com"
      containers {
        image = "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-frontend:latest"
        dynamic "env" {
          for_each = local.frontend_static_envs
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = local.frontend_envs_from_secret
          content {
            name = env.key
            value_from {
              secret_key_ref {
                name = env.value.name
                key  = env.value.version
              }
            }
          }
        }
        resources {
          limits = {
            memory = "1Gi"
            cpu : "2000m" # 2 cores.
          }
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale"         = "15"
        "run.googleapis.com/cpu-throttling"        = false
        "run.googleapis.com/execution-environment" = "gen2"
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

resource "google_cloud_run_service_iam_binding" "queryapi_frontend" {
  project  = google_cloud_run_service.queryapi_frontend.project
  location = google_cloud_run_service.queryapi_frontend.location
  service  = google_cloud_run_service.queryapi_frontend.name
  role     = "roles/run.invoker"
  members = [
    "allUsers"
  ]
}
