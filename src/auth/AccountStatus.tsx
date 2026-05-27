import { useAccount as useParaAccount, useLogout } from "@getpara/react-sdk";
import { useAccount as useWagmiAccount, useDisconnect } from "wagmi";

function short(addr?: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

/**
 * Shows the active session from EITHER source and unifies sign-out.
 *
 * Because we run headless Para alongside a separate wagmi config, there are two
 * independent connection states:
 *   - Para embedded (social/email)  → `useAccount()` from @getpara/react-sdk
 *   - external wallet               → `useAccount()` from wagmi
 *
 * The "Sign out" button reconciles both: it calls Para `logout()` AND wagmi
 * `disconnect()` so we never end up half-connected.
 */
export function AccountStatus() {
  const para = useParaAccount();
  const wagmi = useWagmiAccount();
  const { logoutAsync } = useLogout();
  const { disconnectAsync } = useDisconnect();

  const isConnected = para.isConnected || wagmi.isConnected;
  if (!isConnected) return null;

  // First embedded wallet address (Para stores wallets keyed by id).
  const embeddedWallets = Object.values(
    (para.embedded?.wallets ?? {}) as Record<string, { address?: string }>,
  );
  const embeddedAddress = embeddedWallets[0]?.address;

  async function signOut() {
    await Promise.allSettled([logoutAsync(), disconnectAsync()]);
  }

  return (
    <div className="account-card">
      <h3>Connected</h3>
      <dl>
        <dt>Source</dt>
        <dd>
          {para.isConnected ? "Para (embedded)" : null}
          {para.isConnected && wagmi.isConnected ? " + " : null}
          {wagmi.isConnected ? `Wallet (${wagmi.connector?.name})` : null}
        </dd>

        {para.embedded?.email && (
          <>
            <dt>Email</dt>
            <dd>{para.embedded.email}</dd>
          </>
        )}

        {embeddedAddress && (
          <>
            <dt>Para wallet</dt>
            <dd>{short(embeddedAddress)}</dd>
          </>
        )}

        {wagmi.address && (
          <>
            <dt>External wallet</dt>
            <dd>
              {short(wagmi.address)} · chain {wagmi.chainId}
            </dd>
          </>
        )}
      </dl>
      <button className="primary-button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
