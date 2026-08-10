import type { AppProps } from "next/app";
import { NhostProvider } from "@nhost/nextjs";
import { NhostApolloProvider } from "@nhost/react-apollo";
import { nhost } from "@/lib/nhost";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <NhostProvider nhost={nhost}>
      <NhostApolloProvider nhost={nhost}>
        <Component {...pageProps} />
      </NhostApolloProvider>
    </NhostProvider>
  );
}
