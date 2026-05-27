# Para Headless POC — decoupled social login + custom wallet connectors

A React + Vite + TypeScript proof-of-concept showing how to use **Para for social
login only** (headless, no Para modal) while **owning the browser-wallet
connectors yourself** via a standalone wagmi config.

The login modal mirrors Para's default UI (social buttons + email on top), but the
wallet section below it (MetaMask, Coinbase, WalletConnect) is fully rendered and
ordered by us.

## Architecture

```
QueryClientProvider
└─ WagmiProvider            ← owns external wallet connection state (src/wagmi.ts)
   └─ ParaProvider          ← headless: disableEmbeddedModal, no externalWalletConfig
      └─ App
```

Two independent connection states, reconciled on sign-out:

| Source            | State hook                              |
| ----------------- | --------------------------------------- |
| Para social/email | `useAccount()` from `@getpara/react-sdk`|
| External wallet   | `useAccount()` from `wagmi`             |

Key files:

- `src/providers.tsx` — provider tree + missing-API-key gate
- `src/wagmi.ts` — standalone wagmi config (MetaMask, Coinbase, WalletConnect, EIP-6963)
- `src/auth/useParaSocialAuth.ts` — headless Para OAuth + email/verify, driven by `onStatePhaseChange`
- `src/auth/LoginModal.tsx` — the custom combined modal
- `src/auth/WalletList.tsx` — wallet section, rendered from wagmi connectors
- `src/auth/AccountStatus.tsx` — unified status + reconciled `logout()` + `disconnect()`

## Setup

```bash
npm install
cp .env.example .env
# edit .env:
#   VITE_PARA_API_KEY=...             (required — from https://developer.getpara.com)
#   VITE_WALLETCONNECT_PROJECT_ID=... (optional — from https://cloud.reown.com)
npm run dev
```

Without `VITE_PARA_API_KEY`, the app shows a setup notice instead of crashing
(Para's provider throws on an empty key).

## Implementation notes (gotchas verified against @getpara/react-sdk v2.32)

- **X OAuth method is `"TWITTER"`**, not `"X"`.
- **Telegram (and Farcaster) use `onOAuthUrl`**, not `onOAuthPopup` — you open the
  returned URL yourself.
- **Email auth stays pending until verification + session start complete.** You
  can't `await` then branch; instead subscribe to `client.onStatePhaseChange` and
  show the code input when `authPhase === 'awaiting_account_verification'`, calling
  `verifyNewAccount({ verificationCode })` while the original promise is in flight.
- **Node polyfills required** (`vite-plugin-node-polyfills`) — Para/WalletConnect
  use `Buffer`; without it `ParaProviderCore` throws at init.
- **`ethers` must be installed** for the production build to resolve a Para
  ethers-signer code path (we use viem, but the bundler resolves it statically).

## Scripts

- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — typecheck + production build
- `npm run preview` — preview the production build
