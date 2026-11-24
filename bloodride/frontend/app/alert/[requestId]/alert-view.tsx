"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, get, post, when } from "@/lib/api";

type AlertData = {
  request_id: number; donor: string; distance_km: string; round_no: number; response: string; seen_at: string | null;
  blood_group: string; bags_needed: number; urgency: string; needed_by: string; request_status: string;
  hospital: string; address: string; lat: number; lng: number; bags_filled: number;
};

const URGENCY: Record<string, string> = { emergency: "Emergency", urgent: "Urgent, today", scheduled: "Scheduled" };

export default function AlertView() {
  const { requestId } = useParams<{ requestId: string }>();
  const router = useRouter();
  const [a, setA] = useState<AlertData | null>(null);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: string; message: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    get<AlertData>(`/api/alerts/${requestId}`)
      .then((d) => { setA(d); post(`/api/alerts/${requestId}/seen`).catch(() => {}); })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace(`/donor?next=/alert/${requestId}`);
        else setError(e.message);
      });
  }, [requestId, router]);

  async function answer(yes: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await post<{ result: string; message: string }>(`/api/alerts/${requestId}/${yes ? "accept" : "decline"}`, yes ? { share_phone: share } : undefined);
      setResult({ kind: res.result, message: res.message });
      setA(await get<AlertData>(`/api/alerts/${requestId}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !a) return <><h1>Request not found</h1><p className="error">{error}</p><Link className="btn" style={{ marginTop: 16 }} href="/donor">Back to my requests</Link></>;
  if (!a) return <p className="muted">Loading the request…</p>;

  const closed = !["open", "searching"].includes(a.request_status) && a.response === "pending";
  const full = a.bags_filled >= a.bags_needed;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;

  return (
    <>
      <p className="label">{URGENCY[a.urgency] ?? a.urgency} · blood request</p>
      <div className="row" style={{ alignItems: "center" }}>
        <div className="group-badge">{a.blood_group}</div>
        <div>
          <h1 style={{ fontSize: "clamp(1.8rem, 5vw, 2.6rem)" }}>{a.hospital}</h1>
          <p className="muted" style={{ fontWeight: 600 }}>{a.address} · {a.distance_km} km from you</p>
        </div>
      </div>

      <dl className="card facts" style={{ marginTop: 24 }}>
        <dt>Needed by</dt><dd>{when(a.needed_by)}</dd>
        <dt>Bags</dt><dd>{a.bags_filled} of {a.bags_needed} found</dd>
        <dt>Approved</dt><dd>Checked by the hospital’s blood bank</dd>
      </dl>

      {result && (
        <div className={`notice ${result.kind === "accepted" ? "ok" : result.kind === "backup" ? "warn" : ""}`} style={{ marginTop: 20 }} role="status">
          <b>{result.message}</b>
        </div>
      )}

      {a.response === "pending" && !closed && (
        <section className="card accent" style={{ marginTop: 20 }}>
          <h2>Can you donate?</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {full ? "Enough donors have said yes. You can still join the backup list in case someone can’t make it." : "The first donor to say yes is reserved for this patient."}
          </p>
          <label className="check" style={{ marginTop: 16 }}>
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            <span>Share my number with the patient’s family so they can call me</span>
          </label>
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn red lg" disabled={busy} onClick={() => answer(true)}>{full ? "Join the backup list" : "I can donate"}</button>
            <button className="btn ghost" disabled={busy} onClick={() => answer(false)}>Not this time</button>
          </div>
          <p className="small" style={{ marginTop: 14 }}>Only say yes if you can reach the hospital in time. Blood is free; never accept money.</p>
        </section>
      )}

      {a.response === "accepted" && (
        <section className="card accent" style={{ marginTop: 20 }}>
          <h2>You’re reserved. Thank you.</h2>
          <p className="muted" style={{ marginTop: 6 }}>Go to the blood bank at {a.hospital}. Eat something light and drink water before you leave.</p>
          <a className="btn red" style={{ marginTop: 16 }} href={maps} target="_blank" rel="noreferrer">Directions to the hospital</a>
        </section>
      )}
      {a.response === "backup" && !result && <p className="notice warn" style={{ marginTop: 20 }}>You’re on the backup list. We’ll tell you if you’re needed.</p>}
      {a.response === "declined" && !result && <p className="notice" style={{ marginTop: 20 }}>You said you can’t this time. Thanks for letting us know.</p>}
      {closed && <p className="notice" style={{ marginTop: 20 }}>This request is closed. Thank you for checking.</p>}
      {error && <p className="error">{error}</p>}

      <Link className="btn ghost" style={{ marginTop: 28 }} href="/donor">All my requests</Link>
    </>
  );
}
