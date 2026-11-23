import type { Metadata, Viewport } from "next";
import { Figtree, Hind_Siliguri } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import TopNav from "@/components/top-nav";
import "./globals.css";

// Figtree for all English text; Hind Siliguri only for Bangla (it is the fallback for Bengali characters).
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const hind = Hind_Siliguri({ subsets: ["latin", "bengali"], weight: ["400", "500", "600", "700"], variable: "--font-hind" });

export const metadata: Metadata = {
  title: "BloodRide · রক্তদাতা খুঁজুন",
  description: "Find a blood donor near your hospital in Dhaka",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbf8f5" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${hind.variable}`}>
      <body>
        <div className="shell">
          <header className="top">
            <Link href="/" className="brand"><span>Blood<b>Ride</b></span></Link>
            <Suspense
              fallback={
                <nav aria-label="Primary">
                  <Link href="/faq" className="nav-link">FAQ</Link>
                </nav>
              }
            >
              <TopNav />
            </Suspense>
          </header>
          <div className="page-body">{children}</div>
          <footer className="bottom">
            <span>BloodRide · Dhaka</span>
            <nav>
              <Link href="/faq">FAQ</Link>
              <Link href="/posters">Hospital posters</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
