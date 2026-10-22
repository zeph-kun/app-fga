import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework to every client (CLAUDE.md security notes).
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
