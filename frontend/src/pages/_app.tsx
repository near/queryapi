import type { AppProps } from "next/app";
import "bootstrap/dist/css/bootstrap.min.css";
import "near-social-bridge/near-social-bridge.css";
import { Spinner } from "near-social-bridge";
import {
  overrideLocalStorage,
  NearSocialBridgeProvider,
} from "near-social-bridge";
import { IndexerDetailsProvider } from '../contexts/IndexerDetailsContext';
overrideLocalStorage();

export default function App({ Component, pageProps }: AppProps) {
  return (
    <IndexerDetailsProvider>
      <NearSocialBridgeProvider waitForStorage fallback={<Spinner />}>
        <Component {...pageProps} />
      </NearSocialBridgeProvider>
    </IndexerDetailsProvider>
  );
}

