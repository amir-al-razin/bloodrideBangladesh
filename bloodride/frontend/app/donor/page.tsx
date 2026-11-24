import { Suspense } from "react";
import DonorView from "./donor-view";

export const metadata = { title: "Donors · BloodRide BD" };

export default function DonorPage() {
  return (
    <main className="container narrow">
      <p className="label">For donors</p>
      <h1>Give blood when it’s close by</h1>
      <p className="lead">You get an alert only for your blood group, near you, from a hospital-approved request.</p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <DonorView />
      </Suspense>
    </main>
  );
}
