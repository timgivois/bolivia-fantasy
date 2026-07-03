import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-contained production server (server.js + traced node_modules) for
  // the Docker image — see apps/web/Dockerfile.
  output: "standalone",
};

export default withNextIntl(nextConfig);
