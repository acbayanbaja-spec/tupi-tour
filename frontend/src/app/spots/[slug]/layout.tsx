import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const title = params.slug.replace(/-/g, " ");
  return {
    title,
    description: `Visit ${title} in Tupi, South Cotabato. Maps, nearby stops, and traveler notes.`,
    openGraph: { title: `${title} · Tupi Tour`, description: `Discover ${title} in Tupi.` },
  };
}

export default function SpotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
