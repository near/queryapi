variable "project_id" {
  default     = "pagoda-data-stack-prod"
  description = "The default project id to use for resources in this directory."
}

terraform {
  backend "gcs" {
    bucket = "terraform-pagoda-shared-infrastructure"
    prefix = "state/data_stack/queryapi/pagoda_data_stack_prod/iam"
  }
}

provider "google" {
  project = "pagoda-data-stack-prod"
}
