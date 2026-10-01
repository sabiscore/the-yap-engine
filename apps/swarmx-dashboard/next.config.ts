import type { NextConfig } from "next";

const API_URL = (
  process.env.SWARMX_API_URL?.trim() || "http://127.0.0.1:3001"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/ws/:path*", destination: API_URL + "/ws/:path*" }];
  },
  serverExternalPackages: [],
  transpilePackages: ["@swarmx/types"],
};

export default nextConfig;
