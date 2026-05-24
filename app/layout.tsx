import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Hur röstade ditt parti?",
  description: "Se hur varje riksdagsparti röstar – ingen spin, bara data.",
  icons: { icon: "./icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0f1117] text-white">
        {children}
      </body>
    </html>
  );
}
