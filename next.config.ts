import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow switching between localhost and 127.0.0.1 during local development
  // without breaking HMR or leaving the browser with stale Server Action IDs.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default withPayload(nextConfig);
