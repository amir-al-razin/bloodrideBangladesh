import Link from "next/link";

const STEPS = [
  { title: "Ask", text: "Scan the QR poster at the hospital, or open this site. Pick the blood group and add a photo of the doctor’s slip." },
  { title: "Approve", text: "The hospital’s blood bank checks the slip and taps Approve. Fake requests never reach a donor." },
  { title: "Alert", text: "Donors of that group who live close by and are past their 90-day rest get an alert. The search widens every few minutes." },
  { title: "Answer", text: "The first donor to say “I can donate” is yours, and you can call them. Others become backups." },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="label">Dhaka · Blood is always free</p>
          <h1>
            WE FIND <span className="red">DONORS.</span>
            <br />
            YOU SAVE LIVES.
          </h1>
          <p className="lead">
            A blood request approved by the hospital, sent in seconds to eligible donors who live nearby. No more calling a list one number at a time.
          </p>
          <div className="row cta">
            <Link className="btn red lg" href="/request">I need blood</Link>
            <Link className="btn lg" href="/donor">I am a donor</Link>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--gray)", padding: "72px 0" }}>
        <div className="container">
          <p className="label">How it works</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)", maxWidth: 760 }}>From request to a willing donor, without a single cold call.</h2>
          <div className="grid three" style={{ marginTop: 36 }}>
            {STEPS.map((s, i) => (
              <div className="step-card" key={s.title}>
                <span className="num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "72px 0" }}>
        <div className="container grid two" style={{ gap: 40 }}>
          <div>
            <p className="label">For patients’ families</p>
            <h2>You see every step, live.</h2>
            <p className="lead">A private link shows when the hospital approves, how many donors were alerted, who has seen it, and who said yes.</p>
            <Link className="btn red" style={{ marginTop: 20 }} href="/request">Request blood</Link>
          </div>
          <div>
            <p className="label">For donors</p>
            <h2>Only when it’s close, and only when you can.</h2>
            <p className="lead">We alert you only for your blood group, near you, after your 90-day rest. Your number is shared only if you choose.</p>
            <Link className="btn" style={{ marginTop: 20 }} href="/donor">Join as a donor</Link>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--black)", color: "var(--white)", padding: "64px 0" }}>
        <div className="container spread">
          <div>
            <p className="label">For hospitals</p>
            <h2 style={{ color: "var(--white)" }}>One tap to approve. That’s the whole job.</h2>
            <p className="lead" style={{ color: "#a1a1aa" }}>Blood-bank staff see the slip photo and approve or reject. We do the searching.</p>
          </div>
          <Link className="btn ghost lg" href="/staff">Staff sign in</Link>
        </div>
      </section>
    </>
  );
}
