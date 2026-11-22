import { Suspense } from "react";
import Poster from "./poster";

export default function PosterPage() {
  return (
    <Suspense fallback={<p className="muted">Loading poster…</p>}>
      <Poster />
    </Suspense>
  );
}
