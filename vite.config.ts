import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Para + wagmi/WalletConnect pull in Node builtins (Buffer, global, process).
// vite-plugin-node-polyfills shims them for the browser — without this,
// ParaProviderCore throws at init ("buffer externalized for browser").
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
});
