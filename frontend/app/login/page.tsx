export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const errored = sp.error === "invalid";
  const nextParam = sp.next ?? "";

  return (
    <main className="min-h-screen flex items-center justify-center bg-mm-bg px-4">
      <article className="w-full max-w-[360px] rounded-card border border-mm-border bg-mm-surface p-7 space-y-4">
        <header className="space-y-1">
          <h1 className="text-[18px] font-semibold">MoneyManagement</h1>
          <p className="text-[12px] text-mm-text-mute">로그인이 필요합니다.</p>
        </header>

        <form action="/api/login" method="POST" className="space-y-3">
          <input type="hidden" name="next" value={nextParam} />
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.6px] text-mm-text-mute">
              비밀번호
            </span>
            <input
              type="password"
              name="password"
              autoFocus
              required
              className="mt-1 w-full rounded border border-mm-border-soft bg-mm-bg-sub px-3 py-2 text-[14px] font-mono outline-none focus:border-mm-accent"
            />
          </label>
          {errored && (
            <div className="text-[12px] text-mm-amber">
              비밀번호가 일치하지 않아요.
            </div>
          )}
          <button
            type="submit"
            className="w-full rounded border border-mm-accent/40 bg-mm-accent/10 px-3 py-2 text-[13px] font-semibold text-mm-accent hover:bg-mm-accent/20"
          >
            로그인
          </button>
        </form>

        <p className="text-[10px] text-mm-text-mute">
          단일 유저 페이지. 비밀번호는 Fly secrets로 관리됩니다.
        </p>
      </article>
    </main>
  );
}
