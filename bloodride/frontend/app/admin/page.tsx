import { Suspense } from "react";
import AdminView from "./admin-view";

export const metadata = { title: "Admin · BloodRide BD" };

export default function AdminPage() {
  return (
    <main className="container">
      <p className="label">BloodRide team</p>
      <h1>Admin</h1>
      <p className="lead">Everything live across hospitals, staff logins, and blocked numbers.</p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <AdminView />
      </Suspense>
    </main>
  );
}
