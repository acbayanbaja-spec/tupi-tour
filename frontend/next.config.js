/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
    return [
      { source: "/uploads/:path*", destination: `${api}/uploads/:path*` },
      { source: "/api/:path*", destination: `${api}/api/:path*` },
    ];
  },
};
module.exports = nextConfig;
