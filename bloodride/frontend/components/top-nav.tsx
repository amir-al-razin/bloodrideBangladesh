"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isRequest = pathname.startsWith("/request");
  const isDonor = pathname.startsWith("/donor");
  const isFaq = pathname.startsWith("/faq");

  if (isHome) {
    return (
      <nav aria-label="Primary">
        <Link href="/faq" className="nav-link">
          FAQ
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary">
      <Link
        href="/faq"
        className={isFaq ? "nav-link is-active" : "nav-link"}
        aria-current={isFaq ? "page" : undefined}
      >
        FAQ
      </Link>
      <Link
        href="/request"
        className={`nav-cta${isRequest ? " is-active" : isDonor ? " is-dim" : ""}`}
        aria-current={isRequest ? "page" : undefined}
      >
        Request blood
      </Link>
      <Link
        href="/donor"
        className={`nav-pill${isDonor ? " is-active" : isRequest ? " is-dim" : ""}`}
        aria-current={isDonor ? "page" : undefined}
      >
        Donate blood
      </Link>
    </nav>
  );
}
