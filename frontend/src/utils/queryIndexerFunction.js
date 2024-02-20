import { providers } from "near-api-js";
const REGISTRY_CONTRACT =
  process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ||
  "dev-queryapi.dataplatform.near";
//network config (replace testnet with mainnet or betanet)
const provider = new providers.JsonRpcProvider(
  "https://rpc.mainnet.near.org"
);

export const queryIndexerFunctionDetails = async (accountId, functionName) => {
  let args = { account_id: accountId };

  try {
    const result = await provider.query({
      request_type: "call_function",
      account_id: REGISTRY_CONTRACT,
      // TODO Create method to query single indexer
      method_name: "list_by_account",
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      finality: "optimistic",
    });

    const indexers = result.result &&
      result.result.length > 0 &&
      JSON.parse(Buffer.from(result.result).toString());

    if (!indexers) {
      return null;
    }

    return indexers[functionName];
  } catch (error) {
    console.log(`Could not query indexer function details from registry ${REGISTRY_CONTRACT}, for ${accountId}/${functionName}`)
    console.log(error, "error");
    return null;
  }
};
