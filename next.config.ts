import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  serverExternalPackages: ['@langchain/langgraph', '@modelcontextprotocol/sdk'],
  devIndicators: false,
};
export default nextConfig;
