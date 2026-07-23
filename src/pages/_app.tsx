import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@kaistrum/stratum-ui";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider defaultTheme="light">
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
