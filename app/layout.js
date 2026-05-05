import "./globals.css";

import SessionInactivityGuard from "@/components/SessionInactivityGuard";

export const metadata = {
  title: "HireVeri Recruiter Workspace",
  description:
    "Recruiter control layer for secure interview orchestration, candidate review, and forensic hiring workflows.",
  applicationName: "HireVeri Recruiter",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionInactivityGuard />
        {children}
      </body>
    </html>
  );
}
