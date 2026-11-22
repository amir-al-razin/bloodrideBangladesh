import type { Metadata, Viewport } from "next";
import { Figtree, Hind_Siliguri } from "next/font/google";
import Link from "next/link";
import Drop from "@/components/drop";
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
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand"><Drop size={24} /><span>Blood<b>Ride</b></span></Link>
            <nav><Link href="/donor">For donors</Link></nav>
          </header>
          {children}
          <footer className="bottom">
            <span>BloodRide · Dhaka</span>
            <nav><Link href="/posters">Hospital posters</Link><Link href="/admin">Admin</Link></nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
