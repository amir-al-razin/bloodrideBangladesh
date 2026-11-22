import { Suspense } from "react";
import DonorView from "./donor-view";

export default function DonorPage() {
  return (
    <main>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <DonorView />
      </Suspense>
    </main>
  );
}
