import { useMemo } from "react";
import { ApolloClient } from "@apollo/client";
import { cache } from "./cache";

export let apolloClient;

function createApolloClient() {
  return new ApolloClient({
    ssrMode: typeof window === "undefined",
    uri: `${process.env.NEXT_PUBLIC_HASURA_ENDPOINT}/v1/graphql`,
    cache,
  });
}

export function initializeApollo() {
  return apolloClient ?? createApolloClient();
}

export function useApollo(initialState) {
  return useMemo(() => initializeApollo(initialState), [initialState]);
}
