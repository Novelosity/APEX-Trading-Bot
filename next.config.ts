import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  // Do NOT transpile ccxt — let it run as-is in Node.js API routes only
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // ccxt should never be bundled for the browser — mark all its deps as external
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
      }
    }
    // On server side, treat ccxt as an external (Node.js native require)
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'ccxt',
      ]
    }
    return config
  },
  serverExternalPackages: ['ccxt'],
}

export default nextConfig
