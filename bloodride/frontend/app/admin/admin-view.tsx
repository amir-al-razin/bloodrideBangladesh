"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import SignIn from "@/components/sign-in";
import { get, getMe, post, when, type Me } from "@/lib/api";
import { AREAS } from "@/lib/areas";

type Counts = { waiting: number; overdue: number; searching: number; found_today: number; donors: number; ready: number };
type Req = {
  request_id: number; tracking_token: string; hospital: string; blood_group: string; bags_needed: number; urgency: string;
  status: string; slip_status: string; created_at: string; escalated_at: string | null; alerted: number; seen: number;
  accepted: number; rounds: number; requester: string; phone: string;
};
type Hosp = { hospital_id: number; name: string; address: string; staff: { user_id: number; full_name: string; phone: string }[] };
type Blocked = { phone: string; full_name: string; requests: number; rejected: number };

function state(r: Req): [string, string] {
  if (r.slip_status === "rejected" || r.status === "cancelled") return ["Rejected", ""];
  if (r.slip_status !== "verified") return r.escalated_at ? ["Overdue approval", "red"] : ["Waiting approval", "amber"];
  if (r.status === "filled") return ["Donor found", "green"];
  if (r.accepted > 0) return [`${r.accepted} of ${r.bags_needed} found`, "green"];
  return [`Searching · round ${r.rounds}`, "amber"];
}

export default function AdminView() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [tab, setTab] = useState<"live" | "hospitals" | "blocked">("live");
  const loadMe = useCallback(() => { getMe().then(setMe).catch(() => setMe(null)); }, []);
  useEffect(loadMe, [loadMe]);

  if (me === undefined) return <p className="muted">Loading…</p>;
  if (!me || me.account_type !== "admin") {
    return (
      <div className="card" style={{ maxWidth: 440, marginTop: 28 }}>
        <h2>Admin sign in</h2>
        {me && <p className="notice warn" style={{ marginTop: 12 }}>This account is not a BloodRide admin.</p>}
        <SignIn onDone={loadMe} hint="Demo: 01700000000 · password bloodride123" />
      </div>
    );
  }
  return (
    <>
      <div className="spread" style={{ marginTop: 20 }}>
        <span className="small">{me.full_name}</span>
        <div className="row">
          <Link className="btn ghost sm" href="/staff">Approve requests</Link>
          <button className="btn ghost sm" onClick={async () => { await post("/api/auth/logout"); setMe(null); }}>Sign out</button>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === "live" ? "on" : ""} onClick={() => setTab("live")}>Live</button>
        <button className={tab === "hospitals" ? "on" : ""} onClick={() => setTab("hospitals")}>Hospitals & staff</button>
        <button className={tab === "blocked" ? "on" : ""} onClick={() => setTab("blocked")}>Blocked numbers</button>
      </div>
      {tab === "live" && <Live />}
      {tab === "hospitals" && <Hospitals />}
      {tab === "blocked" && <BlockedNumbers />}
    </>
  );
}

function Live() {
  const [data, setData] = useState<{ counts: Counts; requests: Req[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () => get<{ counts: Counts; requests: Req[] }>("/api/admin/overview").then(setData).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const c = data.counts;
  return (
    <>
      <div className="stats">
        <div className={c.overdue ? "hit" : ""}><b>{c.overdue}</b><span>Overdue</span></div>
        <div><b>{c.waiting}</b><span>To approve</span></div>
        <div><b>{c.searching}</b><span>Searching</span></div>
        <div><b>{c.found_today}</b><span>Found today</span></div>
      </div>
      <p className="small" style={{ marginTop: 8 }}>{c.ready} of {c.donors} donors can give today. Refreshes every 10 seconds.</p>

      <h2 style={{ marginTop: 32 }}>Last 48 hours</h2>
      {data.requests.length === 0 ? <p className="card soft" style={{ marginTop: 14 }}>No requests yet.</p> : (
        <ul className="list card" style={{ marginTop: 14 }}>
          {data.requests.map((r) => {
            const [label, tone] = state(r);
            return (
              <li key={r.request_id}>
                <span className="row nowrap">
                  <span className="group-badge sm">{r.blood_group}</span>
                  <span>
                    <b>{r.hospital}</b>
                    <span className="small" style={{ display: "block" }}>
                      {r.bags_needed} bag{r.bags_needed > 1 ? "s" : ""} · {r.urgency} · {when(r.created_at)} · {r.requester}, <a href={`tel:${r.phone}`}>{r.phone}</a>
                    </span>
                    {r.slip_status === "verified" && <span className="small" style={{ display: "block" }}>{r.alerted} alerted · {r.seen} seen · {r.accepted} yes</span>}
                  </span>
                </span>
                <span className="row">
                  <span className={`tag ${tone}`}>{label}</span>
                  {r.slip_status !== "verified" && r.status === "open"
                    ? <Link className="btn sm red" href="/staff">Approve</Link>
                    : <a className="btn sm ghost" href={`/track/${r.tracking_token}`} target="_blank" rel="noreferrer">View</a>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Hospitals() {
  const [list, setList] = useState<Hosp[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => { get<Hosp[]>("/api/admin/hospitals").then(setList).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setError(""); setMsg("");
    try { await fn(); setMsg(done); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="stack">
      {msg && <p className="notice ok" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {list.map((h) => (
        <section className="card" key={h.hospital_id}>
          <div className="spread">
            <div><h3>{h.name}</h3><span className="small">{h.address}</span></div>
            <Link className="btn ghost sm" href={`/poster/${h.hospital_id}`}>QR poster</Link>
          </div>
          <ul className="list" style={{ marginTop: 14 }}>
            {h.staff.length === 0 && <li className="small">No staff login yet. Requests here can only be approved by admins.</li>}
            {h.staff.map((s) => (
              <li key={s.user_id}>
                <span><b>{s.full_name}</b> <span className="small">{s.phone}</span></span>
                <button className="btn ghost sm" onClick={() => confirm(`Remove ${s.full_name}? They won't be able to sign in.`) &&
                  run(() => post(`/api/admin/staff/${s.user_id}/remove`), `${s.full_name} removed.`)}>Remove</button>
              </li>
            ))}
          </ul>
          <AddStaff hospitalId={h.hospital_id} onAdd={(body) => run(() => post("/api/admin/staff", body), `Staff login created for ${body.full_name}. Share the phone and password with them.`)} />
        </section>
      ))}
      <AddHospital onAdd={(body) => run(() => post("/api/admin/hospitals", body), `${body.name} added. Create a staff login for it next.`)} />
    </div>
  );
}

function AddStaff({ hospitalId, onAdd }: { hospitalId: number; onAdd: (b: { full_name: string; phone: string; password: string; hospital_id: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: "", phone: "", password: "" });
  if (!open) return <button className="linklike" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>+ Add staff login</button>;
  return (
    <form className="row" style={{ marginTop: 14, alignItems: "stretch" }}
          onSubmit={(e) => { e.preventDefault(); onAdd({ ...f, hospital_id: hospitalId }); setOpen(false); setF({ full_name: "", phone: "", password: "" }); }}>
      <input className="input" style={{ flex: "1 1 160px" }} placeholder="Name or desk" required minLength={2} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      <input className="input" style={{ flex: "1 1 140px" }} placeholder="01XXXXXXXXX" inputMode="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <input className="input" style={{ flex: "1 1 140px" }} placeholder="Password (6+)" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <button className="btn">Create</button>
    </form>
  );
}

function AddHospital({ onAdd }: { onAdd: (b: { name: string; address: string; lat: number; lng: number }) => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  return (
    <form className="card soft" onSubmit={(e) => {
      e.preventDefault();
      const a = AREAS.find((x) => x.name === area);
      if (!a) return;
      onAdd({ name, address, lat: a.lat, lng: a.lng });
      setName(""); setAddress(""); setArea("");
    }}>
      <h3>Add a hospital</h3>
      <div className="row" style={{ marginTop: 12, alignItems: "stretch" }}>
        <input className="input" style={{ flex: "2 1 220px" }} placeholder="Hospital name" required minLength={3} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ flex: "1 1 160px" }} placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <select className="input" style={{ flex: "1 1 160px" }} required value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Area</option>
          {AREAS.map((a) => <option key={a.name}>{a.name}</option>)}
        </select>
        <button className="btn">Add</button>
      </div>
      <p className="small" style={{ marginTop: 8 }}>The area sets the hospital’s position for the distance search.</p>
    </form>
  );
}

function BlockedNumbers() {
  const [list, setList] = useState<Blocked[]>([]);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => { get<Blocked[]>("/api/admin/blocked").then(setList).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  async function set(p: string, blocked: boolean) {
    setError(""); setMsg("");
    try {
      await post("/api/admin/block", { phone: p, blocked });
      setMsg(blocked ? `${p} is blocked from sending requests.` : `${p} is unblocked.`);
      setPhone("");
      load();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="stack">
      <form className="card" onSubmit={(e) => { e.preventDefault(); set(phone, true); }}>
        <h3>Block a number</h3>
        <p className="small" style={{ marginTop: 4 }}>For numbers that send fake requests. A blocked number can’t send new requests.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" style={{ flex: "1 1 200px" }} placeholder="01XXXXXXXXX" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn red">Block</button>
        </div>
      </form>
      {msg && <p className="notice ok" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <section className="card">
        <h3>Blocked</h3>
        {list.length === 0 ? <p className="small" style={{ marginTop: 8 }}>No blocked numbers.</p> : (
          <ul className="list" style={{ marginTop: 12 }}>
            {list.map((b) => (
              <li key={b.phone}>
                <span><b>{b.phone}</b> <span className="small">{b.full_name} · {b.requests} requests, {b.rejected} rejected</span></span>
                <button className="btn ghost sm" onClick={() => set(b.phone, false)}>Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
