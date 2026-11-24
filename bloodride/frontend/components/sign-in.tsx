"use client";

import { useState } from "react";
import { post } from "@/lib/api";

/** Phone + password sign-in, used by the donor and staff pages. */
export default function SignIn({ onDone, hint }: { onDone: () => void; hint?: string }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/login", { phone, password });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>Mobile number</span>
        <input className="input" inputMode="tel" autoComplete="tel" placeholder="01712345678" required
               value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" autoComplete="current-password" required
               value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {hint && <p className="small" style={{ marginTop: 10 }}>{hint}</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn block" style={{ marginTop: 20 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
