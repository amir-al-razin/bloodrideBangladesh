"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignIn from "@/components/sign-in";
import { get, getMe, post, when, type Me } from "@/lib/api";
import { enablePush } from "@/lib/push";

type Pending = {
  request_id: number; slip_id: number; reader_result: string; blood_group: string; bags_needed: number;
  urgency: string; needed_by: string; hospital: string; requester: string; phone: string; created_at: string;
  escalated_at: string | null; minutes_waiting: number;
};
type Decided = {
  request_id: number; blood_group: string; bags_needed: number; urgency: string; hospital: string;
  status: string; slip_status: string; approved_at: string; alerted: number; accepted: number; reviewed_by: string;
};

const URGENT_TAG: Record<string, string> = { emergency: "red", urgent: "black", scheduled: "" };

export default function StaffView() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [recent, setRecent] = useState<Decided[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [push, setPush] = useState("");
  const seen = useRef<Set<number>>(new Set());

  const loadMe = useCallback(() => { getMe().then(setMe).catch(() => setMe(null)); }, []);

  const load = useCallback(async () => {
    try {
      const [q, r] = await Promise.all([get<Pending[]>("/api/staff/queue"), get<Decided[]>("/api/staff/recent")]);
      // a new request while the tab is in the background: say so in the tab title
      const fresh = q.filter((p) => !seen.current.has(p.request_id));
      if (fresh.length && seen.current.size && document.hidden) document.title = `(${q.length}) New blood request`;
      q.forEach((p) => seen.current.add(p.request_id));
      setQueue(q);
      setRecent(r);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(loadMe, [loadMe]);

  useEffect(() => {
    if (!me || (me.account_type !== "staff" && me.account_type !== "admin")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after the network call
    load();
    const t = setInterval(load, 10_000);
    const onFocus = () => { document.title = "Hospital staff · BloodRide BD"; };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [me, load]);

  async function decide(p: Pending, approve: boolean) {
    if (!approve && !confirm(`Reject the ${p.blood_group} request from ${p.requester}? The family will be told it was not approved.`)) return;
    setBusy(p.request_id);
    setMessage("");
    try {
      const res = await post<{ search?: { alerted: number; radius_km: number } }>(
        `/api/staff/requests/${p.request_id}/${approve ? "approve" : "reject"}`);
      setMessage(approve
        ? `Approved. ${res.search?.alerted ?? 0} nearby ${p.blood_group} donors alerted (within ${res.search?.radius_km} km). The search widens by itself.`
        : "Rejected. No donor will be alerted.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await post("/api/auth/logout");
    setMe(null);
  }

  if (me === undefined) return <p className="muted">Loading…</p>;

  if (!me || (me.account_type !== "staff" && me.account_type !== "admin")) {
    return (
      <div className="card" style={{ maxWidth: 440, marginTop: 28 }}>
        <h2>Staff sign in</h2>
        {me && <p className="notice warn" style={{ marginTop: 12 }}>You are signed in as a donor. Sign in with a hospital staff account.</p>}
        <SignIn onDone={loadMe} hint="Demo: 01500000001 (Dhaka Medical College) · password bloodride123" />
      </div>
    );
  }

  return (
    <>
      <div className="spread" style={{ marginTop: 20 }}>
        <div>
          <b>{me.hospital ?? "All hospitals (admin)"}</b>
          <span className="small" style={{ display: "block" }}>{me.full_name} · refreshes every 10 seconds</span>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={async () => setPush((await enablePush()).message)}>Notify me of new requests</button>
          {me.account_type === "admin" && <a className="btn sm" href="/admin">Admin page</a>}
          <button className="btn ghost sm" onClick={signOut}>Sign out</button>
        </div>
      </div>
      {push && <p className="small" style={{ marginTop: 8 }}>{push}</p>}

      {message && <p className="notice ok" style={{ marginTop: 20 }} role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <h2 style={{ marginTop: 36 }}>Waiting for approval {queue.length > 0 && <span className="count">{queue.length}</span>}</h2>
      {queue.length === 0 && <p className="card soft" style={{ marginTop: 14 }}>Nothing waiting. New requests appear here by themselves.</p>}
      {queue.map((p) => (
        <article className="card accent req-card" key={p.request_id} style={{ marginTop: 16 }}>
          <a className="slip" href={`/api/staff/requests/${p.request_id}/slip`} target="_blank" rel="noreferrer" title="Open the slip full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- private image behind the session cookie */}
            <img src={`/api/staff/requests/${p.request_id}/slip`} alt={`Doctor’s slip for request ${p.request_id}`} />
          </a>
          <div>
            <div className="row">
              <span className="group-badge sm">{p.blood_group}</span>
              <div>
                <h3>{p.bags_needed} bag{p.bags_needed > 1 ? "s" : ""} · <span className={`tag ${URGENT_TAG[p.urgency]}`}>{p.urgency}</span></h3>
                <span className="small">Sent {when(p.created_at)} ({p.minutes_waiting} min ago) · needed by {when(p.needed_by)}</span>
                {p.escalated_at && (
                  <span className="tag red" style={{ display: "inline-flex", marginTop: 6 }}>
                    Overdue{me.account_type === "admin" ? ": call the blood bank, then approve" : ": the family is waiting"}
                  </span>
                )}
              </div>
            </div>
            <dl className="facts">
              <dt>Requested by</dt><dd>{p.requester}</dd>
              <dt>Phone</dt><dd><a href={`tel:${p.phone}`}>{p.phone}</a></dd>
              {me.account_type === "admin" && (<><dt>Hospital</dt><dd>{p.hospital}</dd></>)}
              <dt>Slip reader</dt><dd>{p.reader_result === "auto_verified" ? "Details match" : "Check by eye"}</dd>
            </dl>
            <p className="small" style={{ marginBottom: 14 }}>Check: is this slip from your hospital, recent, and for {p.blood_group}?</p>
            <div className="row">
              <button className="btn red" disabled={busy === p.request_id} onClick={() => decide(p, true)}>
                {busy === p.request_id ? "Working…" : "Approve and alert donors"}
              </button>
              <button className="btn ghost" disabled={busy === p.request_id} onClick={() => decide(p, false)}>Reject</button>
            </div>
          </div>
        </article>
      ))}

      <h2 style={{ marginTop: 44 }}>Decided in the last 48 hours</h2>
      {recent.length === 0 ? <p className="small" style={{ marginTop: 10 }}>None yet.</p> : (
        <ul className="list card" style={{ marginTop: 14 }}>
          {recent.map((r) => (
            <li key={r.request_id}>
              <span className="row nowrap">
                <span className="group-badge sm">{r.blood_group}</span>
                <span>
                  <b>{r.slip_status === "rejected" ? "Rejected" : r.status === "filled" ? "Donor found" : `Searching · ${r.alerted} alerted`}</b>
                  <span className="small" style={{ display: "block" }}>{when(r.approved_at)} by {r.reviewed_by}{me.account_type === "admin" ? ` · ${r.hospital}` : ""}</span>
                </span>
              </span>
              {r.slip_status === "rejected" ? <span className="tag">Rejected</span>
                : r.accepted > 0 ? <span className="tag green">{r.accepted} of {r.bags_needed} found</span>
                : <span className="tag amber">Searching</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
