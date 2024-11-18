variable "project_id" {
  default     = "pagoda-data-stack-prod"
  description = "The default project id to use for resources in this directory."
}

terraform {
  backend "gcs" {
    bucket = "terraform-pagoda-shared-infrastructure"
    prefix = "state/data_stack/queryapi/pagoda_data_stack_prod"
  }
}

provider "google" {
  project = "pagoda-data-stack-prod"
}

data "google_compute_subnetwork" "prod_subnetwork" {
  name    = "prod-us-central1"
  project = "pagoda-shared-infrastructure"
  region  = "us-central1"
}

data "google_compute_subnetwork" "prod_eu_subnetwork" {
  name    = "prod-europe-west1"
  project = "pagoda-shared-infrastructure"
  region  = "europe-west1"
}

data "google_compute_network" "prod_network" {
  name    = "prod"
  project = "pagoda-shared-infrastructure"
}

data "google_service_account" "queryapi_sa" {
  account_id = "queryapi_sa"
}
