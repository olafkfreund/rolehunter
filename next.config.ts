import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright", "pdf-parse", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default config;
