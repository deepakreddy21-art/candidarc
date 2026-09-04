import type { NextConfig } from "next";
import path from "path";

const useEmptySeed = process.env.NEXT_PUBLIC_APP_MODE === "production";
const appMode = process.env.APP_MODE ?? (process.env.NODE_ENV === "production" ? "production" : "demo");
const isDemoOrTest = appMode === "demo" || process.env.NODE_ENV === "test";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // BullMQ pulls in ioredis; keep it external so Next.js does not bundle it into server chunks.
  serverExternalPackages: ["bullmq", "ioredis"],
  env: {
    NEXT_PUBLIC_FEATURE_RADAR: process.env.FEATURE_RADAR ?? (isDemoOrTest ? "true" : "false"),
    NEXT_PUBLIC_FEATURE_COPILOT: process.env.FEATURE_COPILOT ?? "false",
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
  },
  webpack: (config, { webpack: wp }) => {
    if (useEmptySeed) {
      const emptySeed = path.join(__dirname, "src/data/seed.empty.ts");
      const emptyRadar = path.join(__dirname, "src/data/radar-seed.empty.ts");
      config.plugins.push(
        new wp.NormalModuleReplacementPlugin(/[\\/]data[\\/]seed(\.demo)?$/, emptySeed),
        new wp.NormalModuleReplacementPlugin(/[\\/]data[\\/]radar-seed(\.demo)?$/, emptyRadar),
      );
    }
    return config;
  },
};

export default nextConfig;
