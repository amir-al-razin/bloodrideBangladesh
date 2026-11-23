import Link from "next/link";

export default function Home() {
  return (
    <main className="home-hero">
      <svg
        className="home-lines"
        viewBox="0 0 600 420"
        fill="none"
        aria-hidden="true"
      >
        <line x1="360" y1="0" x2="360" y2="420" stroke="var(--rule)" strokeWidth="1" />
        <line x1="120" y1="250" x2="600" y2="250" stroke="var(--rule)" strokeWidth="1" />
        <line x1="210" y1="420" x2="580" y2="20" stroke="var(--rule)" strokeWidth="1" />
      </svg>

      <h1 className="home-title">
        WE MOVE <span>DONORS.</span>
        <br />
        YOU SAVE LIVES.
      </h1>

      <p className="home-sub">
        Dhaka’s blood logistics network. No friction. No syndicates.
      </p>

      <div className="home-cta">
        <Link className="btn primary pill-btn" href="/request">
          REQUEST BLOOD
        </Link>
        <Link className="btn dark pill-btn" href="/donor">
          DONATE BLOOD
        </Link>
      </div>
    </main>
  );
}
