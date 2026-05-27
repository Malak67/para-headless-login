import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { walletConnect } from "wagmi/connectors";

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/**
 * Standalone wagmi config that owns ONLY the external browser-wallet connectors.
 *
 * Para is intentionally NOT a connector here — Para handles social/email login
 * through its own provider + headless hooks. This file is the wallet side of the
 * decoupled architecture: we declare exactly which wallets we want and in what
 * order, and render them ourselves in the custom modal.
 *
 * `multiInjectedProviderDiscovery: true` enables EIP-6963 so we can show which
 * injected wallets are actually installed (the "green dot" in the mockup).
 */
export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [
    // We intentionally declare NO explicit extension connectors (metaMask(),
    // coinbaseWallet(), etc.). Those wrap vendor *SDKs* that drive their own
    // flows — MetaMask SDK silently hangs on desktop, and Coinbase SDK v4
    // defaults to the Smart Wallet popup instead of your installed extension.
    // They also collide by name with the real extension and win the de-dupe.
    //
    // Instead, every installed extension (MetaMask, Coinbase Wallet, Phantom,
    // Rabby, …) is surfaced automatically as a `type: 'injected'` connector via
    // EIP-6963 (`multiInjectedProviderDiscovery: true` above) and connects
    // through the actual extension. This is the RainbowKit approach.
    //
    // WalletConnect stays explicit — it's QR/mobile, not a browser extension.
    // Only register it when a projectId is set (it throws on an empty id).
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
