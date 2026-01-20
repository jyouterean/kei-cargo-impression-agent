import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 明示的にこのプロジェクトディレクトリを Turbopack の root に指定して、
   * 親ディレクトリにある別の package-lock.json を無視させる。
   * これにより API ルートが正しく解決されやすくなります。
   */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
