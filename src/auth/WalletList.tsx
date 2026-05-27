import { useConnect } from "wagmi";

/**
 * The "browser wallet" section of the modal. Fully owned by us — we read the
 * connectors from our standalone wagmi config and render them in our own order
 * and styling. Para contributes nothing here.
 *
 * Installed extensions arrive as EIP-6963 *discovered* connectors
 * (`type: 'injected'`) thanks to `multiInjectedProviderDiscovery` in the wagmi
 * config — those are the ones we badge as "Detected". Coinbase / WalletConnect
 * are always-available options (SDK/QR), so they get a neutral "Connect" label.
 */
export function WalletList({ onConnected }: { onConnected?: () => void }) {
  const { connectors, connect, isPending, variables, error } = useConnect({
    mutation: {
      onSuccess: () => onConnected?.(),
      onError: (e) => console.error("[wallet connect] failed:", e),
    },
  });

  // De-dupe by name (EIP-6963 + generic injected can overlap), preferring the
  // first occurrence (the discovered one).
  const seen = new Set<string>();
  const wallets = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className="wallet-list">
      {wallets.map((connector) => {
        const connecting = isPending && variables?.connector === connector;
        const detected = connector.type === "injected";
        return (
          <button
            key={connector.uid}
            className="wallet-button"
            disabled={isPending}
            onClick={() => connect({ connector })}
          >
            {connector.icon ? (
              <img src={connector.icon} alt="" className="wallet-icon" />
            ) : (
              <span className="wallet-icon wallet-icon--placeholder" />
            )}
            <span className="wallet-name">{connector.name}</span>
            <span
              className={
                detected ? "wallet-status" : "wallet-status wallet-status--neutral"
              }
            >
              {connecting ? "Connecting…" : detected ? "Detected" : "Connect"}
            </span>
          </button>
        );
      })}

      {error && <p className="error">{error.message}</p>}
    </div>
  );
}
