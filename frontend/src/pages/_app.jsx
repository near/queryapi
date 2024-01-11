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
import { ApolloProvider } from '@apollo/client';
import { useApollo } from "../apollo/apolloClient";
overrideLocalStorage();

export default function App({ Component, pageProps }) {

  const apolloClient = useApollo();

  return (
    <NearSocialBridgeProvider waitForStorage fallback={<Spinner />}>
      <ApolloProvider client={apolloClient}>
        <IndexerDetailsProvider>
          <ModalProvider>
            <Component {...pageProps} />
          </ModalProvider>
        </IndexerDetailsProvider>
      </ApolloProvider>
    </NearSocialBridgeProvider>
  );
}
