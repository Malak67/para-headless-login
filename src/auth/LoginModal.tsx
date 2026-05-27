import { useState, type ReactNode } from "react";
import { WalletList } from "./WalletList";
import {
  OAUTH_METHODS,
  useParaSocialAuth,
  type OAuthMethod,
} from "./useParaSocialAuth";
import { GoogleIcon, TelegramIcon, XIcon } from "./icons";

const ICONS: Record<OAuthMethod, ReactNode> = {
  GOOGLE: <GoogleIcon />,
  TWITTER: <XIcon />,
  TELEGRAM: <TelegramIcon />,
};

export function LoginModal({ onClose }: { onClose: () => void }) {
  const {
    loginWithOAuth,
    startEmailLogin,
    submitCode,
    needsVerification,
    error,
    isPending,
  } = useParaSocialAuth();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Sign Up or Login</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {needsVerification ? (
          <div className="verify">
            <p>Enter the code we emailed you.</p>
            <input
              className="text-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Verification code"
              inputMode="numeric"
            />
            <button
              className="primary-button"
              disabled={isPending || !code}
              onClick={() => submitCode(code)}
            >
              Verify
            </button>
          </div>
        ) : (
          <>
            {/* ── Social section: powered by Para (headless) ── */}
            <div className="social-row">
              {OAUTH_METHODS.map(({ method, label }) => (
                <button
                  key={method}
                  className="social-button"
                  disabled={isPending}
                  onClick={() => loginWithOAuth(method)}
                  aria-label={label}
                >
                  {ICONS[method]}
                </button>
              ))}
            </div>

            <form
              className="email-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (email) startEmailLogin(email);
              }}
            >
              <span className="email-icon">✉</span>
              <input
                className="email-input"
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </form>

            <div className="divider">
              <span>or</span>
            </div>

            {/* ── Wallet section: fully owned by us via wagmi ── */}
            <WalletList onConnected={onClose} />
          </>
        )}

        {error && <p className="error">{error}</p>}

        <footer className="modal-footer">
          By logging in you agree to our <a href="#">Terms &amp; Conditions</a>
          <div className="brand">Para (headless) + wagmi</div>
        </footer>
      </div>
    </div>
  );
}
