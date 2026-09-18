import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Summary({ params }: PageProps<"/s/[id]/summary">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [session] = await sql`select venue, date from sessions where id = ${id}`;
  if (!session) notFound();

  const rows = await sql`
    select p.name, count(m.id)::int as games,
           count(*) filter (where m.finished_at is not null)::int as done
    from players p
    left join matches m on (p.id = any(m.team_a_players) or p.id = any(m.team_b_players))
    where p.session_id = ${id}
    group by p.id, p.name order by games desc, p.name`;
  const partners = await sql`
    select a.name as one, b.name as two, count(*)::int as n
    from matches m
    join rounds r on r.id = m.round_id
    join players a on a.id = any(m.team_a_players) or a.id = any(m.team_b_players)
    join players b on (b.id = any(m.team_a_players) and a.id = any(m.team_a_players)
                    or b.id = any(m.team_b_players) and a.id = any(m.team_b_players))
    where r.session_id = ${id} and a.id < b.id
    group by a.name, b.name order by n desc, a.name limit 10`;

  const [{ total }] = await sql`
    select count(*)::int as total from matches m join rounds r on r.id = m.round_id where r.session_id = ${id}`;
  const max = Math.max(1, ...rows.map((r) => r.games));

  return (
    <main className="mx-auto w-full max-w-md p-5 space-y-8">
      <header className="pt-4">
        <Link href={`/s/${id}`} className="text-xs uppercase tracking-[0.2em] text-chalk/50">← {session.venue}</Link>
        <h1 className="mt-1 text-4xl font-extrabold leading-none tracking-tight">Summary</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="chip">{new Date(session.date).toLocaleDateString()}</span>
          <span className="chip">{rows.length} players</span>
          <span className="chip chip-hot">{total} games</span>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-[0.2em] text-chalk/50">Court time</h2>
        <ul className="panel divide-y divide-white/15">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 px-3 py-2">
              <span className="display w-28 shrink-0 truncate text-lg">{r.name}</span>
              <span className="h-2 flex-1 rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-shuttle" style={{ width: `${(r.games / max) * 100}%` }} />
              </span>
              <span className="tabular-nums text-xs text-chalk/50">{r.games}</span>
            </li>
          ))}
        </ul>
      </section>

      {partners.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-[0.2em] text-chalk/50">Most-paired</h2>
          <ul className="panel divide-y divide-white/15">
            {partners.map((p) => (
              <li key={`${p.one}-${p.two}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="display truncate text-base">{p.one} &amp; {p.two}</span>
                <span className="tabular-nums text-xs text-chalk/50">{p.n}×</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
