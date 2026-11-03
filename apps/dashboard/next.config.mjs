/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@airlock/contracts',
    '@airlock/storage',
    '@airlock/policy-engine',
    '@airlock/provider-mock',
    '@airlock/mcp-server',
  ],
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;

