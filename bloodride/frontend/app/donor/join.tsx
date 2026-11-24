"use client";

import { useEffect, useState } from "react";
import SignIn from "@/components/sign-in";
import { get, GROUPS, post } from "@/lib/api";
import LocationField, { type Spot } from "./location-field";

type Campus = { campus_id: number; name: string };

/** Signed out: sign up as a donor, or sign in. */
export default function Join({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"join" | "signin">("join");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [group, setGroup] = useState("");
  const [spot, setSpot] = useState<Spot | null>(null);
  const [campus, setCampus] = useState("");
  const [listed, setListed] = useState(false);
  const [fit, setFit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { get<Campus[]>("/api/campuses").then(setCampuses).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!group) return setError("Choose your blood group.");
    if (!spot) return setError("Choose your area, or use your location.");
    setBusy(true);
    try {
      await post("/api/auth/signup", {
        full_name: name, phone, password, blood_group: group, lat: spot.lat, lng: spot.lng,
        campus_id: campus ? Number(campus) : null, listed_for_reveal: listed,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 28 }}>
      <div className="tabs" style={{ marginTop: 0 }}>
        <button className={mode === "join" ? "on" : ""} onClick={() => setMode("join")}>Join as a donor</button>
        <button className={mode === "signin" ? "on" : ""} onClick={() => setMode("signin")}>I have an account</button>
      </div>

      {mode === "signin" ? (
        <SignIn onDone={onDone} hint="Demo donor: 01800000001 · password bloodride123" />
      ) : (
        <form onSubmit={submit}>
          <div className="form-section"><h3>Your blood group</h3><p>We only alert you for requests you can help with.</p></div>
          <div className="pills" role="radiogroup" aria-label="Blood group">
            {GROUPS.map((g) => (
              <label className="pill blood" key={g}>
                <input type="radio" name="group" value={g} checked={group === g} onChange={() => setGroup(g)} />
                <span>{g}</span>
              </label>
            ))}
          </div>

          <div className="form-section"><h3>Where you are</h3><p>Alerts come from hospitals near this place.</p></div>
          <LocationField value={spot} onChange={setSpot} />
          <label className="field">
            <span>University or college (optional)</span>
            <select className="input" value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option value="">None</option>
              {campuses.map((c) => <option key={c.campus_id} value={c.campus_id}>{c.name}</option>)}
            </select>
          </label>

          <div className="form-section"><h3>Your account</h3><p>You sign in with your mobile number.</p></div>
          <label className="field">
            <span>Full name</span>
            <input className="input" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Mobile number</span>
            <input className="input" inputMode="tel" autoComplete="tel" placeholder="01712345678" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="hint">At least 6 characters.</span>
          </label>

          <div className="card soft stack" style={{ marginTop: 24 }}>
            <label className="check">
              <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
              <span>Families with a hospital-approved request may see my number and call me. <span className="small">You can turn this off any time.</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} required />
              <span>I am 18 to 60, weigh over 50 kg, and I am in good health.</span>
            </label>
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn red lg block" style={{ marginTop: 24 }} disabled={busy}>{busy ? "Creating your account…" : "Become a donor"}</button>
        </form>
      )}
    </div>
  );
}
