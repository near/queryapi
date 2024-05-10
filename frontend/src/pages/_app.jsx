import "bootstrap/dist/css/bootstrap.min.css";
import "near-social-bridge/near-social-bridge.css";
import { Spinner } from "near-social-bridge";
import {
  overrideLocalStorage,
  NearSocialBridgeProvider,
} from "near-social-bridge";
import { ModalProvider } from '@/contexts/ModalContext';
import { IndexerDetailsProvider } from '../contexts/IndexerDetailsContext';
import 'regenerator-runtime/runtime';
import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';
overrideLocalStorage();

export default function App({ Component, pageProps }) {
  console.log('welcome to dev')
  const client = new ApolloClient({
    uri: `${process.env.NEXT_PUBLIC_HASURA_ENDPOINT}/v1/graphql`,
    cache: new InMemoryCache()
  });

  return (
    <NearSocialBridgeProvider waitForStorage fallback={<Spinner />}>
      <ApolloProvider client={client}>
        <IndexerDetailsProvider>
          <ModalProvider>
            <Component {...pageProps} />
          </ModalProvider>
        </IndexerDetailsProvider>
      </ApolloProvider>
    </NearSocialBridgeProvider>
  );
}