import type { NextConfig } from "next";

const pages = process.env.PAGES === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(pages
    ? {
        output: "export" as const,
        basePath: "/due-light",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
