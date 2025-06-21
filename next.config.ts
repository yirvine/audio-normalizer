import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['react-dropzone'],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb'
    }
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*'
      }
    ];
  }
};

export default nextConfig;
