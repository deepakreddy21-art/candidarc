import type { NextConfig } from "next";
import path from "path";

const useEmptySeed = process.env.NEXT_PUBLIC_APP_MODE === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
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
