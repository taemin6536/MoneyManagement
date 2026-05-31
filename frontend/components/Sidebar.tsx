"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { FxState } from "@/lib/api";
import { SidebarFx } from "./SidebarFx";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/news", label: "News", icon: "▤" },
  { href: "/trades", label: "Trades", icon: "▦" },
  { href: "/contributions", label: "Contributions", icon: "₩" },
  { href: "/backtest", label: "Backtest", icon: "ƒ" },
  { href: "/rules", label: "Rules", icon: "≡" },
  { href: "/alerts", label: "Alerts", icon: "◉" },
  { href: "/calculator", label: "Calculator", icon: "∑" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  systemStatus,
  version,
  buildTs,
  fx,
}: {
  systemStatus: { backend: boolean; database: boolean; slack: boolean; kis: boolean };
  version: string;
  buildTs: string;
  fx: FxState | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while mobile drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Mobile hamburger trigger (≤ md hides sidebar by default) */}
      <button
        type="button"
        aria-label="open menu"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 w-10 h-10 rounded-md bg-mm-surface border border-mm-border flex items-center justify-center text-mm-text text-[18px] shadow-sm"
      >
        ☰
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 bg-black/55 backdrop-blur-[2px] z-40"
        />
      )}

      <aside
        className={`bg-mm-bg-sub border-r border-mm-border flex flex-col px-3 py-[18px]
          w-[240px] md:w-[200px] shrink-0
          fixed md:static top-0 left-0 bottom-0 z-50 md:z-auto
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Close button — mobile only */}
        <button
          type="button"
          aria-label="close menu"
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-3 right-3 w-8 h-8 rounded-md border border-mm-border-soft text-mm-text-dim flex items-center justify-center"
        >
          ✕
        </button>

        {/* Logo block */}
      <div className="px-2 pb-4 mb-3 border-b border-mm-border-soft">
        <div className="flex items-center gap-2">
          <div
            className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-black font-bold text-[12px]"
            style={{
              background:
                "linear-gradient(135deg, var(--mm-accent) 0%, var(--mm-violet) 100%)",
            }}
          >
            M
          </div>
          <div>
            <div className="text-[13px] font-semibold leading-tight">MoneyMgmt</div>
            <div className="text-[10px] text-mm-text-dim leading-tight">TQQQ · QLD</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-[2px]">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-[10px] px-[10px] py-[9px] rounded-btn text-[13px] transition-colors ${
                active
                  ? "bg-mm-surface-2 text-mm-accent font-semibold"
                  : "text-mm-text-dim hover:bg-mm-surface-2/60 hover:text-mm-text"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-mm-accent rounded-full" />
              )}
              <span
                className={`w-4 inline-flex justify-center text-[13px] ${
                  active ? "text-mm-accent" : "text-mm-text-mute"
                }`}
                aria-hidden
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-3 border-t border-mm-border-soft">
        <SidebarFx data={fx} />
        <div className="px-2 mb-3">
          <ThemeToggle />
        </div>
        <div className="px-2">
          <div className="text-[10px] text-mm-text-mute mb-[6px]">SYSTEM</div>
          <ul className="flex flex-col gap-1 text-[11px]">
            <SysRow label="Backend" ok={systemStatus.backend} />
            <SysRow label="Database" ok={systemStatus.database} />
            <SysRow label="Slack" ok={systemStatus.slack} />
            <SysRow label="KIS API" ok={systemStatus.kis} />
          </ul>
          <div className="mt-[10px] text-[10px] text-mm-text-mute">
            {version} · {buildTs}
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}

function SysRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex justify-between text-mm-text-dim">
      <span>{label}</span>
      <span
        className={`inline-flex items-center gap-1 ${
          ok ? "text-mm-green" : "text-mm-red"
        }`}
      >
        <span
          className={`w-[6px] h-[6px] rounded-full ${
            ok ? "bg-mm-green" : "bg-mm-red"
          }`}
        />
        {ok ? "online" : "down"}
      </span>
    </li>
  );
}
