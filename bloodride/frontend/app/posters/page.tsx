import { Suspense } from "react";
import HospitalList from "./hospital-list";

export default function PostersPage() {
  return (
    <main>
      <h1>Hospital posters</h1>
      <p className="lead">Print one for each ward, scanning it opens the request form with the hospital already chosen</p>
      <Suspense fallback={<p className="muted">Loading hospitals…</p>}>
        <HospitalList />
      </Suspense>
    </main>
  );
}
