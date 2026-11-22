"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { get, post, when } from "@/lib/api";

type DemoDonor = { donor_id: number; full_name: string; blood_group: string };
type Profile = { donor_id: number; full_name: string; blood_group: string; campus: string | null; is_available: boolean;
                 next_eligible_date: string | null; last_donated: string | null; donations: number;
                 web_push: boolean; telegram: boolean };
type InboxItem = { request_id: number; distance_km: string; response: string; sent_at: string;
                   blood_group: string; urgency: string; hospital: string; request_status: string };
type Rest = { canDonate: boolean; daysLeft: number; pct: number };

const KEY = "bloodride.demoDonor";
const PRETTY = (g: string) => g.replace("-", "−");
const dateText = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function readSaved(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
function save(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* private mode: fine */ }
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 90-day rule as the donor sees it: can donate today, or how long the break still runs.
function restFrom(p: Profile): Rest {
  if (!p.next_eligible_date) return { canDonate: true, daysLeft: 0, pct: 100 };
  const left = Math.ceil((new Date(p.next_eligible_date).getTime() - Date.now()) / 86_400_000);
  return left <= 0 ? { canDonate: true, daysLeft: 0, pct: 100 }
                   : { canDonate: false, daysLeft: left, pct: Math.round(((90 - left) / 90) * 100) };
}

const isOpen = (a: InboxItem) => a.response === "pending" && !["closed", "cancelled"].includes(a.request_status);

export default function DonorView() {
  const [donors, setDonors] = useState<DemoDonor[]>([]);
  const [donorId, setDonorId] = useState("");
  const [me, setMe] = useState<Profile | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [pushState, setPushState] = useState("");
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadProfile = useCallback((id: string) => {
    get<Profile>(`/api/donors/${id}`).then((p) => { setMe(p); setRest(restFrom(p)); }).catch(() => {});
  }, []);

  useEffect(() => {
    get<DemoDonor[]>("/api/demo/donors").then((list) => {
      setDonors(list);
      const saved = readSaved();
      setDonorId(list.some((d) => String(d.donor_id) === saved) ? saved : String(list[0]?.donor_id ?? ""));
    }).catch(() => setError("Could not reach the BloodRide server"));
  }, []);

  useEffect(() => {
    if (!donorId) return;
    save(donorId);
    loadProfile(donorId);
    get<{ enabled: boolean; link: string | null }>(`/api/donors/${donorId}/telegram`)
      .then((t) => setTgLink(t.link)).catch(() => {});
    const load = () => get<InboxItem[]>(`/api/donors/${donorId}/alerts`).then(setInbox).catch(() => {});
    load();
    const timer = setInterval(load, 4000);     // the inbox works even without push or Telegram
    return () => clearInterval(timer);
  }, [donorId, loadProfile]);

  async function toggleAvailable() {
    if (!me) return;
    await post(`/api/donors/${donorId}/availability`, { available: !me.is_available }).catch(() => {});
    loadProfile(donorId);
  }

  async function enablePush() {
    setPushState("");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return setPushState("This browser can’t show notifications, so use Telegram or keep this page open");
    }
    if (!window.isSecureContext) {
      return setPushState("Notifications need a secure (https) address, so on a phone over Wi-Fi use Telegram for now");
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setPushState("Notifications are blocked in this browser’s settings");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { public_key } = await get<{ public_key: string }>("/api/push/public-key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key),
      });
      await post(`/api/donors/${donorId}/webpush`, sub.toJSON());
      loadProfile(donorId);
    } catch (e) {
      setPushState(`Couldn’t turn on notifications: ${(e as Error).message}`);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!me || !rest) return <p className="muted">Loading…</p>;

  const openCount = inbox.filter(isOpen).length;

  return (
    <>
      <div className="viewing">
        <span>Viewing as</span>
        <select aria-label="Sample donor" value={donorId} onChange={(e) => setDonorId(e.target.value)}>
          {donors.map((d) => <option key={d.donor_id} value={d.donor_id}>{d.full_name} ({PRETTY(d.blood_group)})</option>)}
        </select>
        <span>until donor sign-in is ready</span>
      </div>

      <section className="me">
        <div className="tag" aria-label={`Blood group ${me.blood_group}`}>{PRETTY(me.blood_group)}</div>
        <div>
          <h1>{me.full_name}</h1>
          <p>{me.campus ?? "No campus"} · {me.donations} donation{me.donations === 1 ? "" : "s"} recorded</p>
        </div>
      </section>

      {rest.canDonate ? (
        <div className="status">
          <b>You can donate today</b>
          <span className="muted">{me.last_donated ? `Last donation ${dateText(me.last_donated)}` : "No donation recorded yet"}</span>
        </div>
      ) : (
        <div className="status rest">
          <b>Resting until {dateText(me.next_eligible_date!)}</b>
          <span className="muted">{rest.daysLeft} days left of your 90-day break, no alerts until then</span>
          <div className="bar" role="progressbar" aria-label="90-day break" aria-valuenow={rest.pct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${rest.pct}%` }} />
          </div>
        </div>
      )}

      <h2>Requests for you{openCount ? ` (${openCount})` : ""}</h2>
      {inbox.length === 0 ? (
        <p className="muted">Nothing right now, we’ll alert you when someone within 10 km needs {PRETTY(me.blood_group)}</p>
      ) : (
        <div className="card" style={{ padding: "4px 20px" }}>
          {inbox.map((a) => {
            const open = isOpen(a);
            return (
              <div className={`req ${open ? "" : "done"}`} key={a.request_id}>
                <span className="g">{PRETTY(a.blood_group)}</span>
                <div>
                  <h3>{a.hospital}</h3>
                  <p>{a.distance_km} km away · {when(a.sent_at)} · {open ? a.urgency : a.response}</p>
                </div>
                <Link className={`btn ${open ? "primary" : ""}`} href={`/alert/${a.request_id}/${donorId}`}>{open ? "Respond" : "View"}</Link>
              </div>
            );
          })}
        </div>
      )}

      <h2>How we reach you</h2>
      <div className="card" style={{ padding: "4px 20px" }}>
        <div className="setting">
          <div><h3>Available for alerts</h3><p>Pause any time, for example when you’re ill or travelling</p></div>
          <button className="switch" role="switch" aria-checked={me.is_available} aria-label="Available for alerts" onClick={toggleAvailable} />
        </div>
        <div className="setting">
          <div><h3>Browser notifications</h3><p>On this phone or computer</p></div>
          {me.web_push ? <span className="on">On</span> : <button onClick={enablePush}>Turn on</button>}
        </div>
        <div className="setting">
          <div><h3>Telegram</h3><p>{tgLink ? "Messages from the BloodRide bot" : "Not set up on this server yet"}</p></div>
          {me.telegram ? <span className="on">On</span>
            : tgLink ? <a className="btn" href={tgLink} target="_blank" rel="noreferrer">Link</a>
            : <span className="small">Soon</span>}
        </div>
      </div>
      {pushState && <p className="small" role="status">{pushState}</p>}
    </>
  );
}
