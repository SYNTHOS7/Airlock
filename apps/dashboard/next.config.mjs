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
  async rewrites() {
    const backendUrl = process.env.AIRLOCK_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    if (backendUrl) {
      const cleanUrl = backendUrl.replace(/\/$/, '');
      return [
        {
          source: '/api/:path*',
          destination: `${cleanUrl}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
