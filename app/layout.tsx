import type { Metadata } from "next";
import { Tajawal, Cairo, Amiri } from "next/font/google";
import "./globals.css";

// Brand fonts (preserved from the original app's Google Fonts link).
const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500"],
  variable: "--font-tajawal",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  style: ["italic"],
  variable: "--font-amiri",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clinica AI",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} ${cairo.variable} ${amiri.variable}`}
    >
      <body suppressHydrationWarning className="font-sans text-text antialiased selection:bg-accent/30 selection:text-primary max-w-[100vw] overflow-x-hidden min-h-screen flex flex-col">
        {children}
        <div className="noise-overlay" />
      </body>
    </html>
  );
}
