import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "基金智能纪律助手",
  description: "个人场外基金投资决策与纪律管理工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
