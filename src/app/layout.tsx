import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Treadline - Board Game",
  description: "Play and test Treadline board game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
