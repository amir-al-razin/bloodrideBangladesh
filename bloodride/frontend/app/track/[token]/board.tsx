"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { get, when } from "@/lib/api";
import Reveal, { type RevealState } from "./reveal";

type Donor = { donor: string; distance_km: string; phone_shared: boolean; phone: string | null; mission_status: string };
type BoardData = {
  request_id: number; status: string; blood_group: string; bags_needed: number; urgency: string;
  needed_by: string; hospital: string; slip_status: string;
  alerted: number; seen: number; declined: number; accepted: number; backup: number; rounds: number;
  donors: Donor[];
  reveal: { state: RevealState; unlocked_at: string | null };
};

const STATUS_TEXT: Record<string, string> = {
  open: "Starting",
  searching: "Looking for donors",
  filled: "Donor found",
  closed: "Closed",
  cancelled: "Cancelled",
};

export default function Board() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<BoardData | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | undefined;
    const es = new EventSource(`/api/track/${token}/events`);
    es.onmessage = (e) => { setData(JSON.parse(e.data)); setLive(true); };
    es.onerror = () => {
      setLive(false);
      if (!poll) {                     // the stream dropped: fall back to polling until it reconnects
        poll = setInterval(() => get<BoardData>(`/api/track/${token}`).then(setData).catch(() => {}), 5000);
      }
    };
    es.onopen = () => { if (poll) { clearInterval(poll); poll = undefined; } };
    get<BoardData>(`/api/track/${token}`).then(setData).catch((e) => setError(e.message));
    return () => { es.close(); if (poll) clearInterval(poll); };
  }, [token]);

  if (error) return <main><h1>Request not found</h1><p className="error">{error}</p></main>;
  if (!data) return <p className="muted">Loading your request…</p>;

  const done = data.status === "filled";
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }

  return (
    <main>
      <p style={{ display: "flex", justifyContent: "space-between", margin: 0 }}>
        <span className={`pill ${done ? "ok" : "red"}`}>{STATUS_TEXT[data.status] ?? data.status}</span>
        <span className={`live ${live ? "" : "off"}`}>{live ? "Live" : "Reconnecting"}</span>
      </p>
      <h1>{data.blood_group} · {data.bags_needed} bag{data.bags_needed > 1 ? "s" : ""}</h1>
      <p className="lead">{data.hospital} · needed by {when(data.needed_by)}</p>

      {data.slip_status === "rejected" && (
        <p className="notice">Our team rejected this slip and stopped the request, so if that’s a mistake ask the hospital for a new slip and request again</p>
      )}

      <div className="stats" aria-live="polite">
        <div className="stat"><b>{data.alerted}</b><span>alerted</span></div>
        <div className="stat"><b>{data.seen}</b><span>seen</span></div>
        <div className="stat"><b>{data.declined}</b><span>declined</span></div>
        <div className={`stat ${data.accepted ? "hit" : ""}`}><b>{data.accepted}</b><span>accepted</span></div>
      </div>
      {data.backup > 0 && <p className="small">{data.backup} more donor{data.backup > 1 ? "s" : ""} on the backup list</p>}
      {data.status === "searching" && data.accepted === 0 && data.alerted > 0 && (
        <p className="muted">Alerts sent to the nearest eligible donors (round {data.rounds}), this page updates by itself</p>
      )}
      {data.status === "searching" && data.alerted === 0 && (
        <p className="notice warn">No eligible donor nearby yet, the search will widen (Sprint 2)</p>
      )}

      {data.donors.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Your donor{data.donors.length > 1 ? "s" : ""}</h2>
          <ul className="list">
            {data.donors.map((d, i) => (
              <li key={i}>
                <span><b>{d.donor}</b><br /><span className="small">{d.distance_km} km away · {d.mission_status}</span></span>
                {d.phone ? <a className="btn primary" href={`tel:${d.phone}`}>Call {d.phone}</a>
                         : <span className="small">Number not shared</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.status !== "cancelled" && <Reveal token={token} state={data.reveal.state} group={data.blood_group} />}

      <div className="actions noprint">
        <button onClick={copyLink}>{copied ? "Link copied" : "Copy this private link"}</button>
      </div>
      <p className="small">Keep this link, anyone with it can see this request’s progress</p>
    </main>
  );
}
