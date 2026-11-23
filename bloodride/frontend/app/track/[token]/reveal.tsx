"use client";

import { useCallback, useEffect, useState } from "react";
import { get, post } from "@/lib/api";

// "Show all donor numbers" on the patient's private page. Opens once the slip is verified; free for now,
// a Tk 10 payment step comes later. The list is re-checked every 10 seconds, so donors who opt in or become
// able to donate appear, and donors who opt out, pause or have just donated disappear.

export type RevealState = "needs_verification" | "available" | "unlocked" | "closed";
type Donor = { donor_id: number; full_name: string; phone: string; campus: string | null; distance_km: string };
type List = { count: number; donors: Donor[] };

const PRETTY = (g: string) => g.replace("-", "−");

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
      load();                                   // the page's live board also switches to "unlocked"
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const g = PRETTY(group);

  return (
    <section className="card reveal">
      <h2 style={{ marginTop: 0 }}>All {g} donor numbers</h2>

      {state === "needs_verification" && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Opens as soon as our team has checked your slip, you can then call {g} donors yourself</p>
          <button className="wide" disabled>Show all donor numbers</button>
        </>
      )}

      {state === "available" && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Your slip is verified, so you can see every {g} donor who chose to share their number and call them yourself</p>
          <button className="primary wide" onClick={unlock} disabled={busy}>{busy ? "Opening…" : "Show all donor numbers"}</button>
          <p className="small" style={{ textAlign: "center", margin: "8px 0 0" }}>Free during testing</p>
        </>
      )}

      {state === "unlocked" && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {list ? `${list.count} ${g} donor${list.count === 1 ? "" : "s"} can donate today, nearest first` : "Loading…"}
            <span className="live" style={{ marginLeft: 10 }}>Updates by itself</span>
          </p>
          {list && list.count === 0 && <p className="small">No one right now, new donors appear here as they become available</p>}
          {list && list.count > 0 && (
            <ul className="list">
              {list.donors.map((d) => (
                <li key={d.donor_id}>
                  <span>
                    <b>{d.full_name}</b>
                    <br />
                    <span className="small">{d.distance_km}&nbsp;km away{d.campus ? ` · ${d.campus}` : ""}</span>
                  </span>
                  <a className="btn primary" href={`tel:${d.phone}`}>Call {d.phone}</a>
                </li>
              ))}
            </ul>
          )}
          <p className="small" style={{ margin: "12px 0 0" }}>These donors chose to share their number, and each one is told you saw it</p>
        </>
      )}

      {state === "closed" && (
        <p className="muted" style={{ margin: 0 }}>Donor numbers are closed for this request, it has ended or 48 hours have passed</p>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
