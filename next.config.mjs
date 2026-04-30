/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
