import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted on the VPS (see deploy/docker-compose.yml's `frontend` service) rather than
  // Vercel — standalone bundles a minimal server + only the node_modules actually used, so the
  // runtime Docker image doesn't need the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
