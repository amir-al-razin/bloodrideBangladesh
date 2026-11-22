"use client";

import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { get, type Hospital } from "@/lib/api";

// The poster printed for a hospital. The QR opens the request form with the hospital filled in.
export default function Poster() {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const link = `${window.location.origin}/request?hospital=${hospitalId}`;
    QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then((img) => { setQr(img); setUrl(link); });
    get<Hospital>(`/api/hospitals/${hospitalId}`).then(setHospital).catch((e) => setError(e.message));
  }, [hospitalId]);

  if (error) return <p className="error">{error}</p>;
  return (
    <main className="poster">
      <h1 style={{ fontSize: 34 }}>Need blood? Scan here</h1>
      <p className="lead">{hospital?.name}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <div className="qr">{qr && <img src={qr} alt={`QR code for ${url}`} />}</div>
      <p>
        Send the doctor’s slip and we alert nearby donors, with live progress
        <br />
        No account needed
      </p>
      <p className="small">{url}</p>
      <button className="noprint" onClick={() => window.print()}>Print poster</button>
    </main>
  );
}
