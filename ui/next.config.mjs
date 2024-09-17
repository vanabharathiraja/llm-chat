/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/lh/:path*',
        destination: 'http://localhost:8090/:path*' // Proxy to FastAPI backend
      },
    ];
  },
}

export default nextConfig;
