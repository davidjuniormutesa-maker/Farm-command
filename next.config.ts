import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Fail the production build on real type errors instead of shipping them.
  // (Run `bunx tsc --noEmit` locally to see the same errors during development.)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Strict Mode surfaces unsafe effects/subscriptions early — important for an
  // offline-first app that manages timers, sync intervals and service workers.
  reactStrictMode: true,
};

export default nextConfig;
