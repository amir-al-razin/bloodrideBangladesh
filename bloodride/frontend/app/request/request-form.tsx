"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { get, postForm, type Hospital } from "@/lib/api";

// The one request form, used on /request (where the home page and hospital posters lead).
// Picking a hospital shows how many eligible donors per blood group are nearby right now.
// Nothing is sent until "Send request".

const GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const PRETTY = (g: string) => g.replace("-", "−");
const URGENCY = [
  { value: "emergency", label: "Emergency" },
  { value: "scheduled", label: "Scheduled" },
];

type Created = { tracking_token: string };
type Nearby = { radius_km: number; groups: Record<string, number> };

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RequestForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [hospitalId, setHospitalId] = useState(params.get("hospital") ?? "");
  const [changeHospital, setChangeHospital] = useState(false);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [group, setGroup] = useState(params.get("group") ?? "");
  const [bags, setBags] = useState(1);
  const [urgency, setUrgency] = useState("emergency");
  const [neededBy, setNeededBy] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const defaultTime = () => setNeededBy((v) => v || localInput(new Date(Date.now() + 3 * 3600_000)));  // in 3 hours
    get<Hospital[]>("/api/hospitals")
      .then((list) => { setHospitals(list); defaultTime(); })
      .catch(() => { setError("Could not reach the BloodRide server"); defaultTime(); });
    const pre = params.get("hospital");
    if (pre) get<Nearby>(`/api/hospitals/${pre}/donors`).then(setNearby).catch(() => {});
  }, [params]);

  function pickHospital(id: string) {
    setHospitalId(id);
    setNearby(null);
    if (id) get<Nearby>(`/api/hospitals/${id}/donors`).then(setNearby).catch(() => {});
  }

  function pickSlip(file: File | null) {
    setSlip(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  const ready =
    hospitalId &&
    name.trim().length >= 2 &&
    phone &&
    group &&
    slip &&
    (urgency !== "scheduled" || Boolean(neededBy)) &&
    !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !slip) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("hospital_id", hospitalId);
    form.set("full_name", name.trim());
    form.set("phone", phone);
    form.set("blood_group", group);
    form.set("bags_needed", String(bags));
    form.set("urgency", urgency);
    form.set(
      "needed_by",
      urgency === "scheduled" ? neededBy : localInput(new Date(Date.now() + 3 * 3600_000)),
    );
    form.set("slip", slip);
    try {
      const res = await postForm<Created>("/api/requests", form);
      router.push(`/track/${res.tracking_token}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const hospital = hospitals.find((h) => String(h.hospital_id) === hospitalId);
  const count = nearby && group ? nearby.groups[group] ?? 0 : null;

  return (
    <form onSubmit={submit} aria-label="Blood request">
      <section className="card">
        <label htmlFor="hospital" style={{ marginTop: 0 }}>Hospital</label>
        {params.get("hospital") && hospital && !changeHospital ? (
          <p style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <b>{hospital.name}</b>
            <button type="button" className="ghost" style={{ minHeight: 40, padding: "6px 14px" }} onClick={() => setChangeHospital(true)}>Change</button>
          </p>
        ) : (
          <select id="hospital" value={hospitalId} onChange={(e) => pickHospital(e.target.value)} required>
            <option value="">Where is the patient?</option>
            {hospitals.map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>)}
          </select>
        )}

        <label>Blood group</label>
        <div className="groups" role="group" aria-label="Blood group">
          {GROUPS.map((g) => {
            const n = nearby?.groups[g];
            return (
              <button type="button" key={g} aria-pressed={group === g} onClick={() => setGroup(g)} className={n === 0 ? "none" : ""}>
                {PRETTY(g)}
                {nearby && <small>{n ? `${n} nearby` : "none yet"}</small>}
              </button>
            );
          })}
        </div>
        {count !== null && (
          <p className="small" style={{ margin: "10px 0 0" }} aria-live="polite">
            {count
              ? `${count} ${PRETTY(group)} donor${count > 1 ? "s" : ""} within ${nearby!.radius_km}\u00a0km can donate today`
              : `No ${PRETTY(group)} donors within ${nearby!.radius_km}\u00a0km right now, but we’ll still keep looking`}
          </p>
        )}

        <div>
          <label htmlFor="bags">Bags</label>
          <input id="bags" type="number" min={1} max={10} value={bags}
                 onChange={(e) => setBags(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
        </div>

        <label>Urgency</label>
        <div className="seg" role="group" aria-label="Urgency">
          {URGENCY.map((u) => (
            <button type="button" key={u.value} aria-pressed={urgency === u.value} onClick={() => setUrgency(u.value)}>{u.label}</button>
          ))}
        </div>

        {urgency === "scheduled" && (
          <div>
            <label htmlFor="needed">Needed by</label>
            <input id="needed" type="datetime-local" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} required />
          </div>
        )}
      </section>

      <section className="card">
        <p className="step-title"><span className="num">2</span>Patient details</p>
        <p className="small" style={{ margin: 0 }}>No sign-up required — donors who accept can call you on this number.</p>
        <div className="row">
          <div>
            <label htmlFor="name">Patient’s full name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </div>
          <div>
            <label htmlFor="phone">Mobile number</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel"
                   placeholder="01XXXXXXXXX" autoComplete="tel" required />
          </div>
        </div>
      </section>

      <section className="card">
        <p className="step-title"><span className="num">3</span>Doctor’s slip</p>
        <label htmlFor="slip" style={{ marginTop: 8 }}>Take a photo of the slip</label>
        <input id="slip" type="file" accept="image/*" capture="environment"
               onChange={(e) => pickSlip(e.target.files?.[0] ?? null)} required />
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise */}
        {preview && <img src={preview} alt="Slip preview" style={{ width: "100%", marginTop: 12, borderRadius: 8, border: "1px solid var(--rule)" }} />}
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="primary wide" type="submit" disabled={!ready}>{busy ? "Sending…" : "Send request"}</button>
        <p className="small" style={{ textAlign: "center", margin: 0 }}>Donors are alerted only when you send the request.</p>
      </div>
    </form>
  );
}
