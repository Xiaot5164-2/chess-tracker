import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mysql2"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.chess.com", pathname: "/**" },
      { protocol: "https", hostname: "images.chesscomfiles.com", pathname: "/**" },
      { protocol: "https", hostname: "avatar.chess.com", pathname: "/**" },
      { protocol: "https", hostname: "chess.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
