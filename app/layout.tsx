import type { Metadata } from "next";
import { Libre_Franklin, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Visual direction: "Federal Register" — see README. Typeface pairing:
// Libre Franklin (display / a Franklin Gothic revival used across statistical
// publications), Public Sans (body / the USWDS government text face), IBM Plex
// Mono (figures / monospaced digits reading as exact register counts).
const display = Libre_Franklin({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chileans in Canton Zug — a data explorer for a very small population",
  description:
    "An honest exploration of official statistics on Chilean nationals and Chilean-born residents in Canton Zug, Switzerland. Every cell resolves to observed, structural zero, suppressed, or not published.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
