import { AutoRefresh } from "@/components/AutoRefresh";
import { NewsSummaryPanel } from "@/components/NewsSummaryPanel";
import { NewsTimeline } from "@/components/NewsTimeline";
import { PageHeader } from "@/components/PageHeader";
import { fetchNews, type NewsList } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  let data: NewsList | null = null;
  try {
    data = await fetchNews({ limit: 100, days: 14 });
  } catch {
    data = null;
  }

  return (
    <section className="space-y-[18px]">
      <AutoRefresh intervalSec={60} />
      <PageHeader
        title="News"
        subtitle="공식 RSS 피드에서 매크로/나스닥 헤드라인 수집 · 30분마다 갱신"
      />

      <NewsSummaryPanel />

      {!data ? (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-mm-text-mute">
          뉴스를 불러오는 데 실패했어요.
        </div>
      ) : data.items.length === 0 ? (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-mm-text-mute">
          아직 수집된 뉴스가 없어요 (피드 폴링 후 잠시 기다려주세요).
        </div>
      ) : (
        <NewsTimeline data={data} />
      )}
    </section>
  );
}
