# Para Headless POC — decoupled social login + custom wallet connectors

A React + Vite + TypeScript proof-of-concept showing how to use **Para for social
login only** (headless, no Para modal) while **owning the browser-wallet
connectors yourself** via a standalone wagmi config.

The login modal mirrors Para's default UI (social buttons + email on top), but the
wallet section below it (MetaMask, Coinbase, WalletConnect) is fully rendered and
ordered by us.

---

## What this POC is testing

The question we wanted to answer:

> Can we use Para purely for social/email login without letting it touch our
> wagmi setup, so external wallet connections (MetaMask, Coinbase, WalletConnect,
> EIP-6963 injected) stay 100% ours?

**Short answer: yes, but only because we hold the SDK to a specific contract.**
See [Caveats](#caveats--risks) — the decoupling is real but conditional, and the
contract isn't a public API guarantee.

---

## Architecture

```
QueryClientProvider
└─ WagmiProvider            ← owns external wallet connection state (src/wagmi.ts)
   └─ ParaProvider          ← headless: disableEmbeddedModal, NO externalWalletConfig
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

### Why two `useAccount` hooks

Because Para and wagmi each maintain their own independent connection state, and
we deliberately do **not** let Para feed into wagmi. The app reads both:

```ts
import { useAccount as useParaAccount } from "@getpara/react-sdk";
import { useAccount as useWagmiAccount } from "wagmi";

const para = useParaAccount();   // social/email session + embedded wallet
const wagmi = useWagmiAccount(); // external wallet (MetaMask, etc.)
const isConnected = para.isConnected || wagmi.isConnected;
```

Sign-out reconciles both:

```ts
await Promise.allSettled([logoutAsync(), disconnectAsync()]);
```

---

## How the decoupling actually works (verified against `@getpara/react-sdk@2.32`)

This is the part that justifies the POC's premise. The SDK does ship a code path
that creates its own wagmi config and `WagmiProvider`, which **would shadow our
outer wagmi context** if it ran. We confirmed it does not run in our config.

### The Para SDK does have an internal `WagmiProvider`

In `@getpara/evm-wallet-connectors/dist/providers/ParaEvmContext.js`:

```js
import { createConfig as createWagmiConfig, WagmiProvider } from "wagmi";
// …
const createdConfig = createWagmiConfig({
  ssr: true,
  chains,
  transports: transports || createDefaultTransports(chains),
  connectors: allConnectors,
});
return jsx(WagmiProvider, { config, ...wagmiProviderProps, children: … });
```

If this path runs, Para spins up its own `wagmi` config and our outer
`useAccount()` will silently read **Para's** config instead of ours.

### The gate that prevents it

One layer up, in `@getpara/react-sdk-lite/dist/provider/providers/EvmExternalWalletProvider.js`:

```js
if (!rest.config) {
  return children;            // ← pass-through, no WagmiProvider
}
if (EvmProvider) {
  return jsx(EvmProvider, …);  // ← Para's WagmiProvider only mounts here
}
```

`rest.config` is populated from the `externalWalletConfig` prop on `ParaProvider`.
Our `src/providers.tsx` **omits `externalWalletConfig` entirely**, so the
pass-through branch always wins, Para never creates a `WagmiProvider`, and our
context is untouched.

### What this means in practice

- `useAccount()` from `wagmi` is reading the config in `src/wagmi.ts` — not a
  Para-internal one.
- MetaMask / Coinbase / Phantom / Rabby / etc. are surfaced exclusively through
  our wagmi config via EIP-6963 (`multiInjectedProviderDiscovery: true`).
- `walletConnect()` is the only explicit wagmi connector we declare (and only
  when a project id is set).
- Para contributes **zero** wallet connectors. It is used only for the social /
  email login UX via headless hooks (`useAuthenticateWithOAuth`,
  `useAuthenticateWithEmailOrPhone`, `useVerifyNewAccount`).

---

## Caveats & risks

The decoupling works, but it is a behavioral contract — not a public API
guarantee. Three concerns deserve real expansion before this approach goes to
production. Each maps directly to one "Con" in the alternatives table above.

### Risk 1 — The decoupling depends on an undocumented internal gate

The whole POC hinges on one branch inside the Para SDK:

```js
// @getpara/react-sdk-lite/dist/provider/providers/EvmExternalWalletProvider.js
if (!rest.config) {
  return children;            // ← pass-through, our wagmi context is preserved
}
return jsx(EvmProvider, …);   // ← Para mounts its own WagmiProvider here
```

`rest.config` is populated from the `externalWalletConfig` prop on
`<ParaProvider>`. We omit that prop in `src/providers.tsx`, so the branch
short-circuits and Para never instantiates `WagmiProvider`.

**What this contract is not.** It is not in Para's public types — `externalWalletConfig`
is an optional prop, and "omitting it" is a usage pattern, not a documented API
guarantee. The file we depend on lives in `react-sdk-lite`, which is an internal
package the SDK re-exports through; we cannot link to a docs page that says
"this branch will remain stable." There is no CI signal that would fail if Para
removes it.

**Concrete ways this gate can break:**

- **Someone adds the prop, even empty.** `externalWalletConfig={}` is truthy.
  TypeScript will not complain — the prop is typed as optional, not "must be
  omitted." A well-meaning PR adding `externalWalletConfig={}` because "it
  looked unconfigured" silently mounts Para's `WagmiProvider` inside ours.
- **Someone adds the prop with what looks like a no-op value.** Same as above
  for `externalWalletConfig={{ wallets: [] }}` or anything else that yields a
  truthy object.
- **A code generator or AI suggests adding the prop** based on Para's
  documentation, which almost always shows it set.
- **Para changes the default.** A future minor release could decide that
  omitting `externalWalletConfig` should default to "enabled with no
  connectors," populating `rest.config` internally. That is a one-line change
  on their side and a silent regression on ours.
- **Para refactors the file or the prop.** The gate lives at a specific path
  in `react-sdk-lite`. A package restructure, a rename, or a new abstraction
  layer between `react-sdk` and `react-sdk-lite` can move or remove this
  conditional without any deprecation warning on the public surface.
- **A transitive bump.** `@getpara/react-sdk` pins ranges on
  `@getpara/react-sdk-lite` and `@getpara/evm-wallet-connectors`. A `^` range
  resolution at `npm install` time can pull a different lite/connectors
  version than the one we audited.

**What failure looks like (and why it is bad):** the gate fails silently. There
is no thrown error and no console warning. Para's inner `WagmiProvider` simply
shadows the outer one. Every `useAccount()` / `useChainId()` /
`useWalletClient()` from `wagmi` in the app starts reading Para's internal
config — its connectors, its chains, its addresses. The symptoms are
"address looks wrong," "chain looks wrong," "transactions sent to the wrong
network," all without anything obviously failing at boot.

**How to defend the gate:**

- **Treat `externalWalletConfig` as banned.** Add a lint rule, a grep-based CI
  check, or a `CODEOWNERS` entry that flags any addition of that prop. The
  prop name is rare enough that a literal string match works.
- **Pin Para versions exactly.** Replace `^2.32.0` with `2.32.0` (or a tight
  range) so a future `2.x` bump can't quietly change the gate. Re-audit
  manually when upgrading.
- **Re-verify on every Para upgrade.** Confirm the conditional still exists at
  the same path with the same semantics. The file to open is
  `node_modules/@getpara/react-sdk-lite/dist/provider/providers/EvmExternalWalletProvider.js`.
- **Add a runtime assertion.** At app boot, check that `useConfig()` from wagmi
  returns the exact `wagmiConfig` instance from `src/wagmi.ts`. If it doesn't,
  the gate has been bypassed — fail fast with a clear error rather than
  shipping bad state to users.

### Risk 2 — Two connection states make every flow doubly complex

There is no single "is the user connected" or "what is their address" answer in
this architecture. There are two parallel state machines (Para's social session
and wagmi's external-wallet session), and every UX surface has to handle the
fact that **zero, one, or both** can be active at the same time.

**Where the duality leaks into the code:**

- **Sign-in.** Three terminal states: Para only, wagmi only, both. The current
  UI accepts all three; downstream code has to as well.
- **Sign-out.** Has to call **both** `logout()` (Para) and `disconnect()`
  (wagmi). `AccountStatus.tsx` does this with `Promise.allSettled`; any new
  sign-out path (route guard, session-expiry handler, "switch account" flow,
  error boundary) must replicate that — there is no single hook that signs
  out everything.
- **Page reload.** Each system restores from its own persistence independently.
  Para has its own session storage; wagmi auto-reconnects via
  `reconnectOnMount`. A user can return to a half-restored state if one side
  succeeds and the other fails.
- **"The user's address."** There isn't one. Decide per surface whether to
  prefer Para's embedded wallet address or wagmi's external address, and apply
  that precedence everywhere. The current UI displays both side by side; any
  feature that needs a single canonical address (ENS lookup, server identity,
  signing target) has to encode the precedence rule explicitly.
- **The chain.** wagmi has `chainId` from the external wallet; Para's embedded
  wallet has its own chain configuration. They can diverge. Network-switching
  hooks only act on the wagmi side; Para's embedded wallet is unaffected by
  `switchChain`.
- **Signing.** "Sign this message" needs to know which session to use. Para's
  signer (viem/ethers integrations from `@getpara/*`) and wagmi's
  `useWalletClient()` are different objects. Pick one per flow.
- **Errors.** Para errors and wagmi errors have different shapes, codes, and
  recovery hints. A unified error UI has to map both.
- **Loading states.** Two `isPending` / `isConnecting` flags. Anything that
  shows "connecting…" has to OR them.
- **Race conditions.** A user can start a Para OAuth in one tab and connect
  MetaMask in another. The provider order in `providers.tsx` (Wagmi outside,
  Para inside) determines which state updates flush first; React batching can
  surface either order to consumers.
- **Account linking.** "Link wallet X to my social account" requires reading
  one state and writing to the other — there is no built-in primitive for it.
- **Testing surface area.** Every flow now has three connection variants
  (Para only / wagmi only / both) times whatever other state matters. The
  combinatorial cost lands on QA.

**Mitigations, none free:**

- Wrap both hooks in an app-level `useSession()` that returns a canonical
  `{ address, chainId, source, signOut }` and centralizes the precedence rule.
  Every component reads from `useSession()`, never from `useParaAccount` or
  `useAccount` directly.
- Centralize sign-out in a single async function and ban direct calls to
  `logoutAsync` / `disconnectAsync` outside it (lint rule).
- Decide up front whether the product allows both sessions to be active. If
  not, enforce mutual exclusion: connecting one side automatically disconnects
  the other.

### Risk 3 — Bundle and runtime cost even though we use only social login

"Headless" does not mean "lightweight." `ParaProvider` mounting still pulls in
most of the SDK and runs its lifecycle whether or not we use the external
wallet path.

**What ends up in the production bundle:**

- `@getpara/react-sdk` and its sub-packages: `react-core`, `react-sdk-lite`,
  `react-common`, `react-components`, `core-components`, `core-sdk`,
  `web-sdk`, `shared`, `user-management-client`.
- `@getpara/evm-wallet-connectors` — even though we never trigger the path
  that renders Para's `WagmiProvider`, the package is imported by
  `EvmExternalWalletProvider` and ships in the build. Our `dist/` already
  shows it: `dist/assets/evm-wallet-connectors-*.js`.
- `@getpara/solana-wallet-connectors` likewise lands as a chunk
  (`dist/assets/solana-wallet-connectors-*.js`) even though we do not touch
  Solana at all.
- `ethers` v6 — required for the production build to resolve a Para
  ethers-signer code path, despite us using `viem` everywhere in our own
  code.
- Node polyfills (`Buffer`, `process`, `global`) injected by
  `vite-plugin-node-polyfills` because the Para and WalletConnect runtimes
  reference Node builtins. These ship to every browser.

A glance at `dist/` after `npm run build` shows dozens of chunks attributable
to the Para SDK tree; the cost is not hypothetical.

**What runs at startup that isn't ours:**

- `ParaProvider` mounts a tree of its own React contexts, react-query
  observers, and event subscriptions. Initialization is enough that
  `ParaProviderCore` throws (taking the app down) if `Buffer` is missing —
  see *Implementation notes*.
- Para's session restoration runs on mount whether or not the user ends up
  logging in socially.
- `@getpara/*` packages compete with our app for transitive-dep resolution:
  `wagmi`, `viem`, `@tanstack/react-query`. A version skew between what Para
  pins and what we pin can produce duplicate copies in the bundle or
  surprising runtime behavior. The whole `@getpara/aa-*` set (alchemy,
  biconomy, zerodev, pimlico, safe, thirdweb…) is installed via npm even if
  unused, increasing the surface for transitive surprises.

**Mitigations:**

- Pin `@getpara/react-sdk` exactly and audit transitive ranges on upgrade.
- Use the build analyzer (`vite-plugin-visualizer` or similar) to track Para's
  share of the bundle over time and treat regressions as PRs to fix.
- Consider lazy-loading `Providers` so Para's init does not block first paint
  if social login is rarely used.
- If the bundle / startup cost becomes unacceptable, that is the moment to
  revisit the alternative architectures table above.

### Other notes

- **`ParaProvider` still mounts its own React contexts, query observers, and
  lifecycle machinery.** "Doesn't touch wagmi" ≠ "doesn't run." If the SDK
  misbehaves at init (Buffer polyfill, ethers resolution, etc.), it still
  takes the app down. See *Implementation notes* below for the bumps we
  already hit.
- **Para's persisted social session and wagmi's persisted connector are
  independent.** Each survives reload via its own storage; clearing one does
  not clear the other.
- **`VITE_`-prefixed env vars are bundled into the client.** `VITE_PARA_API_KEY`
  and `VITE_WALLETCONNECT_PROJECT_ID` are public, domain-restricted identifiers.
  Don't treat them as secrets, and never give a real server-side secret the
  `VITE_` prefix.

---

## Alternative architectures we considered

| Approach | Source of truth | Pros | Cons |
| --- | --- | --- | --- |
| **This POC** — `ParaProvider` headless, wagmi separate | Two: Para state + wagmi state | Full UI control; Para's headless hooks; verifiably independent in this config | Relies on the undocumented `!config` gate; two states to reconcile; bundle weight of Para's connectors package even unused |
| **Para as a wagmi connector** via `@getpara/wagmi-v2-connector` (already in `node_modules`) | One: wagmi | Single source of truth; no ParaProvider; no reconciliation; no shadow-context risk | Lose Para's headless social-login hooks; bound to the connector's UX; still depending on Para |
| **Drop Para entirely** | One: wagmi | Zero Para coupling, zero risk from SDK changes | Lose social/email login — must build it elsewhere or skip it |

This POC exists to validate the first row. Switching to row two or three is a
product decision, not a technical blocker.

---

## Conditions for using this in production

Picking the first row of the table above (the current POC) is viable, but it is
not free. Using this code as the foundation of the production login flow
requires the team to agree, explicitly, to all three of the following. If any
of them feels uncomfortable, that is the signal to revisit the alternatives
table instead of soft-launching with this architecture.

### 1. We will close Risk 1 before this becomes a real users' login flow

The preventable parts of the gate must actually be prevented. Concretely:

- Add a lint / CI grep rule that fails the build on any addition of the
  `externalWalletConfig` prop to `<ParaProvider>`. The prop name is rare enough
  that a literal string match is sufficient.
- Pin `@getpara/react-sdk` to an exact version (drop the `^`) and treat upgrades
  as audited changes: when bumping, re-verify the
  `EvmExternalWalletProvider` pass-through branch still exists at the same
  path with the same semantics.
- Add a boot-time runtime assertion that `useConfig()` from `wagmi` returns the
  exact `wagmiConfig` instance from `src/wagmi.ts`. If a future change
  bypasses the gate, the app should fail loudly at startup rather than serve
  silently wrong addresses and chains to users.

These three are one-time additions. They turn a latent silent-failure risk
into a known-known with a tripwire.

### 2. We accept the dual-state complexity tax indefinitely

Two connection states is structural, not a bug to be fixed later. As long as
this architecture is in place, every identity-touching feature has to be
designed for the world where zero, one, or both sessions are active. Concretely:

- Sign-in, sign-out, page reload, address resolution, chain handling, signing,
  error mapping, and loading states all have to handle both sources. The
  enumeration in Risk 2 above is the working checklist.
- We commit to centralizing the duality in an app-level abstraction (e.g.
  `useSession()` returning a canonical `{ address, chainId, source, signOut }`)
  rather than letting every component reach into `useParaAccount` and
  `useAccount` directly. Without that abstraction, the complexity multiplies
  with every new feature.
- We accept that new contributors will encounter this duality and that
  onboarding and review need to cover it.

This is an ongoing cost, paid forever in design and review time, not a
one-time fix.

### 3. We accept the bundle and init cost and commit to tracking, not eliminating, it

Para's packages ship in the production bundle whether or not we use the
external-wallet path. `ethers` v6, `@getpara/evm-wallet-connectors`,
`@getpara/solana-wallet-connectors`, the Node polyfills, and the `@getpara/aa-*`
family all land in the build artifact today. Concretely:

- We add a bundle-analyzer step to the build (or to CI) so the Para share of
  the bundle is visible over time and regressions are caught as PRs.
- We treat Para's contribution to bundle size and startup cost as a budget
  item to monitor, not a defect to fix. Reducing it materially requires
  switching architectures, not tuning.
- If the cost ever stops being acceptable — perceived TTI regressions, mobile
  bundle complaints, transitive-dep conflicts with `wagmi` / `viem` /
  `react-query` — that is the trigger to revisit the alternatives table, not
  to retrofit this architecture.

This is also an ongoing cost. Pinning and lazy-loading manage it; they do not
remove it.

---

If we are comfortable signing off on all three of the above as a team, this
POC is good to build on as-is. If any one of them feels like a future problem
we would rather not commit to, the honest move is to pick row two or three of
the alternatives table now, before users depend on this code path.

---

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

---

## Implementation notes (gotchas verified against `@getpara/react-sdk@2.32`)

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
- **Coinbase Wallet won't re-prompt an authorized site.** Once `localhost` is an
  authorized dApp in Coinbase, `eth_requestAccounts` resolves silently with no
  popup. To force the extension UI again: revoke the site in the Coinbase
  extension and clear wagmi's persisted connection (`localStorage.removeItem`
  the `wagmi.*` keys).
- **wagmi auto-reconnects on mount by default.** `WagmiProvider` defaults
  `reconnectOnMount` to `true`, so the last-used connector reconnects silently
  on reload. Set `reconnectOnMount={false}` if you want every session to start
  disconnected.

---

## Scripts

- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — typecheck + production build
- `npm run preview` — preview the production build
