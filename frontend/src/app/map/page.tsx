"use client";

import dynamic from "next/dynamic";

const MapClient = dynamic(() => import("./map-client"), { ssr: false, loading: () => <div className="skeleton m-6 h-[70vh]" /> });

export default function MapPage() {
  return <MapClient />;
}
