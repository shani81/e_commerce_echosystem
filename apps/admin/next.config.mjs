/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The design-system and shared types ship source (.ts/.tsx) with no build
  // step, so Next must transpile them as part of this app's compilation.
  transpilePackages: ['@aicos/ui', '@aicos/types'],
};

export default nextConfig;
