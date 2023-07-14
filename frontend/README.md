Frontend for Near QueryAPI that allows users to create, manage, and explore indexers stored on-chain. 

Visit the app [here](https://near.org/dataplatform.near/widget/QueryApi.App)


BOS widgets are stored in the `widgets/` folder while the main NextJS application lives in the root.

## Getting Started

First, download the bos-loader cli by following this guide [here](https://docs.near.org/bos/dev/bos-loader). 

From the root of QueryAPI Frontend repo, run the following command

```bash
bos-loader dev-queryapi.dataplatform.near --path widgets/src
```
> This tool takes the widgets that would normally be stored on-chain and serves them locally to be consumed by a BOS gateway like Near.org. It should provide you with a local link where the widgets will be served from. e.g http://127.0.0.1:3030

Now, run the following to serve the local NextJS frontend
```bash
yarn dev
```

After that, head to `near.org/flag` and enter the URL you got from the first step. If you have not changed any configurations then the default should be `http://127.0.0.1:3030`

Finally, head to the path where the widgets are served on the BOS. 

Dev Environment: `https://near.org/dev-queryapi.dataplatform.near/widget/QueryApi.dev-App`

Prod Environment: `https://near.org/dataplatform.near/widget/QueryApi.App`
