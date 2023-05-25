const BLOCK_FETCHER_API =
  "https://70jshyr5cb.execute-api.eu-central-1.amazonaws.com/block/";

export async function fetchBlockDetails(blockHeight) {
    try {
      const response = await fetch(
        `${BLOCK_FETCHER_API}${String(blockHeight)}`
      );
      const block_details = await response.json();
      return block_details;
    } catch {
      console.log(`Error Fetching Block Height details at ${blockHeight}`);
    }
  }
