import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

// The one typeface on the brand sheet (ui_file/Finlamma_UI/assets/brand-sheet.png) -
// Bold/SemiBold/Medium/Regular, used everywhere (admin + marketing).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // Resolves relative OG/Twitter image URLs (e.g. the homepage's
  // /brand/app-icon.png) against the real deployed origin instead of
  // Next's "http://localhost:3000" fallback - found by the Phase 2b audit's
  // `pnpm build` warning.
  metadataBase: new URL(env.APP_URL),
  title: {
    default: "Finlamma",
    template: "%s · Finlamma",
  },
  description: "A gamified financial-literacy app for Indian students and young earners.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
