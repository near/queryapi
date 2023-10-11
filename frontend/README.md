## What is this repo?

Frontend for Near QueryAPI that allows users to create, manage, and explore indexers stored on-chain. You can visit the app [here](https://near.org/dataplatform.near/widget/QueryApi.App)


BOS widgets are stored in the `widgets/` folder while the main NextJS application lives in the root.

## Getting Started

First, download the bos-loader cli by following this guide [here](https://docs.near.org/bos/dev/bos-loader). 

From the root of QueryAPI Frontend repo, run the following command

```bash
yarn serve:widgets:local // for running local enviornment 
yarn serve:widgets:dev // for running dev enviornment 
yarn serve:widgets:prod // for running prod enviornment 
```
> Near.org or any other BOS gateway queries the blockchain state to pull the latest widgets code and renders it. If we would like to test our BOS widgets, we need to override the path at which the gateway (near.org) queries for the widget code. We do this using the Bos-loader tool (the underlying CLI tool used in the `yarn serve:widgets:dev` command) which allows us to serve out widgets locally (http://127.0.0.1:3030 by default). ** This command replaces all keys found in `replacement.dev.json` object with the their values in the widgets directory when serving the widgets **.  At this point, we have served our widgets locally but have not yet told the BOS gateway (near.org) where to load our local widgets from. 


**Then, Head to `near.org/flags` and enter `http://127.0.0.1:3030`**

> In order to tell our BOS gateway (near.org), where to load the local widgets from, we head to `near.org/flags` and enter the local path we got from running the previous command. If you have not changed any configurations then the default should be `http://127.0.0.1:3030`

**Finally**, run the following to serve the local NextJS frontend
```bash
yarn dev
```

**Now, head to the path where the widgets are served on the BOS.**

- Prod App: `https://near.org/dataplatform.near/widget/QueryApi.App`


### ENV variables
The React app does not use the replacement files. Instead, we need to provide an `.env` file to make sure we are accessing the right enviornment

By default, the React app will use the `dev` enviornment vars
```
Prod:
    NEXT_PUBLIC_HASURA_ENDPOINT=https://near-queryapi.api.pagoda.co
    NEXT_PUBLIC_REGISTRY_CONTRACT_ID=queryapi.dataplatform.near
```
```
Dev:
    NEXT_PUBLIC_HASURA_ENDPOINT=https://near-queryapi.dev.api.pagoda.co
    NEXT_PUBLIC_REGISTRY_CONTRACT_ID=dev-queryapi.dataplatform.near
