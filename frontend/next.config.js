/** @type {import('next').NextConfig} */
const rawApi = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
const cleanApi = rawApi.replace(/\/api\/?$/, "").replace(/\/+$/, "");

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  async rewrites() {
    return [
      { source: "/uploads/:path*", destination: `${cleanApi}/uploads/:path*` },
      { source: "/api/:path*", destination: `${cleanApi}/api/:path*` },
    ];
  },
};
module.exports = nextConfig;
