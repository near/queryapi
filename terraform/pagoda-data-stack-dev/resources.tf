variable "project_id" {
  default     = "pagoda-data-stack-dev"
  description = "The default project id to use for resources in this directory."
}

terraform {
  backend "gcs" {
    bucket = "terraform-pagoda-shared-infrastructure"
    prefix = "state/data_stack/queryapi/pagoda_data_stack_dev"
  }
}

provider "google" {
  project = "pagoda-data-stack-dev"
}

data "google_compute_subnetwork" "dev_subnetwork" {
  name    = "dev-us-central1"
  project = "pagoda-shared-infrastructure"
  region  = "us-central1"
}

data "google_compute_subnetwork" "dev_eu_subnetwork" {
  name    = "dev-europe-west1"
  project = "pagoda-shared-infrastructure"
  region  = "europe-west1"
}

data "google_compute_network" "dev_network" {
  name    = "dev"
  project = "pagoda-shared-infrastructure"
}

data "google_service_account" "queryapi_sa" {
  account_id = "queryapi_sa"
}
