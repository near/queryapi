resource "google_service_account" "queryapi_sa" {
  account_id   = "queryapi-sa"
  display_name = "queryapi-sa"
}

resource "google_artifact_registry_repository_iam_member" "member" {
  location   = "us-central1"
  repository = "projects/pagoda-data-stack-dev/locations/us-central1/repositories/queryapi"
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.queryapi_sa.email}"
}

resource "google_project_iam_member" "query_api_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.queryapi_sa.email}"
}

resource "google_project_iam_member" "query_api_metrics_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.queryapi_sa.email}"
}

resource "google_project_iam_custom_role" "deploy_to_gce_vm_role" {
  role_id     = "DeployToGCEVM"
  title       = "Deploy Container to VM"
  description = "Role to be able to update a VM running a docker container"
  permissions = ["compute.instances.setMetadata", "compute.instances.get", "compute.instances.stop", "compute.instances.start"]
}

resource "google_project_iam_member" "cloudbuild_gce_deploy_role" {
  project = var.project_id
  role    = google_project_iam_custom_role.deploy_to_gce_vm_role.id
  member  = "serviceAccount:851370737288@cloudbuild.gserviceaccount.com"
}
