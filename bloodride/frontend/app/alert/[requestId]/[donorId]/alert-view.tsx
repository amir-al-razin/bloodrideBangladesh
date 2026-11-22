"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { get, post, when } from "@/lib/api";

type Alert = {
  request_id: number; donor_id: number; donor: string; distance_km: string; round_no: number;
  response: string; blood_group: string; bags_needed: number; urgency: string; needed_by: string;
  request_status: string; hospital: string; address: string; lat: number; lng: number; bags_filled: number;
};
type Answer = { result: string; message: string };

const URGENCY: Record<string, string> = { emergency: "Emergency", urgent: "Needed today", scheduled: "Scheduled" };

export default function AlertView() {
  const { requestId, donorId } = useParams<{ requestId: string; donorId: string }>();
  const base = `/api/alerts/${requestId}/${donorId}`;
  const [alert, setAlert] = useState<Alert | null>(null);
  const [sharePhone, setSharePhone] = useState(true);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    get<Alert>(base)
      .then((a) => { setAlert(a); return post(`${base}/seen`); })   // opening the alert counts as "seen"
      .catch((e) => setError(e.message));
  }, [base]);

  async function respond(kind: "accept" | "decline") {
    setBusy(true);
    setError("");
    try {
      setAnswer(await post<Answer>(`${base}/${kind}`, kind === "accept" ? { share_phone: sharePhone } : {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !alert) return <main><h1>Alert not found</h1><p className="error">{error}</p></main>;
  if (!alert) return <p className="muted">Loading the request…</p>;

  const open = alert.response === "pending" && !answer;
  const full = alert.bags_filled >= alert.bags_needed;
  const closed = ["closed", "cancelled"].includes(alert.request_status);
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${alert.lat},${alert.lng}`;

  return (
    <main>
      <p style={{ margin: 0 }}><span className="pill red">{URGENCY[alert.urgency] ?? alert.urgency}</span></p>
      <h1>{alert.blood_group} blood needed</h1>
      <p className="lead">Hi {alert.donor.split(" ")[0]}, a patient near you needs your help</p>

      <section className="card">
        <dl className="facts">
          <dt>Hospital</dt><dd>{alert.hospital}</dd>
          <dt>Address</dt><dd>{alert.address}</dd>
          <dt>Distance</dt><dd>{alert.distance_km} km from home</dd>
          <dt>Needed by</dt><dd>{when(alert.needed_by)}</dd>
          <dt>Bags</dt><dd>{alert.bags_filled} of {alert.bags_needed} found</dd>
        </dl>
        <p style={{ marginBottom: 0 }}><a href={maps} target="_blank" rel="noreferrer">Directions in Google Maps</a></p>
      </section>

      {answer && (
        <p className={`notice ${answer.result === "accepted" ? "ok" : "warn"}`} role="status">{answer.message}</p>
      )}
      {!answer && alert.response !== "pending" && (
        <p className="notice warn">You already answered this request ({alert.response})</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {open && !closed && (
        <>
          <label className="check">
            <input type="checkbox" checked={sharePhone} onChange={(e) => setSharePhone(e.target.checked)} />
            <span>Share my phone number with the patient’s family, so they can call me</span>
          </label>
          {full && (
            <p className="notice ok">Every bag already has a donor, but you can join the backup list in case someone drops out</p>
          )}
          <div className="actions">
            <button className={`${full ? "" : "primary "}wide`} disabled={busy} onClick={() => respond("accept")}>
              {busy ? "Sending…" : full ? "Join the backup list" : "I can donate"}
            </button>
            <button className="wide" disabled={busy} onClick={() => respond("decline")}>I can’t donate this time</button>
          </div>
          <p className="small">Only donate if you feel well and your last donation was at least 90 days ago</p>
        </>
      )}
      {closed && open && <p className="notice">This request is closed, thank you for checking</p>}
    </main>
  );
}
