import { Suspense } from "react";
import RequestForm from "./request-form";

export default function RequestPage() {
  return (
    <main>
      <h1>Request blood</h1>
      <p className="lead">Three quick steps, about a minute, with the doctor’s slip ready</p>
      <Suspense fallback={<p className="muted">Loading form…</p>}>
        <RequestForm />
      </Suspense>
    </main>
  );
}
