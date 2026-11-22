"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { get, post, when } from "@/lib/api";

type Slip = { slip_id: number; request_id: number; blood_group: string; bags_needed: number; urgency: string;
              hospital: string; requester: string; phone: string; created_at: string };
type Reviewed = { approved: boolean; request_id: number };

const KEY = "bloodride.adminKey";
const noSubscribe = () => () => {};
function storedKey() {
  try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export default function AdminView() {
  const saved = useSyncExternalStore(noSubscribe, storedKey, () => "");
  const [typed, setKey] = useState<string | null>(null);
  const key = typed ?? saved;
  const [input, setInput] = useState("");
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!key) return;
    get<Slip[]>("/api/admin/slips", { "X-Admin-Key": key })
      .then((list) => { setSlips(list); setError(""); })
      .catch((e) => { setError((e as Error).message); setSlips(null); });
  }, [key]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function review(slip: Slip, approve: boolean) {
    try {
      const r = await post<Reviewed>(`/api/admin/slips/${slip.slip_id}/review`, { approve }, { "X-Admin-Key": key });
      setNote(r.approved ? `Slip for request #${r.request_id} marked verified` : `Request #${r.request_id} rejected and stopped`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!key) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); try { sessionStorage.setItem(KEY, input); } catch {} setKey(input); }}>
        <label htmlFor="key">Admin key</label>
        <input id="key" type="password" value={input} onChange={(e) => setInput(e.target.value)} />
        <p className="small">The demo key is ADMIN_KEY in backend/.env until admin login arrives in Sprint 2</p>
        <div className="actions"><button className="primary" type="submit">Open</button></div>
      </form>
    );
  }

  return (
    <>
      {note && <p className="notice ok" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {slips && slips.length === 0 && <p className="muted">Nothing to check right now, new slips appear here by themselves</p>}
      {slips?.map((s) => (
        <section className="card" key={s.slip_id}>
          <dl className="facts">
            <dt>Request</dt><dd>#{s.request_id} · {s.blood_group} · {s.bags_needed} bag(s) · {s.urgency}</dd>
            <dt>Hospital</dt><dd>{s.hospital}</dd>
            <dt>From</dt><dd>{s.requester} · <a href={`tel:${s.phone}`}>{s.phone}</a></dd>
            <dt>Sent</dt><dd>{when(s.created_at)}</dd>
          </dl>
          <a href={`/api/admin/slips/${s.slip_id}/image?key=${encodeURIComponent(key)}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- private slip image behind the admin key */}
            <img src={`/api/admin/slips/${s.slip_id}/image?key=${encodeURIComponent(key)}`} alt={`Slip for request ${s.request_id}`}
                 style={{ width: "100%", marginTop: 12, borderRadius: 8, border: "1px solid var(--rule)" }} />
          </a>
          <div className="actions" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <button className="primary" onClick={() => review(s, true)}>Looks genuine</button>
            <button onClick={() => review(s, false)}>Reject (fake)</button>
          </div>
        </section>
      ))}
      <p className="small"><button onClick={() => { try { sessionStorage.removeItem(KEY); } catch {} setKey(""); }}>Sign out</button></p>
    </>
  );
}
