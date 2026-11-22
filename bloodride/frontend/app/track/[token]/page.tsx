import { Suspense } from "react";
import Board from "./board";

export default function TrackPage() {
  return (
    <Suspense fallback={<p className="muted">Loading your request…</p>}>
      <Board />
    </Suspense>
  );
}
