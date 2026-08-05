import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // literal `href` values are checked at compile time; a concatenated one needs
  // an `as Route` cast.
  typedRoutes: true,
};

export default nextConfig;
