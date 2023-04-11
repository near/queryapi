import { providers } from 'near-api-js';

//network config (replace testnet with mainnet or betanet)
const provider = new providers.JsonRpcProvider(
    "https://archival-rpc.mainnet.near.org"
);


// get latest block height
export const getLatestBlockHeight = async () => {
    const provider = new providers.JsonRpcProvider(
        "https://archival-rpc.mainnet.near.org"
    );
    const latestBlock = await provider.block({
        finality: "final"
    });
    return latestBlock.header.height;
}
