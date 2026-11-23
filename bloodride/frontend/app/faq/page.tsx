import Link from "next/link";

const FAQS = [
  {
    q: "What is BloodRide?",
    a: "BloodRide is a Dhaka-based initiative that connects patients with nearby eligible blood donors and pairs far-away donors with student volunteer motorbike riders to take them to the hospital and back.",
  },
  {
    q: "Do patients need to sign up or create an account?",
    a: "No. Patients can submit a request straight away with a name, mobile number, and doctor’s slip, and follow live donor responses through a private tracking link.",
  },
  {
    q: "Why do I need to upload a doctor’s slip?",
    a: "The doctor’s requisition slip ensures every request is tied to a genuine medical need and prevents the same slip photo from being reused across multiple requests.",
  },
  {
    q: "Who gets alerted when a request is submitted?",
    a: "Only eligible, available donors of the needed blood group within range of the chosen hospital who are past their 90-day donation wait receive alerts.",
  },
  {
    q: "How is my phone number kept private?",
    a: "Patient phone numbers are never posted publicly. Donor numbers are shared only when a donor explicitly chooses to share their number on accepting, or opts in for verified patients.",
  },
  {
    q: "How does the 90-day donation wait work?",
    a: "After any donation recorded through BloodRide or self-reported by a donor, the system automatically pauses alerts for that donor for 90 days until their next eligible date.",
  },
  {
    q: "How do student volunteer rides work, and who pays?",
    a: "When a matched donor lives far from the hospital, a student volunteer rider from nearby campuses takes them there and brings them home after the post-donation rest. Upfront fares are shown before booking, and donors never pay or get paid.",
  },
  {
    q: "What happens if more than one donor accepts?",
    a: "The first donors to accept reserve the needed bags via a database lock so there are no duplicate assignments, and any additional donors who respond are placed on the backup list.",
  },
];

export default function FaqPage() {
  return (
    <main>
      <section className="hero">
        <p className="bn" lang="bn">প্রশ্নোত্তর</p>
        <h1>Frequently asked questions</h1>
        <p className="lead">
          Everything you need to know about requesting blood, donating safely, and volunteer rides in Dhaka.
        </p>
      </section>

      <div className="faq-list">
        {FAQS.map((item, i) => (
          <details className="faq-item" key={item.q} open={i === 0}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>

      <div className="home-cta" style={{ marginTop: 32 }}>
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
