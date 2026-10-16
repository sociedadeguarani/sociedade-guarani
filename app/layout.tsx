import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sociedade Guarani",
  description: "Sistema de gestão da Sociedade Recreativa Guarani — S.R.G.",
  icons: {
    icon: [
      {
        url: "/favicon-guarani.ico?v=20261016",
        type: "image/x-icon",
        sizes: "16x16 32x32 48x48 64x64",
      },
    ],
    apple: [
      {
        url: "/apple-icon-guarani.png?v=20261016",
        type: "image/png",
        sizes: "180x180",
      },
    ],
    shortcut: "/favicon-guarani.ico?v=20261016",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
