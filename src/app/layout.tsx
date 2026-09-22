import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// The one typeface on the brand sheet (ui_file/Finlamma_UI/assets/brand-sheet.png) -
// Bold/SemiBold/Medium/Regular, used everywhere (admin + marketing).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
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
