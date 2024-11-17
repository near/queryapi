variable "redis_configs" {
  type = map(string)
  default = {
    maxmemory-policy = "volatile-lru"
    maxmemory-gb     = "3.5"
  }
}

resource "google_redis_instance" "queryapi-redis" {
  name           = "queryapi-redis"
  memory_size_gb = 5
  region         = "europe-west1"
  location_id    = "europe-west1-b"

  tier               = "STANDARD_HA"
  redis_version      = "REDIS_6_X"
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  authorized_network = data.google_compute_network.dev_network.id

  redis_configs = var.redis_configs
}

output "redis_host_ip" {
  description = "The IP address of the instance."
  value       = google_redis_instance.queryapi-redis.host
}
