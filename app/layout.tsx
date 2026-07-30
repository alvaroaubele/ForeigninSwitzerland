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
  title: "Foreigners in Switzerland — every nationality, every canton",
  description:
    "An honest exploration of official statistics on every foreign nationality in Switzerland, nationally and by canton. Every cell resolves to observed, structural zero, suppressed, or not published.",
};

/**
 * Applied before first paint, so a dark-theme reader never sees a white flash.
 * It has to be inline and synchronous in <head> for that: anything deferred to
 * React runs after the browser has already painted the light default.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('theme');
if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
