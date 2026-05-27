import { useState } from "react";
import { useAccount as useParaAccount } from "@getpara/react-sdk";
import { useAccount as useWagmiAccount } from "wagmi";
import { LoginModal } from "./auth/LoginModal";
import { AccountStatus } from "./auth/AccountStatus";
import "./App.css";

export default function App() {
  const [open, setOpen] = useState(false);
  const para = useParaAccount();
  const wagmi = useWagmiAccount();
  const isConnected = para.isConnected || wagmi.isConnected;

  return (
    <main className="page">
      <header className="hero">
        <h1>Claim your name</h1>
        <p>Para handles social login. We own the wallet connectors.</p>
      </header>

      {isConnected ? (
        <AccountStatus />
      ) : (
        <button className="cta" onClick={() => setOpen(true)}>
          Sign Up or Login
        </button>
      )}

      {open && <LoginModal onClose={() => setOpen(false)} />}
    </main>
  );
}
