import { providers } from 'near-api-js';

//network config (replace testnet with mainnet or betanet)
const provider = new providers.JsonRpcProvider(
    "https://archival-rpc.mainnet.near.org"
);
const contractId = "registry.queryapi.near"

export const queryIndexerFunctionDetails = async (name) => {
    let args = { function_name: name };

    try {
        const result = await provider.query({
            request_type: "call_function",
            account_id: contractId,
            method_name: "read_indexer_function",
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
            finality: "optimistic",
        });
        return (
            result.result &&
            result.result.length > 0 &&
            JSON.parse(Buffer.from(result.result).toString())
        );
    }
    catch (error) {
        console.log(error, "error")
        return null;
    }
}
