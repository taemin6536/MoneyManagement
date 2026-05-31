import { CalendarTimeline } from "@/components/CalendarTimeline";
import { PageHeader } from "@/components/PageHeader";
import { fetchCalendar, type EconomicEventList } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  let data: EconomicEventList | null = null;
  try {
    data = await fetchCalendar({ days: 90 });
  } catch {
    data = null;
  }

  return (
    <section className="space-y-[18px]">
      <PageHeader
        title="Calendar"
        subtitle="향후 90일 매크로 이벤트 (FOMC / CPI / NFP / PCE / BOK …). 직접 추가·삭제 가능."
      />

      {!data ? (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-mm-text-mute">
          이벤트를 불러오는 데 실패했어요.
        </div>
      ) : (
        <CalendarTimeline initial={data} />
      )}
    </section>
  );
}
