import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { wagmiConfig } from "./wagmi";
import "./App.css";

const queryClient = new QueryClient();

const paraApiKey = import.meta.env.VITE_PARA_API_KEY ?? "";

/**
 * Provider tree for the decoupled setup:
 *
 *   QueryClientProvider        (both wagmi and Para use react-query)
 *     └─ WagmiProvider         (owns external wallet connection state)
 *          └─ ParaProvider     (owns social/email session — headless)
 *
 * Para is configured to do social/email ONLY:
 *   - `disableEmbeddedModal: true`  → Para never renders its own modal; we drive
 *      login from our own buttons via the headless hooks.
 *   - we OMIT `externalWalletConfig` entirely → Para registers no wallet
 *      connectors, so MetaMask/Coinbase/WalletConnect are exclusively ours.
 */
export function Providers({ children }: { children: ReactNode }) {
  // ParaProvider throws "Invalid Para config" if the apiKey is empty, which
  // white-screens the whole app. Gate on it so we show a helpful setup notice
  // instead — and so the Para hooks below always have a valid provider.
  if (!paraApiKey) {
    return <MissingKeyNotice />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ParaProvider
          paraClientConfig={{ apiKey: paraApiKey }}
          config={{
            appName: "Para Headless POC",
            disableEmbeddedModal: true,
          }}
        >
          {children}
        </ParaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

function MissingKeyNotice() {
  return (
    <div className="page">
      <div className="account-card" style={{ maxWidth: 460 }}>
        <h3>Set your Para API key</h3>
        <p style={{ color: "#6b7280" }}>
          Create <code>.env</code> (copy <code>.env.example</code>) and set:
        </p>
        <pre
          style={{
            background: "#f1f1f3",
            padding: "0.9rem",
            borderRadius: 12,
            overflowX: "auto",
          }}
        >
          VITE_PARA_API_KEY=your_key_here
        </pre>
        <p style={{ color: "#6b7280" }}>
          Get one from the{" "}
          <a href="https://developer.getpara.com" target="_blank" rel="noreferrer">
            Para Developer Portal
          </a>
          , then restart the dev server.
        </p>
      </div>
    </div>
  );
}
