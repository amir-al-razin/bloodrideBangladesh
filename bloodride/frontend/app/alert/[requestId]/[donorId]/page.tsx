import { Suspense } from "react";
import AlertView from "./alert-view";

export default function AlertPage() {
  return (
    <Suspense fallback={<p className="muted">Loading the request…</p>}>
      <AlertView />
    </Suspense>
  );
}
