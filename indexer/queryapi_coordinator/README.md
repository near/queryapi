# QueryApi-mvp QueryApi-Coordinator app
This app polls for new Lake blocks in S3 and processes them:
 * indexing changes to the QueryApi registry contract;
 * running filter rules against incoming blocks;
 * enqueing indexer functions to be processed.

## Deployment to GCP
Build a new linux image and push it to GCP container registry.
`docker buildx build --platform linux/amd64 --push -t us-central1-docker.pkg.dev/pagoda-data-stack-dev/queryapi/queryapi-coordinator .`

To redeploy the Compute Engine instance / container, 
see terraform scripts https://github.com/near/near-ops/tree/master/provisioning/terraform/data_stack/queryapi/pagoda_data_stack_dev
`gcloud auth login`
`terraform apply`

### Infrastructure Dependencies
This app requires:
 * a connection to a database containing "alert" rules to match blocks against;
 * a redis server where identifiers of processed blocks are stored;
