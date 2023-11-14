import type { AppProps } from "next/app";
import "bootstrap/dist/css/bootstrap.min.css";
import "near-social-bridge/near-social-bridge.css";
import { Spinner } from "near-social-bridge";
import {
  overrideLocalStorage,
  NearSocialBridgeProvider,
} from "near-social-bridge";
import { IndexerDetailsProvider } from '../contexts/IndexerDetailsContext';
import 'regenerator-runtime/runtime';
import { ApolloClient, InMemoryCache, ApolloProvider, gql } from '@apollo/client';
overrideLocalStorage();

export default function App({ Component, pageProps }: AppProps) {
  const client = new ApolloClient({
    uri: `${process.env.NEXT_PUBLIC_HASURA_ENDPOINT}/v1/graphql`,
    cache: new InMemoryCache(),
    options: {
      headers: {
        "x-hasura-role": "append"
      }
    }
  });
  return (
    <NearSocialBridgeProvider waitForStorage fallback={<Spinner />}>
      <ApolloProvider client={client}>
      <IndexerDetailsProvider>
        <Component {...pageProps} />
      </IndexerDetailsProvider>
      </ApolloProvider>
    </NearSocialBridgeProvider>
  );
}
