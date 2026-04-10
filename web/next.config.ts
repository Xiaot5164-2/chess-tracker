import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 供 Docker / Cloud Run 等容器仅拷贝 standalone 产物运行（见 web/Dockerfile） */
  output: "standalone",
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
