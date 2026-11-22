"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { get, type Hospital } from "@/lib/api";

export default function HospitalList() {
  const [hospitals, setHospitals] = useState<Hospital[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    get<Hospital[]>("/api/hospitals").then(setHospitals).catch(() => setError("Could not reach the BloodRide server"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!hospitals) return <p className="muted">Loading hospitals…</p>;
  return (
    <ul className="list card">
      {hospitals.map((h) => (
        <li key={h.hospital_id}>
          <span>
            <b>{h.name}</b>
            <br />
            <span className="small">{h.address}</span>
          </span>
          <Link className="btn" href={`/poster/${h.hospital_id}`}>Open poster</Link>
        </li>
      ))}
    </ul>
  );
}
