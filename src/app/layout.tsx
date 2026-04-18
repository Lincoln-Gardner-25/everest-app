import type { Metadata } from "next";
import { Inter, Libre_Baskerville } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

// All pages require Firebase Auth — prevent Next.js from trying to
// statically pre-render them at build time, which would fail because
// NEXT_PUBLIC_FIREBASE_* env vars are not available during SSR/build.
export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-libre-baskerville",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Everest — Know Your Worth",
  description: "Time tracking, income goals, and project analytics for freelance videographers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${libreBaskerville.variable} antialiased`}>
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
