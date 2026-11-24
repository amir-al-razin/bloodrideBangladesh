"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { get, when } from "@/lib/api";
import Reveal, { type RevealState } from "./reveal";

type Donor = { donor: string; distance_km: string; phone_shared: boolean; phone: string | null; mission_status: string };
type BoardData = {
  request_id: number; status: string; blood_group: string; bags_needed: number; urgency: string;
  needed_by: string; created_at: string; hospital: string; slip_status: string; approved_at: string | null;
  alerted: number; seen: number; declined: number; accepted: number; backup: number;
  escalated_at: string | null; approval_minutes: number;
  rounds: number; max_rounds: number; radius_km: number; wave_minutes: number; last_wave_at: string | null;
  donors: Donor[];
  reveal: { state: RevealState; unlocked_at: string | null };
};

type Step = { title: string; text: string; state: "done" | "now" | "todo" };

function steps(d: BoardData): Step[] {
  const approved = d.slip_status === "verified";
  const found = d.accepted > 0;
  const enough = d.status === "filled";
  const searchText = !approved
    ? "Starts as soon as the hospital approves."
    : d.alerted === 0
      ? `No eligible donor within ${d.radius_km} km yet. Searching wider every ${d.wave_minutes} minutes.`
      : `${d.alerted} donor${d.alerted === 1 ? "" : "s"} alerted, up to ${d.radius_km} km away. ${d.seen} ha${d.seen === 1 ? "s" : "ve"} seen it.`;
  return [
    { title: "Request sent", text: `${when(d.created_at)} · ${d.hospital}`, state: "done" },
    {
      title: approved ? "Approved by the hospital" : "Waiting for the hospital to approve",
      text: approved
        ? `Approved ${when(d.approved_at)}. The slip is genuine.`
        : d.escalated_at
          ? "This is taking longer than usual, so the BloodRide team has been alerted and is contacting the blood bank. You can also ask at the blood-bank desk to approve it on BloodRide."
          : `The blood bank checks your slip, usually within ${d.approval_minutes} minutes.`,
      state: approved ? "done" : "now",
    },
    { title: "Finding donors near the hospital", text: searchText, state: !approved ? "todo" : found ? "done" : "now" },
    {
      title: enough ? "Donor found" : found ? `${d.accepted} of ${d.bags_needed} donors found` : "A donor says yes",
      text: found ? "Call them below and tell them where to come." : "You can call them as soon as they accept.",
      state: enough ? "done" : found ? "now" : "todo",
    },
  ];
}

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
      if (!poll) poll = setInterval(() => get<BoardData>(`/api/track/${token}`).then(setData).catch(() => {}), 5000);
    };
    es.onopen = () => { if (poll) { clearInterval(poll); poll = undefined; } };
    get<BoardData>(`/api/track/${token}`).then(setData).catch((e) => setError(e.message));
    // the search widens on a timer on the server; refresh now and then so the wording stays current
    const tick = setInterval(() => get<BoardData>(`/api/track/${token}`).then(setData).catch(() => {}), 30_000);
    return () => { es.close(); clearInterval(tick); if (poll) clearInterval(poll); };
  }, [token]);

  if (error) {
    return (
      <main className="container narrow">
        <h1>Request not found</h1>
        <p className="error">{error}</p>
      </main>
    );
  }
  if (!data) return <main className="container narrow"><p className="muted">Loading your request…</p></main>;

  const cancelled = data.status === "cancelled";
  const rejected = data.slip_status === "rejected";
  const searchOver = data.slip_status === "verified" && data.accepted === 0 && data.rounds >= data.max_rounds;

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }

  return (
    <main className="container narrow">
      <div className="spread">
        <p className="label" style={{ margin: 0 }}>Your request</p>
        <span className={`tag ${live ? "green live" : "amber"}`}><span className="dot" />{live ? "Live" : "Reconnecting"}</span>
      </div>

      <div className="row" style={{ marginTop: 14, alignItems: "center" }}>
        <div className="group-badge">{data.blood_group}</div>
        <div>
          <h1 style={{ fontSize: "clamp(1.8rem, 5vw, 2.6rem)" }}>{data.bags_needed} bag{data.bags_needed > 1 ? "s" : ""} needed</h1>
          <p className="muted" style={{ fontWeight: 600 }}>{data.hospital} · by {when(data.needed_by)}</p>
        </div>
      </div>

      {rejected || cancelled ? (
        <div className="notice" style={{ marginTop: 24 }}>
          <b>The hospital did not approve this request.</b> If this is a mistake, ask the blood bank desk for a new slip and send the request again.
        </div>
      ) : (
        <>
          <ol className="timeline card" style={{ marginTop: 24, padding: "24px 24px 4px" }} aria-live="polite">
            {steps(data).map((s, i) => (
              <li key={s.title} className={s.state}>
                <span className="mark">{s.state === "done" ? "✓" : i + 1}</span>
                <b>{s.title}</b>
                <span className="small">{s.text}</span>
              </li>
            ))}
          </ol>

          {data.slip_status === "verified" && (
            <div className="stats" style={{ marginTop: 20 }}>
              <div><b>{data.alerted}</b><span>Alerted</span></div>
              <div><b>{data.seen}</b><span>Seen</span></div>
              <div><b>{data.declined}</b><span>Can’t</span></div>
              <div className={data.accepted ? "hit" : ""}><b>{data.accepted}</b><span>Yes</span></div>
            </div>
          )}
          {data.backup > 0 && <p className="small" style={{ marginTop: 8 }}>{data.backup} more on the backup list, in case a donor can’t make it.</p>}

          {data.donors.length > 0 && (
            <section className="card accent" style={{ marginTop: 20 }}>
              <p className="label">Your donor{data.donors.length > 1 ? "s" : ""}</p>
              <ul className="list">
                {data.donors.map((d, i) => (
                  <li key={i}>
                    <span>
                      <b style={{ fontSize: "1.1rem" }}>{d.donor}</b>
                      <span className="small" style={{ display: "block" }}>{d.distance_km} km from the hospital</span>
                    </span>
                    {d.phone ? <a className="btn red" href={`tel:${d.phone}`}>Call {d.phone}</a>
                             : <span className="small">On the way. Number not shared.</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {searchOver && (
            <div className="notice warn" style={{ marginTop: 20 }}>
              <b>No donor has said yes yet.</b> Alerts stay open, and anyone who accepts will appear here. Meanwhile, ask the hospital’s blood bank desk, and contact volunteer groups such as Sandhani or Badhan.
            </div>
          )}

          {(data.status !== "filled" || data.reveal.state === "unlocked") && (
            <Reveal token={token} state={data.reveal.state} group={data.blood_group} />
          )}
        </>
      )}

      <div className="card soft" style={{ marginTop: 20 }}>
        <div className="spread">
          <span className="small" style={{ maxWidth: 380 }}>Keep this private link. Anyone with it can see this request’s progress.</span>
          <button className="btn ghost sm" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
        </div>
      </div>
    </main>
  );
}
