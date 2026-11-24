"use client";

import { useState } from "react";
import { AREAS } from "@/lib/areas";

export type Spot = { lat: number; lng: number; label: string };

/** Home area for the distance search: the browser's location, or a Dhaka area from the list. */
export default function LocationField({ value, onChange }: { value: Spot | null; onChange: (s: Spot) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function useMine() {
    if (!navigator.geolocation) return setError("This browser can’t share location. Choose your area instead.");
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // rounded to about 100 m: enough for the search, kinder to privacy
        const lat = Math.round(p.coords.latitude * 1000) / 1000;
        const lng = Math.round(p.coords.longitude * 1000) / 1000;
        onChange({ lat, lng, label: "My current location" });
        setBusy(false);
      },
      () => { setError("Location not shared. Choose your area instead."); setBusy(false); },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  return (
    <div className="field">
      <span>Where you usually are</span>
      <div className="row" style={{ alignItems: "stretch" }}>
        <select className="input" style={{ flex: "1 1 220px" }}
                value={AREAS.some((a) => a.name === value?.label) ? value?.label : ""}
                onChange={(e) => {
                  const a = AREAS.find((x) => x.name === e.target.value);
                  if (a) onChange({ lat: a.lat, lng: a.lng, label: a.name });
                }}>
          <option value="">{value && !AREAS.some((a) => a.name === value.label) ? value.label : "Choose your area"}</option>
          {AREAS.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
        <button type="button" className="btn ghost" onClick={useMine} disabled={busy}>{busy ? "Finding…" : "Use my location"}</button>
      </div>
      <span className="hint">Home, hall or campus. Only the distance is ever shown to anyone, never your location.</span>
      {error && <span className="hint" style={{ color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
