"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <aside className="w-[200px] shrink-0 bg-mm-bg-sub border-r border-mm-border flex flex-col px-3 py-[18px]">
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
