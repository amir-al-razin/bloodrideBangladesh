"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { get, GROUPS, postForm, type Hospital } from "@/lib/api";

type Nearby = { radius_km: number; groups: Record<string, number> };

const URGENCY = [
  { value: "emergency", label: "Emergency", note: "within 6 hours" },
  { value: "urgent", label: "Urgent", note: "today" },
  { value: "scheduled", label: "Scheduled", note: "a planned date" },
];

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RequestForm() {
  const router = useRouter();
  const params = useSearchParams();
  const fromQr = params.get("hospital");

  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [hospitalId, setHospitalId] = useState(fromQr ?? "");
  const [nearbyFor, setNearbyFor] = useState<{ id: string; data: Nearby } | null>(null);
  const [group, setGroup] = useState("");
  const [bags, setBags] = useState("1");
  const [urgency, setUrgency] = useState("urgent");
  const [neededBy, setNeededBy] = useState(() => localInput(new Date(Date.now() + 3 * 3600_000)));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    get<Hospital[]>("/api/hospitals").then(setHospitals).catch(() => setError("Can’t reach BloodRide right now. Please try again."));
  }, []);

  useEffect(() => {
    if (!hospitalId) return;
    get<Nearby>(`/api/hospitals/${hospitalId}/donors`).then((data) => setNearbyFor({ id: hospitalId, data })).catch(() => {});
  }, [hospitalId]);
  const nearby = nearbyFor && nearbyFor.id === hospitalId ? nearbyFor.data : null;

  const preview = useMemo(() => (slip ? URL.createObjectURL(slip) : ""), [slip]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const hospital = hospitals.find((h) => String(h.hospital_id) === hospitalId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!hospitalId) return setError("Choose the hospital.");
    if (!group) return setError("Choose the blood group.");
    if (!slip) return setError("Add a photo of the doctor’s slip.");
    const form = new FormData();
    form.set("hospital_id", hospitalId);
    form.set("blood_group", group);
    form.set("bags_needed", bags);
    form.set("urgency", urgency);
    form.set("needed_by", neededBy);
    form.set("full_name", name);
    form.set("phone", phone);
    form.set("slip", slip);
    setBusy(true);
    try {
      const res = await postForm<{ tracking_token: string }>("/api/requests", form);
      router.push(`/track/${res.tracking_token}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ marginTop: 28 }}>
      <div className="form-section">
        <h3>1. Hospital</h3>
        <p>Where the patient is admitted</p>
      </div>
      {fromQr && hospital ? (
        <div className="spread">
          <div>
            <b style={{ fontSize: "1.15rem" }}>{hospital.name}</b>
            <div className="small">{hospital.address} · from the QR poster</div>
          </div>
          <button type="button" className="linklike" onClick={() => router.replace("/request")}>Change</button>
        </div>
      ) : (
        <select className="input" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} required>
          <option value="">Choose a hospital</option>
          {hospitals.map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>)}
        </select>
      )}

      <div className="form-section">
        <h3>2. Blood needed</h3>
        <p>{nearby ? `The number under each group is how many donors can give today within ${nearby.radius_km} km` : "Choose the patient’s blood group"}</p>
      </div>
      <div className="pills" role="radiogroup" aria-label="Blood group">
        {GROUPS.map((g) => (
          <label className="pill blood" key={g}>
            <input type="radio" name="group" value={g} checked={group === g} onChange={() => setGroup(g)} />
            <span>{g}{nearby && <small>{nearby.groups[g] ?? 0} nearby</small>}</span>
          </label>
        ))}
      </div>

      <div className="field">
        <span>Bags</span>
        <div className="pills" role="radiogroup" aria-label="Bags">
          {["1", "2", "3", "4"].map((b) => (
            <label className="pill" key={b}>
              <input type="radio" name="bags" value={b} checked={bags === b} onChange={() => setBags(b)} />
              <span>{b}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <span>How urgent</span>
        <div className="pills three" role="radiogroup" aria-label="Urgency">
          {URGENCY.map((u) => (
            <label className="pill" key={u.value}>
              <input type="radio" name="urgency" value={u.value} checked={urgency === u.value} onChange={() => setUrgency(u.value)} />
              <span>{u.label}<small>{u.note}</small></span>
            </label>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Needed by</span>
        <input className="input" type="datetime-local" required value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
      </label>

      <div className="form-section">
        <h3>3. Your details</h3>
        <p>Only the hospital staff see your number. No account needed.</p>
      </div>
      <label className="field">
        <span>Your name</span>
        <input className="input" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Mobile number</span>
        <input className="input" inputMode="tel" autoComplete="tel" placeholder="01712345678" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>

      <div className="field">
        <span>Doctor’s slip</span>
        <label className="upload">
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setSlip(e.target.files?.[0] ?? null)} />
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          {preview ? <img className="thumb" src={preview} alt="Slip preview" /> : <span className="thumb" aria-hidden="true">📄</span>}
          <span>
            <b>{slip ? "Slip added, tap to change" : "Take or upload a photo"}</b>
            <span className="small" style={{ display: "block" }}>The blood bank checks it before any donor is alerted</span>
          </span>
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn red lg block" style={{ marginTop: 28 }} disabled={busy}>
        {busy ? "Sending…" : "Send request to the hospital"}
      </button>
      <p className="small" style={{ marginTop: 12, textAlign: "center" }}>Blood is always free. Nobody may ask you for money for it.</p>
    </form>
  );
}
