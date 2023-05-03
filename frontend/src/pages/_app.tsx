import type { AppProps } from "next/app";
import "bootstrap/dist/css/bootstrap.min.css";
import 'near-social-bridge/near-social-bridge.css'
import { Spinner } from 'near-social-bridge'
import { NearSocialBridgeProvider } from 'near-social-bridge'
// import "globals.css";
export default function App({ Component, pageProps }: AppProps) {
  return (<NearSocialBridgeProvider fallback={<Spinner />}>

    <Component {...pageProps} />
  </NearSocialBridgeProvider>)
}
