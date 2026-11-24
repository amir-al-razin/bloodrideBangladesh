import { Suspense } from "react";
import HospitalList from "./hospital-list";

export default function PostersPage() {
  return (
    <main className="container narrow">
      <p className="label">For hospitals</p>
      <h1>QR posters</h1>
      <p className="lead">Print one for the blood bank and each ward. Scanning it opens the request form with the hospital already chosen.</p>
      <Suspense fallback={<p className="muted">Loading hospitals…</p>}>
        <HospitalList />
      </Suspense>
    </main>
  );
}
