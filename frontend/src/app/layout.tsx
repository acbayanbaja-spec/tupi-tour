import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteShell } from "@/components/site-shell";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-plus-jakarta" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Tupi Tour — Discover Tupi, South Cotabato", template: "%s · Tupi Tour" },
  description: "Discover, navigate, and plan trips across Tupi, South Cotabato — farms, highlands, fruit parks, and local rewards.",
  metadataBase: new URL("https://tupi-tour.example"),
  openGraph: {
    title: "Tupi Tour",
    description: "A premium digital tourism platform created specifically for Tupi.",
    type: "website",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} font-sans antialiased`}>
        <Providers>
          <SiteShell>{children}</SiteShell>
        </Providers>
      </body>
    </html>
  );
}
