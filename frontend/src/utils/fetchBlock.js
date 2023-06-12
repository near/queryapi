const BLOCK_FETCHER_API =
  "https://70jshyr5cb.execute-api.eu-central-1.amazonaws.com/block/";

const GENESIS_BLOCK_HEIGHT = 52945886;
export async function fetchBlockDetails(blockHeight) {
  if (blockHeight <= GENESIS_BLOCK_HEIGHT) {
    throw new Error(`Block Height must be greater than genesis block height #${GENESIS_BLOCK_HEIGHT}`);
  }
  try {
    const response = await fetch(
      `${BLOCK_FETCHER_API}${String(blockHeight)}`
    );
    const block_details = await response.json();
    return block_details;
  } catch {
    throw new Error(`Error Fetching Block Height details at BlockHeight #${blockHeight}`);
  }
}
