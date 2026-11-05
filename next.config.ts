import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./config/users.example.json"],
  },
  outputFileTracingExcludes: {
    "/*": ["./config/users.local.json", "./.env*"],
  },
};

export default nextConfig;
