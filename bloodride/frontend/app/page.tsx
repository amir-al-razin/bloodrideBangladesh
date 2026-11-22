import Link from "next/link";
import { Suspense } from "react";
import RequestForm from "./request/request-form";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="bn" lang="bn">রক্ত লাগবে?</p>
        <h1>Find a blood donor near the hospital, today</h1>
        <p className="lead">Fill in the request below and send the doctor’s slip, and we alert donors close to the hospital straight away</p>
      </section>

      <Suspense fallback={<div className="card" style={{ minHeight: 420 }} />}>
        <RequestForm />
      </Suspense>

      <ul className="facts-line">
        <li>Only donors past their 90-day wait</li>
        <li>Your number is shared only with donors who accept</li>
        <li>Far donors get a student volunteer ride</li>
      </ul>

      <div className="donate-line">
        <p><b>Can you give blood?</b> We message you only when someone close by needs your group, and you choose every time</p>
        <Link className="btn" href="/donor">Become a donor</Link>
      </div>
    </main>
  );
}
