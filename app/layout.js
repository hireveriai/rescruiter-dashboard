import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import SessionInactivityGuard from "@/components/SessionInactivityGuard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "HireVeri Recruiter Workspace",
  description: "Recruiter control layer for secure interview orchestration, candidate review, and forensic hiring workflows.",
  applicationName: "HireVeri Recruiter",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionInactivityGuard />
        {children}
      </body>
    </html>
  );
}
