"use client";

import { useCallback, useEffect, useState } from "react";
import { get, post } from "@/lib/api";

// "Call donors yourself" on the patient's private page. Opens once the hospital has approved the request.
// Free: numbers are never sold. Only donors who chose to share their number appear, each one is logged and
// told, and the list is re-checked every 10 seconds.

export type RevealState = "needs_verification" | "available" | "unlocked" | "closed";
type Donor = { donor_id: number; full_name: string; phone: string; campus: string | null; distance_km: string };
type List = { count: number; donors: Donor[] };

export default function Reveal({ token, state, group }: { token: string; state: RevealState; group: string }) {
  const [list, setList] = useState<List | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    get<List>(`/api/track/${token}/donors`)
      .then((l) => { setList(l); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [token]);

  useEffect(() => {
    if (state !== "unlocked") return;
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [state, load]);

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await post(`/api/track/${token}/unlock`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "needs_verification") return null;

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <p className="label">Don’t want to wait?</p>
      <h2>Call {group} donors yourself</h2>

      {state === "available" && (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            See {group} donors who agreed to be called for approved requests, nearest first. Free.
          </p>
          <button className="btn block" style={{ marginTop: 16 }} onClick={unlock} disabled={busy}>
            {busy ? "Opening…" : "Show donor numbers"}
          </button>
        </>
      )}

      {state === "unlocked" && (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            {list ? `${list.count} donor${list.count === 1 ? "" : "s"} can give today, nearest first. The list updates by itself.` : "Loading…"}
          </p>
          {list && list.count > 0 && (
            <ul className="list" style={{ marginTop: 16 }}>
              {list.donors.map((d) => (
                <li key={d.donor_id}>
                  <span>
                    <b>{d.full_name}</b>
                    <span className="small" style={{ display: "block" }}>{d.distance_km} km away{d.campus ? ` · ${d.campus}` : ""}</span>
                  </span>
                  <a className="btn sm" href={`tel:${d.phone}`}>Call {d.phone}</a>
                </li>
              ))}
            </ul>
          )}
          <p className="small" style={{ marginTop: 14 }}>Please call politely. Each donor is told their number was shown, and can report misuse.</p>
        </>
      )}

      {state === "closed" && <p className="muted" style={{ marginTop: 8 }}>Closed: this request has ended, or 48 hours have passed.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
