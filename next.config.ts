import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM and Node-only packages stay out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs", "bcryptjs", "pg"],
  // Dev logs print server-action arguments by default, which would include PINs.
  logging: { serverFunctions: false },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  experimental: {
    // Excel import uploads go through a server action.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
