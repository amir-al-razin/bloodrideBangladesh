import { Suspense } from "react";
import StaffView from "./staff-view";

export const metadata = { title: "Hospital staff · BloodRide BD" };

export default function StaffPage() {
  return (
    <main className="container">
      <p className="label">Hospital staff</p>
      <h1>Approve blood requests</h1>
      <p className="lead">Check the doctor’s slip. When you approve, nearby donors are alerted at once.</p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <StaffView />
      </Suspense>
    </main>
  );
}
