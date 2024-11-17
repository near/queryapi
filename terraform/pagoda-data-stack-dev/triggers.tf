resource "google_cloudbuild_trigger" "queryapi_coordinator_mainnet_build_trigger" {
  name        = "queryapi-coordinator-mainnet-build-trigger"
  description = "Build and deploy trigger for queryapi-coordinator-mainnet"
  project     = var.project_id

  github {
    owner = "near"
    name  = "queryapi"
    push {
      branch = "^main$"
    }
  }

  build {
    timeout = "2400s"
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["build", "-f", "./coordinator/Dockerfile", "-t", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator", "."]
    }
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["push", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator:latest"]
    }
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["container", "images", "add-tag", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator:$COMMIT_SHA"]
    }
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["compute", "instances", "update-container", "queryapi-coordinator-mainnet", "--zone=europe-west1-b", "--container-image=us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator:$COMMIT_SHA"]
    }

    artifacts {
      images = ["us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator"]
    }
    options {
      machine_type = "E2_HIGHCPU_32"
    }
  }
}

resource "google_cloudbuild_trigger" "queryapi_block_streamer_build_trigger" {
  name        = "queryapi-block-streamer-build-trigger"
  description = "Build trigger for queryapi-block-streamer"
  project     = var.project_id

  github {
    owner = "near"
    name  = "queryapi"
    push {
      branch = "^main$"
    }
  }
  build {
    timeout = "2400s" # 40m
    # Build the container image
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["build", "-f", "./block-streamer/Dockerfile", "-t", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-block-streamer", "."]
    }
    # Push to Artifact Registry
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["push", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-block-streamer:latest"]
    }
    # Tag commit hash
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["container", "images", "add-tag", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-block-streamer", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-block-streamer:$COMMIT_SHA"]
    }
    # Update Compute Engine instance
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["compute", "instances", "update-container", "queryapi-block-streamer-mainnet", "--zone=europe-west1-b", "--container-image=us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-block-streamer:$COMMIT_SHA"]
    }
    artifacts {
      # Make build image part of the output Build Artifacts of the pipeline.
      images = ["us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-block-streamer"]
    }
    options {
      machine_type = "E2_HIGHCPU_32"
    }
  }
}

resource "google_pubsub_topic" "queryapi_runner_deploy_topic" {
  name = "queryapi_runner_deploy_topic"
}

resource "google_cloudbuild_trigger" "queryapi_runner_build_trigger" {
  name        = "queryapi-runner-build-trigger"
  description = "Build trigger for queryapi-runner"
  project     = var.project_id

  github {
    owner = "near"
    name  = "queryapi"
    push {
      branch = "^main$"
    }
  }

  build {
    timeout = "2400s" # 40m
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["build", "-f", "./runner/Dockerfile", "-t", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-runner", "./runner"]
    }
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["push", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-runner:latest"]
    }
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["container", "images", "add-tag", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-runner", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-runner:$COMMIT_SHA"]
    }
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["pubsub", "topics", "publish", "queryapi_runner_deploy_topic", "--message", "$COMMIT_SHA"]
    }

    artifacts {
      images = ["us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-runner"]
    }
    options {
      machine_type = "E2_HIGHCPU_32"
    }
  }
}

resource "google_cloudbuild_trigger" "queryapi_runner_deploy_trigger" {
  name        = "queryapi-runner-deploy-trigger"
  description = "Deploy trigger for queryapi-runner"

  pubsub_config {
    topic = google_pubsub_topic.queryapi_runner_deploy_topic.id
  }

  build {
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["compute", "instances", "update-container", "queryapi-runner-mainnet", "--zone=europe-west1-b", "--container-image=us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-runner:$_COMMIT"]
    }
    substitutions = {
      _COMMIT = "$(body.message.data)"
    }
  }
}

resource "google_pubsub_topic" "queryapi_hasura_auth_deploy_topic" {
  name = "queryapi_hasura_auth_deploy_topic"
}

resource "google_cloudbuild_trigger" "queryapi_hasura_auth_build_trigger" {
  name        = "queryapi-hasura-auth-build-trigger"
  description = "Trigger for queryapi-hasura-auth"
  project     = var.project_id

  github {
    owner = "near"
    name  = "queryapi"
    push {
      branch = "^main$"
    }
  }

  build {
    timeout = "2400s" # 40m
    # Build the container image
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["build", "-f", "./hasura-authentication-service/Dockerfile", "-t", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-hasura-auth", "./hasura-authentication-service"]
    }
    # Push to Artifact Registry
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["push", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-hasura-auth:latest"]
    }
    # Tag commit hash
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["container", "images", "add-tag", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-hasura-auth", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-hasura-auth:$COMMIT_SHA"]
    }
    # Deploy to Cloud Run
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["pubsub", "topics", "publish", "queryapi_hasura_auth_deploy_topic", "--message", "$COMMIT_SHA"]
    }

    artifacts {
      # Make build image part of the output Build Artifacts of the pipeline.
      images = ["us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-hasura-auth"]
    }
    options {
      machine_type = "E2_HIGHCPU_32"
    }
  }
}

resource "google_cloudbuild_trigger" "queryapi_hasura_auth_deploy_trigger" {
  name        = "queryapi-hasura-auth-deploy-trigger"
  description = "Deploy the queryapi hasura from main branch"

  pubsub_config {
    topic = google_pubsub_topic.queryapi_hasura_auth_deploy_topic.id
  }

  build {
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = ["run", "deploy", "queryapi-hasura-auth-mainnet", "--image", "us-central1-docker.pkg.dev/pagoda-data-stack-dev/cloud-run-source-deploy/queryapi-hasura-auth:$_COMMIT", "--region", "europe-west1"]
    }
    substitutions = {
      _COMMIT = "$(body.message.data)"
    }
  }
}
