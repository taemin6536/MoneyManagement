import { fmtKst } from "@/lib/format";

type Props = {
  title: string;
  subtitle?: string;
  timestamp?: string | Date | null;
  live?: boolean;
};

export function PageHeader({ title, subtitle, timestamp, live = true }: Props) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap mb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.3px] leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-mm-text-dim mt-1">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3 text-mm-text-dim">
        {timestamp && (
          <span className="font-mono text-[11px] tabular-nums">{fmtKst(timestamp)}</span>
        )}
        <span className="h-3 w-px bg-mm-border-soft" />
        <span className="inline-flex items-center gap-[6px] text-[11px]">
          <span
            className={`w-[6px] h-[6px] rounded-full ${
              live ? "bg-mm-green" : "bg-mm-text-mute"
            } ${live ? "shadow-[0_0_6px_var(--mm-green)]" : ""}`}
          />
          {live ? "Live" : "Idle"}
        </span>
      </div>
    </header>
  );
}
