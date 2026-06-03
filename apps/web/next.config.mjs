/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @aicos/ui ships source .tsx (no build step) and @aicos/types ships .ts —
  // Next.js must transpile them rather than expecting prebuilt JS.
  transpilePackages: ['@aicos/ui', '@aicos/types'],
  experimental: {
    // Tree-shake icon/util re-exports from the design system.
    optimizePackageImports: ['@aicos/ui'],
  },
};

export default nextConfig;
