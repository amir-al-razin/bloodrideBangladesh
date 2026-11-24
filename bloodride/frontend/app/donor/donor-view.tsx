"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { daysUntil, get, getMe, post, when, type Me } from "@/lib/api";
import { enablePush } from "@/lib/push";
import Join from "./join";
import LocationField, { type Spot } from "./location-field";

type Profile = {
  donor_id: number; full_name: string; phone: string; blood_group: string; campus_id: number | null; campus: string | null;
  is_available: boolean; listed_for_reveal: boolean; next_eligible_date: string | null; last_donated: string | null;
  donations: number; times_shown: number; web_push: boolean; telegram: boolean;
};
type Alert = {
  request_id: number; distance_km: string; response: string; sent_at: string; seen_at: string | null;
  blood_group: string; urgency: string; needed_by: string; request_status: string; hospital: string;
};
type History = {
  donations: { donation_id: number; donated_on: string; source: string; hospital: string | null }[];
  missions: { mission_id: number; status: string; created_at: string; hospital: string; blood_group: string }[];
};
type Shown = { revealed_at: string; blood_group: string; hospital: string };
type Campus = { campus_id: number; name: string };

const ANSWER: Record<string, [string, string]> = {
  pending: ["Waiting for you", "red"], accepted: ["You said yes", "green"], declined: ["You said no", ""], backup: ["Backup", "amber"],
};

export default function DonorView() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const loadMe = useCallback(() => {
    getMe().then((m) => {
      setMe(m);
      if (m?.is_donor && next?.startsWith("/alert/")) router.replace(next);
    }).catch(() => setMe(null));
  }, [next, router]);

  useEffect(loadMe, [loadMe]);

  if (me === undefined) return <p className="muted">Loading…</p>;
  if (!me) return <Join onDone={loadMe} />;
  if (!me.is_donor) {
    return (
      <div className="notice warn" style={{ marginTop: 28 }}>
        You are signed in as {me.full_name}, which is not a donor account.{" "}
        <button className="linklike" onClick={async () => { await post("/api/auth/logout"); setMe(null); }}>Sign out</button>
      </div>
    );
  }
  return <Dashboard onSignOut={() => setMe(null)} />;
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tab, setTab] = useState<"alerts" | "history" | "settings">("alerts");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    get<Profile>("/api/me/profile").then(setP).catch((e) => setError(e.message));
    get<Alert[]>("/api/me/alerts").then(setAlerts).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => get<Alert[]>("/api/me/alerts").then(setAlerts).catch(() => {}), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function save(body: object, done?: string) {
    try {
      setP(await post<Profile>("/api/me/settings", body));
      if (done) setNote(done);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !p) return <p className="error">{error}</p>;
  if (!p) return <p className="muted">Loading your profile…</p>;

  const wait = daysUntil(p.next_eligible_date);
  const waiting = alerts.filter((a) => a.response === "pending" && ["open", "searching"].includes(a.request_status));

  return (
    <>
      <section className="card accent" style={{ marginTop: 28 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div className="group-badge">{p.blood_group}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2>{p.full_name}</h2>
            <p style={{ fontWeight: 700, marginTop: 4 }} className={wait ? "" : "red"}>
              {wait ? `Resting: you can give again in ${wait} day${wait === 1 ? "" : "s"} (${new Date(p.next_eligible_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })})` : "You can donate today"}
            </p>
            <span className="small">{p.donations} donation{p.donations === 1 ? "" : "s"} recorded{p.campus ? ` · ${p.campus}` : ""}</span>
          </div>
        </div>
        <label className="switch" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--gray)" }}>
          <span>
            <b>Available for alerts</b>
            <span className="small" style={{ display: "block" }}>{p.is_available ? "You’ll be alerted for nearby requests." : "Paused. No alerts until you turn this on."}</span>
          </span>
          <input type="checkbox" checked={p.is_available} onChange={(e) => save({ is_available: e.target.checked })} />
          <span className="track" />
        </label>
      </section>

      {!p.web_push && <PushPrompt onOn={load} />}

      <div className="tabs">
        <button className={tab === "alerts" ? "on" : ""} onClick={() => setTab("alerts")}>
          Requests{waiting.length > 0 && <span className="count">{waiting.length}</span>}
        </button>
        <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>History</button>
        <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Settings</button>
      </div>

      {note && <p className="notice ok" role="status" style={{ marginBottom: 16 }}>{note}</p>}
      {error && <p className="error">{error}</p>}

      {tab === "alerts" && <Alerts alerts={alerts} />}
      {tab === "history" && <HistoryTab onChange={load} />}
      {tab === "settings" && <Settings p={p} save={save} onSignOut={onSignOut} onNote={setNote} />}
    </>
  );
}

function PushPrompt({ onOn }: { onOn: () => void }) {
  const [msg, setMsg] = useState("");
  return (
    <div className="notice warn" style={{ marginTop: 16 }}>
      <div className="spread">
        <span><b>Turn on notifications</b> so you hear about requests even when this page is closed.</span>
        <button className="btn sm" onClick={async () => { const r = await enablePush(); setMsg(r.message); if (r.ok) onOn(); }}>Turn on</button>
      </div>
      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

function Alerts({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return <p className="card soft">No requests yet. When a hospital near you needs your blood group, it appears here and on your phone.</p>;
  }
  return (
    <ul className="list card">
      {alerts.map((a) => {
        const closed = !["open", "searching"].includes(a.request_status);
        const [label, tone] = closed && a.response === "pending" ? ["Closed", ""] : ANSWER[a.response] ?? [a.response, ""];
        return (
          <li key={a.request_id}>
            <span className="row nowrap">
              <span className="group-badge sm">{a.blood_group}</span>
              <span>
                <b>{a.hospital}</b>
                <span className="small" style={{ display: "block" }}>{a.distance_km} km from you · {a.urgency} · {when(a.sent_at)}</span>
              </span>
            </span>
            <span className="row">
              <span className={`tag ${tone}`}>{label}</span>
              <Link className={`btn sm ${a.response === "pending" && !closed ? "red" : "ghost"}`} href={`/alert/${a.request_id}`}>
                {a.response === "pending" && !closed ? "Answer" : "View"}
              </Link>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function HistoryTab({ onChange }: { onChange: () => void }) {
  const [h, setH] = useState<History | null>(null);
  const [shown, setShown] = useState<Shown[]>([]);
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    get<History>("/api/me/history").then(setH).catch(() => {});
    get<Shown[]>("/api/me/reveals").then(setShown).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function report(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post("/api/me/donations", { donated_on: date });
      setMsg("Saved. Your 90-day rest starts from that date.");
      setDate("");
      load();
      onChange();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Donations</h3>
        {h && h.donations.length === 0 && <p className="small" style={{ marginTop: 8 }}>None recorded yet.</p>}
        <ul className="list" style={{ marginTop: 12 }}>
          {h?.donations.map((d) => (
            <li key={d.donation_id}>
              <b>{new Date(d.donated_on).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</b>
              <span className="small">{d.source === "bloodride" ? `Through BloodRide · ${d.hospital}` : "Reported by you"}</span>
            </li>
          ))}
        </ul>
      </section>

      <form className="card" onSubmit={report}>
        <h3>Donated somewhere else?</h3>
        <p className="small" style={{ marginTop: 4 }}>Tell us the date so we don’t alert you during your 90-day rest.</p>
        <div className="row" style={{ marginTop: 14 }}>
          <input className="input" style={{ flex: "1 1 200px" }} type="date" required value={date}
                 max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          <button className="btn">Save</button>
        </div>
        {msg && <p className="small" style={{ marginTop: 10 }}>{msg}</p>}
      </form>

      <section className="card">
        <h3>Who saw your number</h3>
        {shown.length === 0 ? <p className="small" style={{ marginTop: 8 }}>Nobody yet.</p> : (
          <ul className="list" style={{ marginTop: 12 }}>
            {shown.map((s, i) => (
              <li key={i}><span>{s.blood_group} request at <b>{s.hospital}</b></span><span className="small">{when(s.revealed_at)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Settings({ p, save, onSignOut, onNote }: {
  p: Profile; save: (b: object, done?: string) => Promise<void>; onSignOut: () => void; onNote: (s: string) => void;
}) {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [tg, setTg] = useState<{ enabled: boolean; link: string | null } | null>(null);

  useEffect(() => {
    get<Campus[]>("/api/campuses").then(setCampuses).catch(() => {});
    get<{ enabled: boolean; link: string | null }>("/api/me/telegram").then(setTg).catch(() => {});
  }, []);

  async function moveHome(s: Spot) {
    setSpot(s);
    await post("/api/me/location", { lat: s.lat, lng: s.lng });
    onNote(`Home area set to ${s.label}.`);
  }

  return (
    <div className="stack">
      <section className="card stack">
        <label className="switch">
          <span>
            <b>Let families call me</b>
            <span className="small" style={{ display: "block" }}>Families with a hospital-approved {p.blood_group} request can see your number. You’re told each time.</span>
          </span>
          <input type="checkbox" checked={p.listed_for_reveal} onChange={(e) => save({ listed_for_reveal: e.target.checked })} />
          <span className="track" />
        </label>
      </section>

      <section className="card">
        <h3>Location</h3>
        <LocationField value={spot} onChange={moveHome} />
        <label className="field">
          <span>University or college</span>
          <select className="input" value={p.campus_id ?? ""}
                  onChange={(e) => save(e.target.value ? { campus_id: Number(e.target.value) } : { clear_campus: true }, "Saved.")}>
            <option value="">None</option>
            {campuses.map((c) => <option key={c.campus_id} value={c.campus_id}>{c.name}</option>)}
          </select>
        </label>
      </section>

      <section className="card">
        <h3>Notifications</h3>
        <ul className="list" style={{ marginTop: 12 }}>
          <li><span>This browser</span>{p.web_push ? <span className="tag green">On</span> : <span className="tag">Off</span>}</li>
          {tg?.enabled && (
            <li>
              <span>Telegram</span>
              {p.telegram ? <span className="tag green">On</span> : <a className="btn sm" href={tg.link ?? "#"} target="_blank" rel="noreferrer">Link Telegram</a>}
            </li>
          )}
        </ul>
      </section>

      <div className="spread">
        <span className="small">Signed in as {p.phone}</span>
        <button className="btn ghost sm" onClick={async () => { await post("/api/auth/logout"); onSignOut(); }}>Sign out</button>
      </div>
    </div>
  );
}
