import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Client portal (System Design §7) is read-heavy and must load fast on
  // mobile connections — server components by default, no client-side
  // bundle bloat added here without a reason.
};

export default nextConfig;
