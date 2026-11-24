import { Suspense } from "react";
import Board from "./board";

export default function TrackPage() {
  return (
    <Suspense fallback={<main className="container narrow"><p className="muted">Loading your request…</p></main>}>
      <Board />
    </Suspense>
  );
}
