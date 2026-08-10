import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["argon2", "ssh2-sftp-client"],
};

export default nextConfig;
