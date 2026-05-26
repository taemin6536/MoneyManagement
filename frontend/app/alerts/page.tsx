import { AlertsClient } from "./AlertsClient";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Kpi } from "@/components/Kpi";
import { PageHeader } from "@/components/PageHeader";
import { fetchAlerts, type AlertRow } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  let alerts: AlertRow[] = [];
  let error: string | null = null;
  try {
    alerts = await fetchAlerts(100);
  } catch (e) {
    error = String(e);
  }

  const total = alerts.length;
  const sent = alerts.filter((a) => a.status === "sent").length;
  const skipped = alerts.filter((a) => a.status === "skipped").length;
  const failed = alerts.filter((a) => a.status === "failed").length;
  const successPct = total > 0 ? Math.round((sent / total) * 100) : 0;

  const latestTs = alerts[0]?.fired_at;

  return (
    <section className="space-y-[18px]">
      <AutoRefresh intervalSec={30} />
      <PageHeader
        title="Alerts"
        subtitle="발송된 알림 이력. 행 클릭 시 Slack 메시지 + 페이로드 확장. 30초 auto-refresh."
        timestamp={latestTs}
      />

      {error && (
        <p className="text-sm text-mm-red">{error}</p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[18px]">
        <Kpi label="Total fired" value={total} />
        <Kpi
          label="Delivered"
          value={sent}
          color="green"
          hint={`${successPct}% success`}
        />
        <Kpi label="Skipped" value={skipped} color="dim" hint="dedup window 24h" />
        <Kpi label="Failed" value={failed} color="red" hint="slack timeout / 5xx" />
      </div>

      <AlertsClient alerts={alerts} />
    </section>
  );
}
