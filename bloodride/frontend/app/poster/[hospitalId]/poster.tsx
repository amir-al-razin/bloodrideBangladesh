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

  if (error) return <main className="container"><p className="error">{error}</p></main>;
  return (
    <main className="container poster">
      <p className="label"><span className="red">Blood</span>Ride BD</p>
      <h1>Need blood?<br />Scan here.</h1>
      <p className="lead" style={{ margin: "14px auto 0", fontWeight: 700, color: "var(--black)" }}>{hospital?.name}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <div className="qr">{qr && <img src={qr} alt={`QR code for ${url}`} />}</div>
      <p style={{ fontSize: "1.15rem", fontWeight: 600 }}>
        Send the doctor’s slip. The blood bank approves it, and donors nearby are alerted.
      </p>
      <p className="lead" style={{ margin: "8px auto 0" }} lang="bn">রক্ত লাগবে? স্ক্যান করুন।</p>
      <p className="small" style={{ marginTop: 18 }}>No account needed · Blood is always free · {url}</p>
      <button className="btn noprint" style={{ marginTop: 24 }} onClick={() => window.print()}>Print poster</button>
    </main>
  );
}
