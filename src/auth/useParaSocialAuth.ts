import { useCallback, useEffect, useRef, useState } from "react";
import ParaWeb, {
  useAuthenticateWithEmailOrPhone,
  useAuthenticateWithOAuth,
  useClient,
  useVerifyNewAccount,
} from "@getpara/react-sdk";

/**
 * OAuth methods we expose in the POC. NOTE the real SDK enum value for X is
 * "TWITTER" (not "X") — verified against @getpara/shared OAUTH_METHODS.
 * Telegram + Farcaster are special: they return a URL instead of a popup.
 */
export const OAUTH_METHODS = [
  { method: "GOOGLE", label: "Google" },
  { method: "TWITTER", label: "X" },
  { method: "TELEGRAM", label: "Telegram" },
] as const;

export type OAuthMethod = (typeof OAUTH_METHODS)[number]["method"];

const URL_BASED_METHODS = new Set<OAuthMethod>(["TELEGRAM"]);

/**
 * Headless Para social/email auth.
 *
 * Important behaviours discovered from the installed SDK (v2.32):
 *  - `authenticateWithEmailOrPhone` returns a promise that stays PENDING through
 *    an internal state machine until the account is verified AND a session
 *    starts. So we can't "await then branch" — instead we subscribe to
 *    `client.onStatePhaseChange` and flip to the code-entry UI when
 *    `authPhase === 'awaiting_account_verification'`, calling `verifyNewAccount`
 *    while the original promise is still in flight.
 *  - OAuth popup wallets (GOOGLE/TWITTER) use `onOAuthPopup`; TELEGRAM uses
 *    `onOAuthUrl` (open the returned URL yourself).
 */
export function useParaSocialAuth() {
  const para = useClient<ParaWeb>();

  const { authenticateWithOAuthAsync, isPending: oauthPending } =
    useAuthenticateWithOAuth();
  const { authenticateWithEmailOrPhoneAsync, isPending: emailPending } =
    useAuthenticateWithEmailOrPhone();
  const { verifyNewAccountAsync, isPending: verifyPending } =
    useVerifyNewAccount();

  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Track Para's auth phase so we know when to show the verification code input.
  useEffect(() => {
    if (!para) return;
    const unsubscribe = para.onStatePhaseChange((snapshot) => {
      if (snapshot.authPhase === "awaiting_account_verification") {
        setNeedsVerification(true);
      }
      if (snapshot.authPhase === "authenticated") {
        setNeedsVerification(false);
      }
      if (snapshot.error) setError(snapshot.error.message);
    });
    return unsubscribe;
  }, [para]);

  const loginWithOAuth = useCallback(
    async (method: OAuthMethod) => {
      setError(null);
      try {
        await authenticateWithOAuthAsync({
          method,
          redirectCallbacks: URL_BASED_METHODS.has(method)
            ? {
                // Telegram/Farcaster: open the returned auth URL ourselves.
                onOAuthUrl: (url: string) => {
                  popupRef.current = window.open(url, "_blank", "popup,width=420,height=640");
                },
              }
            : {
                // Google/X: Para opens the popup and hands it to us.
                onOAuthPopup: (popup: Window) => {
                  popupRef.current = popup;
                  popup?.focus?.();
                },
              },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "OAuth login failed");
      }
    },
    [authenticateWithOAuthAsync],
  );

  const startEmailLogin = useCallback(
    async (email: string) => {
      setError(null);
      try {
        // Stays pending until verification + session start complete; the phase
        // listener above flips the UI to the code-entry step in the meantime.
        await authenticateWithEmailOrPhoneAsync({ auth: { email } });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Email login failed");
      }
    },
    [authenticateWithEmailOrPhoneAsync],
  );

  const submitCode = useCallback(
    async (verificationCode: string) => {
      setError(null);
      try {
        await verifyNewAccountAsync({ verificationCode });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verification failed");
      }
    },
    [verifyNewAccountAsync],
  );

  return {
    loginWithOAuth,
    startEmailLogin,
    submitCode,
    needsVerification,
    error,
    isPending: oauthPending || emailPending || verifyPending,
  };
}
