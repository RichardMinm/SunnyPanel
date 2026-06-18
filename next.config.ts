import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
    unoptimized: process.env.NODE_ENV !== "production",
  },
  experimental: {
    optimizePackageImports: [
      "@payloadcms/next",
      "@tiptap/react",
      "framer-motion",
      "lucide-react",
    ],
  },
};

export default withPayload(nextConfig);
