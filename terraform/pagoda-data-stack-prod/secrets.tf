#DATABASE_URL
#LAKE_AWS_ACCESS_KEY
#LAKE_AWS_SECRET_ACCESS_KEY
#QUEUE_AWS_ACCESS_KEY
#QUEUE_AWS_SECRET_ACCESS_KEY
#REDIS_CONNECTION_STRING
resource "google_secret_manager_secret" "queryapi_mainnet_database_url" {
  secret_id = "queryapi_mainnet_database_url"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_hasura_mainnet_admin_secret" {
  secret_id = "queryapi_hasura_mainnet_admin_secret"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_postgres_mainnet_admin_user" {
  secret_id = "queryapi_postgres_mainnet_admin_user"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_postgres_mainnet_admin_password" {
  secret_id = "queryapi_postgres_mainnet_admin_password"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_postgres_mainnet_host" {
  secret_id = "queryapi_postgres_mainnet_host"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_postgres_mainnet_default_connection_url" {
  secret_id = "queryapi_postgres_mainnet_default_connection_url"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_postgres_mainnet_metadata_connection_url" {
  secret_id = "queryapi_postgres_mainnet_metadata_connection_url"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_mainnet_lake_aws_access_key" {
  secret_id = "queryapi_mainnet_lake_aws_access_key"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_mainnet_lake_aws_secret_access_key" {
  secret_id = "queryapi_mainnet_lake_aws_secret_access_key"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_mainnet_queue_aws_access_key" {
  secret_id = "queryapi_mainnet_queue_aws_access_key"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_mainnet_queue_aws_secret_access_key" {
  secret_id = "queryapi_mainnet_queue_aws_secret_access_key"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret" "queryapi_mainnet_redis_connection_string" {
  secret_id = "queryapi_mainnet_redis_connection_string"
  replication {
    automatic = true
  }
}

data "google_secret_manager_secret_version" "queryapi_mainnet_database_url" {
  secret = "queryapi_mainnet_database_url"
}

data "google_secret_manager_secret_version" "queryapi_mainnet_lake_aws_access_key" {
  secret = "queryapi_mainnet_lake_aws_access_key"
}

data "google_secret_manager_secret_version" "queryapi_mainnet_lake_aws_secret_access_key" {
  secret = "queryapi_mainnet_lake_aws_secret_access_key"
}

data "google_secret_manager_secret_version" "queryapi_mainnet_queue_aws_access_key" {
  secret = "queryapi_mainnet_queue_aws_access_key"
}

data "google_secret_manager_secret_version" "queryapi_mainnet_queue_aws_secret_access_key" {
  secret = "queryapi_mainnet_queue_aws_secret_access_key"
}

data "google_secret_manager_secret_version" "queryapi_mainnet_redis_connection_string" {
  secret = "queryapi_mainnet_redis_connection_string"
}

data "google_secret_manager_secret_version" "queryapi_postgres_mainnet_admin_user" {
  secret = "queryapi_postgres_mainnet_admin_user"
}

data "google_secret_manager_secret_version" "queryapi_postgres_mainnet_admin_password" {
  secret = "queryapi_postgres_mainnet_admin_password"
}

data "google_secret_manager_secret_version" "queryapi_postgres_mainnet_host" {
  secret = "queryapi_postgres_mainnet_host"
}

data "google_secret_manager_secret_version" "queryapi_hasura_mainnet_admin_secret_value" {
  secret = "queryapi_hasura_mainnet_admin_secret"
}

data "google_secret_manager_secret" "queryapi_hasura_mainnet_admin_secret" {
  secret_id = "queryapi_hasura_mainnet_admin_secret"
}

data "google_secret_manager_secret" "queryapi_postgres_mainnet_default_connection_url" {
  secret_id = "queryapi_postgres_mainnet_default_connection_url"
}

data "google_secret_manager_secret" "queryapi_postgres_mainnet_metadata_connection_url" {
  secret_id = "queryapi_postgres_mainnet_metadata_connection_url"
}

