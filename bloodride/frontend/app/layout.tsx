import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Outfit } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Outfit, the bloodridebd.com typeface; Hind Siliguri for Bangla text.
const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-outfit" });
const hind = Hind_Siliguri({ subsets: ["latin", "bengali"], weight: ["400", "600", "700"], variable: "--font-hind" });

export const metadata: Metadata = {
  title: "BloodRide BD · Find a blood donor near the hospital",
  description: "Hospital-approved blood requests, sent to eligible donors close by in Dhaka",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${hind.variable}`}>
      <body>
        <header className="header">
          <div className="container">
            <Link href="/" className="logo"><span className="r">Blood</span>Ride BD</Link>
            <nav className="nav">
              <Link href="/request" className="hide-sm">Request blood</Link>
              <Link href="/staff" className="hide-sm">Hospital staff</Link>
              <Link href="/donor" className="btn sm">I am a donor</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="footer">
          <div className="container">
            <span>BloodRide BD · Dhaka · Blood is always free</span>
            <nav>
              <Link href="/request">Request blood</Link>
              <Link href="/staff">Hospital staff</Link>
              <Link href="/posters">QR posters</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
