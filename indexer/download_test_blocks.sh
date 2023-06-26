#!/bin/bash

mkdir -p ./blocks

# Iterate over all script arguments
for block_id in "$@"
do
  curl -o "./blocks/${block_id}.json" "https://70jshyr5cb.execute-api.eu-central-1.amazonaws.com/block/${block_id}?snake_case=true"
done