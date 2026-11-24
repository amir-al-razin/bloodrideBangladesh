import { Suspense } from "react";
import RequestForm from "./request-form";

export default function RequestPage() {
  return (
    <main className="container narrow">
      <p className="label">Request blood</p>
      <h1>Find a donor near the hospital</h1>
      <p className="lead">Takes about a minute. Have the doctor’s slip ready.</p>
      <Suspense fallback={<div className="card" style={{ marginTop: 28, minHeight: 480 }} />}>
        <RequestForm />
      </Suspense>
    </main>
  );
}
