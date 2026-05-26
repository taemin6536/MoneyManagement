import type { Metadata } from "next";

import { Sidebar } from "@/components/Sidebar";
import { fetchFx, fetchHealth } from "@/lib/api";
import { tsShort } from "@/lib/format";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoneyManagement",
  description: "TQQQ/QLD asset monitoring",
};

// Read theme + accent from localStorage before React boots — avoids FOUC.
const NO_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem('mm.theme')||'dark';var a=localStorage.getItem('mm.accent')||'blue';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-accent',a);}catch(e){document.documentElement.setAttribute('data-theme','dark');document.documentElement.setAttribute('data-accent','blue');}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [health, fx] = await Promise.all([
    fetchHealth().catch(() => null),
    fetchFx().catch(() => null),
  ]);

  const status = {
    backend: !!health,
    database: health?.db === "ok",
    slack: !!health?.slack_configured,
    kis: !!health?.kis_configured,
  };

  return (
    <html lang="ko" data-theme="dark" data-accent="blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC_SCRIPT }} />
      </head>
      <body className="bg-mm-bg text-mm-text">
        <div className="flex h-screen overflow-hidden">
          <Sidebar
            systemStatus={status}
            version="v0.1.0"
            buildTs={tsShort(new Date())}
            fx={fx}
          />
          <main className="flex-1 overflow-y-auto px-4 pt-16 pb-6 md:px-[26px] md:pt-[22px] md:pb-[22px]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
