import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma and the Anthropic SDK must run on the Node.js runtime, never the edge.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  poweredByHeader: false,
};

export default nextConfig;
