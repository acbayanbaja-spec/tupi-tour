import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-serif text-4xl text-forest">That page is not on the Tupi map.</h1>
      <p className="mt-3 text-forest/70">Try Explore, or search Fruit Park and SG Farm.</p>
      <Link href="/explore" className="mt-6 inline-block rounded-full bg-forest px-5 py-3 font-semibold text-cream">
        Explore destinations
      </Link>
    </div>
  );
}
