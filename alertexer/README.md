#QueryAPI-mvp "Alertexer"
Runs filter rules against incoming blocks

## Deployment to GCP
Build a new linux image and push it to GCP container registry.
`docker buildx build --platform linux/amd64 --push -t us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-alertexer .`

To redeploy the Compute Engine instance / container, 
see terraform scripts https://github.com/near/near-ops/tree/master/provisioning/terraform/data_stack/queryapi/pagoda_data_stack_dev
`gcloud auth login`
`terraform apply`

