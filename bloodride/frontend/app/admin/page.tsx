import { Suspense } from "react";
import AdminView from "./admin-view";

export default function AdminPage() {
  return (
    <main>
      <h1>Slips to check</h1>
      <p className="lead">These requests are already live, so mark each slip genuine or reject a fake one to stop it</p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <AdminView />
      </Suspense>
    </main>
  );
}
