import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "軽貨物インプレッションエージェント | ダッシュボード",
  description: "X & Threads 自動運用ダッシュボード - バズ学習 × Bandit最適化",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
