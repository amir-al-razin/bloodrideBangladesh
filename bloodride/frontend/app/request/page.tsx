import Link from "next/link";
import { Suspense } from "react";
import RequestForm from "./request-form";

export default function RequestPage() {
  return (
    <main>
      <section className="hero">
        <p className="bn" lang="bn">রক্ত লাগবে?</p>
        <h1>Find a blood donor near you, anytime</h1>
        <p className="lead">
          Fill out the request form below and upload the doctor’s slip. We will alert donors in your proximity straight away.
        </p>
      </section>

      <Suspense fallback={<div className="card" style={{ minHeight: 420 }} />}>
        <RequestForm />
      </Suspense>

      <ul className="facts-line">
        <li>Only eligible donors are notified</li>
        <li>Your number is shared only with donors who accept</li>
        <li>Donors traveling from afar get a student volunteer ride</li>
      </ul>

      <div className="donate-line">
        <p>
          <b>Can you give blood?</b> We message you only when someone close by needs your blood group, and you choose every time.
        </p>
        <Link className="btn" href="/donor">Become a donor</Link>
      </div>
    </main>
  );
}
