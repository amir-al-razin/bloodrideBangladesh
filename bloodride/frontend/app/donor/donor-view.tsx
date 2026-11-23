"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { get, post, when } from "@/lib/api";

type DemoDonor = { donor_id: number; full_name: string; blood_group: string };
type Profile = {
  donor_id: number; full_name: string; phone: string; blood_group: string; campus_id: number | null; campus: string | null;
  is_available: boolean; listed_for_reveal: boolean; next_eligible_date: string | null; member_since: string;
  last_donated: string | null; donations: number; times_shown: number; web_push: boolean; telegram: boolean;
};
type InboxItem = { request_id: number; distance_km: string; response: string; sent_at: string;
                   blood_group: string; urgency: string; hospital: string; request_status: string };
type Donation = { donation_id: number; donated_on: string; source: string; hospital: string | null; blood_group: string | null };
type Mission = { mission_id: number; status: string; created_at: string; phone_shared: boolean; hospital: string; blood_group: string };
type History = { donations: Donation[]; missions: Mission[] };
type Shown = { revealed_at: string; blood_group: string; hospital: string; request_status: string };
type Campus = { campus_id: number; name: string };
type Rest = { canDonate: boolean; daysLeft: number; pct: number };
type Tab = "requests" | "history" | "settings";

const KEY = "bloodride.demoDonor";
const PRETTY = (g: string) => g.replace("-", "−");
const dateText = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const MISSION_TEXT: Record<string, string> = {
  reserved: "On the way", en_route: "On the way", at_hospital: "At the hospital", donated: "Donated",
  resting: "Resting", returning: "Going home", completed: "Completed", failed_screening: "Could not donate", cancelled: "Cancelled",
};

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
                   : { canDonate: false, daysLeft: left, pct: Math.max(0, Math.round(((90 - left) / 90) * 100)) };
}

const isOpen = (a: InboxItem) => a.response === "pending" && !["closed", "cancelled"].includes(a.request_status);

export default function DonorView() {
  const [donors, setDonors] = useState<DemoDonor[]>([]);
  const [donorId, setDonorId] = useState("");
  const [tab, setTab] = useState<Tab>("requests");
  const [me, setMe] = useState<Profile | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [shown, setShown] = useState<Shown[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [reportDate, setReportDate] = useState("");
  const [note, setNote] = useState("");
  const [pushState, setPushState] = useState("");
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [error, setError] = useState("");

  const applyProfile = useCallback((p: Profile) => { setMe(p); setRest(restFrom(p)); }, []);
  const loadProfile = useCallback((id: string) => {
    get<Profile>(`/api/donors/${id}`).then(applyProfile).catch(() => {});
  }, [applyProfile]);
  const loadHistory = useCallback((id: string) => {
    get<History>(`/api/donors/${id}/history`).then(setHistory).catch(() => {});
    get<Shown[]>(`/api/donors/${id}/reveals`).then(setShown).catch(() => {});
  }, []);

  useEffect(() => {
    get<DemoDonor[]>("/api/demo/donors").then((list) => {
      setDonors(list);
      const saved = readSaved();
      setDonorId(list.some((d) => String(d.donor_id) === saved) ? saved : String(list[0]?.donor_id ?? ""));
    }).catch(() => setError("Could not reach the BloodRide server"));
    get<Campus[]>("/api/campuses").then(setCampuses).catch(() => {});
  }, []);

  useEffect(() => {
    if (!donorId) return;
    save(donorId);
    loadProfile(donorId);
    loadHistory(donorId);
    get<{ enabled: boolean; link: string | null }>(`/api/donors/${donorId}/telegram`)
      .then((t) => setTgLink(t.link)).catch(() => {});
    const load = () => get<InboxItem[]>(`/api/donors/${donorId}/alerts`).then(setInbox).catch(() => {});
    load();
    const timer = setInterval(load, 4000);     // the request list works even without push or Telegram
    return () => clearInterval(timer);
  }, [donorId, loadProfile, loadHistory]);

  async function saveSettings(change: Record<string, unknown>) {
    try {
      applyProfile(await post<Profile>(`/api/donors/${donorId}/settings`, change));
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function reportDonation(e: React.FormEvent) {
    e.preventDefault();
    if (!reportDate) return;
    setNote("");
    try {
      applyProfile(await post<Profile>(`/api/donors/${donorId}/donations`, { donated_on: reportDate }));
      setReportDate("");
      setNote("Donation added, your 90-day break is updated");
      loadHistory(donorId);
    } catch (err) {
      setNote((err as Error).message);
    }
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

  const canRespond = rest.canDonate && me.is_available;      // resting or paused donors can only view
  const openCount = canRespond ? inbox.filter(isOpen).length : 0;
  const g = PRETTY(me.blood_group);

  return (
    <>
      <div className="viewing">
        <span>Viewing as</span>
        <select aria-label="Sample donor (until donor sign-in is ready)" value={donorId} onChange={(e) => { setDonorId(e.target.value); setNote(""); }}>
          {donors.map((d) => <option key={d.donor_id} value={d.donor_id}>{d.full_name} ({PRETTY(d.blood_group)})</option>)}
        </select>
      </div>

      <section className="me">
        <div className="tag" aria-label={`Blood group ${me.blood_group}`}>{g}</div>
        <div>
          <h1>{me.full_name}</h1>
          <p>{me.campus ?? "No campus"} · donor since {dateText(me.member_since)}</p>
        </div>
      </section>

      {rest.canDonate ? (
        <div className={`status ${me.is_available ? "" : "rest"}`}>
          <b>{me.is_available ? "You can donate today" : "Alerts are paused"}</b>
          <span className="muted">
            {me.is_available
              ? (me.last_donated ? `Last donation ${dateText(me.last_donated)}` : "No donation recorded yet")
              : "Turn alerts back on in Settings when you’re ready"}
          </span>
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

      <div className="tabs" role="tablist" aria-label="Donor dashboard">
        {([["requests", `Requests${openCount ? ` (${openCount})` : ""}`], ["history", "History"], ["settings", "Settings"]] as [Tab, string][])
          .map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setNote(""); }}>{label}</button>
          ))}
      </div>

      {tab === "requests" && !canRespond && inbox.length > 0 && (
        <p className="small" style={{ marginTop: 0 }}>
          {me.is_available ? "You’re resting, so these requests are for viewing only" : "Alerts are paused, so these requests are for viewing only"}
        </p>
      )}
      {tab === "requests" && (
        inbox.length === 0 ? (
          <p className="muted">Nothing right now, we’ll alert you when someone within 10&nbsp;km needs {g}</p>
        ) : (
          <div className="card flush">
            {inbox.map((a) => {
              const open = isOpen(a) && canRespond;
              return (
                <div className={`req ${open ? "" : "done"}`} key={a.request_id}>
                  <span className="g">{PRETTY(a.blood_group)}</span>
                  <div>
                    <h3>{a.hospital}</h3>
                    <p>{a.distance_km}&nbsp;km away · {when(a.sent_at)} · {open ? a.urgency : a.response}</p>
                  </div>
                  <Link className={`btn ${open ? "primary" : ""}`} href={`/alert/${a.request_id}/${donorId}`}>{open ? "Respond" : "View"}</Link>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "history" && (
        <>
          <div className="mini-stats">
            <div><b>{me.donations}</b><span>donation{me.donations === 1 ? "" : "s"}</span></div>
            <div><b>{me.last_donated ? dateText(me.last_donated) : "None"}</b><span>last donation</span></div>
            <div><b>{rest.canDonate ? "Today" : dateText(me.next_eligible_date!)}</b><span>can donate from</span></div>
          </div>

          <form className="card" onSubmit={reportDonation}>
            <h3>I donated somewhere else</h3>
            <p className="small" style={{ margin: "4px 0 0" }}>Add it here so we don’t alert you during your 90-day break</p>
            <div className="inline-form">
              <input type="date" aria-label="Donation date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required />
              <button className="primary" type="submit" disabled={!reportDate}>Add donation</button>
            </div>
            {note && <p className="small" role="status" style={{ margin: "10px 0 0" }}>{note}</p>}
          </form>

          <h2>Donations</h2>
          {history && history.donations.length === 0 && <p className="muted">No donations recorded yet</p>}
          {history && history.donations.length > 0 && (
            <div className="card flush">
              {history.donations.map((d) => (
                <div className="hist" key={d.donation_id}>
                  <b>{dateText(d.donated_on)}</b>
                  <span>{d.source === "bloodride" ? `Through BloodRide · ${d.hospital}` : "Reported by you"}</span>
                </div>
              ))}
            </div>
          )}

          {history && history.missions.length > 0 && (
            <>
              <h2>Requests you accepted</h2>
              <div className="card flush">
                {history.missions.map((m) => (
                  <div className="hist" key={m.mission_id}>
                    <b>{m.hospital}</b>
                    <span>{PRETTY(m.blood_group)} · {when(m.created_at)} · {MISSION_TEXT[m.status] ?? m.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2>Who saw your number</h2>
          {shown.length === 0 ? (
            <p className="muted">{me.listed_for_reveal ? "No one yet" : "No one, your number is hidden from patients (see Settings)"}</p>
          ) : (
            <div className="card flush">
              {shown.map((s, i) => (
                <div className="hist" key={i}>
                  <b>{s.hospital}</b>
                  <span>A verified patient needing {PRETTY(s.blood_group)} · {when(s.revealed_at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "settings" && (
        <>
          <div className="card flush">
            <div className="setting">
              <div><h3>Available for alerts</h3><p>Pause any time, for example when you’re ill or travelling</p></div>
              <button className="switch" role="switch" aria-checked={me.is_available} aria-label="Available for alerts"
                      onClick={() => saveSettings({ is_available: !me.is_available })} />
            </div>
            <div className="setting">
              <div>
                <h3>Show my number to verified patients</h3>
                <p>Patients whose doctor’s slip we checked can call you directly, and you see each time it happens</p>
              </div>
              <button className="switch" role="switch" aria-checked={me.listed_for_reveal} aria-label="Show my number to verified patients"
                      onClick={() => saveSettings({ listed_for_reveal: !me.listed_for_reveal })} />
            </div>
            <div className="setting">
              <div><h3>Campus</h3><p>Volunteers from your campus are matched first</p></div>
              <select aria-label="Campus" style={{ width: "auto", maxWidth: 230 }} value={me.campus_id ?? ""}
                      onChange={(e) => saveSettings(e.target.value ? { campus_id: Number(e.target.value) } : { clear_campus: true })}>
                <option value="">No campus</option>
                {campuses.map((c) => <option key={c.campus_id} value={c.campus_id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <h2>How we reach you</h2>
          <div className="card flush">
            <div className="setting">
              <div><h3>Browser notifications</h3><p>On this phone or computer</p></div>
              {me.web_push ? <span className="on">On</span> : <button onClick={enablePush}>Turn on</button>}
            </div>
            <div className="setting">
              <div><h3>Telegram</h3><p>{tgLink ? "Messages from the BloodRide bot" : "Coming in a later sprint"}</p></div>
              {me.telegram ? <span className="on">On</span>
                : tgLink ? <a className="btn" href={tgLink} target="_blank" rel="noreferrer">Link</a>
                : <span className="small">Soon</span>}
            </div>
            <div className="setting">
              <div><h3>Your number</h3><p>Shown to a patient only if you choose to share it</p></div>
              <span className="small">{me.phone}</span>
            </div>
          </div>
          {pushState && <p className="small" role="status">{pushState}</p>}
          {note && <p className="error" role="alert">{note}</p>}
        </>
      )}
    </>
  );
}
