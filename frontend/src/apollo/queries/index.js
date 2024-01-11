import { gql } from "@apollo/client";

export const GET_INDEXER_STATUS = gql`
    query GetState($_functionName: String!) {
      indexer_state(where: { function_name: { _eq: $_functionName } }) {
        status
        function_name
        current_block_height
        current_historical_block_height
      }
    }
  `;
