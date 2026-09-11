import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { addPlayer, deleteSession, fillCourts, finishCourt, removePlayer, setSkill, toggleRest, undoLast } from "../../actions";
import { AutoSelect } from "../../auto-select";
import { Submit } from "../../submit";

export const dynamic = "force-dynamic";

export default async function Session({ params }: PageProps<"/s/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [session] = await sql`select id, date, venue, court_count from sessions where id = ${id}`;
  if (!session) notFound();

  const players = await sql`select id, name, skill_rating, resting from players where session_id = ${id} order by id`;
  const games = await sql`
    select p.id, count(m.id)::int as n from players p
    left join matches m on p.id = any(m.team_a_players) or p.id = any(m.team_b_players)
    where p.session_id = ${id} group by p.id`;
  const matches = await sql`
    select m.id, m.court_number, m.team_a_players, m.team_b_players from matches m join rounds r on r.id = m.round_id
    where r.session_id = ${id} and m.finished_at is null order by m.court_number`;
  const [{ done }] = await sql`
    select count(*)::int as done from matches m join rounds r on r.id = m.round_id
    where r.session_id = ${id} and m.finished_at is not null`;

  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const played = Object.fromEntries(games.map((g) => [g.id, g.n]));
  const onCourt = new Set(matches.flatMap((m) => [...m.team_a_players, ...m.team_b_players]));
  const bench = players.filter((p) => !onCourt.has(p.id) && !p.resting);
  const resting = players.filter((p) => p.resting && !onCourt.has(p.id));
  const emptyCourts = session.court_count - matches.length;
  const started = matches.length > 0 || done > 0;
  const rated = players.some((p) => p.skill_rating);
  const strength = (ids: number[]) => ids.reduce((s, i) => s + (byId[i]?.skill_rating ?? 3), 0);
  const Team = ({ ids }: { ids: number[] }) => (
    <div className="court-side flex-1 space-y-1">
      {ids.map((i) => <div key={i} className="display text-xl font-semibold leading-tight">{byId[i]?.name ?? "?"}</div>)}
      {rated && <div className="pt-1 text-xs text-shuttle/80">★ {strength(ids)}</div>}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-md p-5 space-y-8">
      <header className="pt-4">
        <Link href="/" className="text-xs uppercase tracking-[0.2em] text-chalk/50">← PairUp</Link>
        <h1 className="mt-1 text-4xl font-extrabold leading-none tracking-tight">{session.venue}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="chip">{new Date(session.date).toLocaleDateString()}</span>
          <span className="chip">{session.court_count} courts</span>
          <span className="chip">{players.length} players</span>
          {done > 0 && <span className="chip chip-hot">{done} games done</span>}
        </div>
      </header>

      {emptyCourts > 0 && (
        <form action={fillCourts}>
          <input type="hidden" name="sessionId" value={id} />
          <Submit disabled={bench.length < 2} className="shuttle-btn w-full rounded-full p-4 text-xl">
            {started ? `Fill ${emptyCourts} empty court${emptyCourts > 1 ? "s" : ""} →` : "Serve →"}
          </Submit>
          {bench.length < 2 && <p className="mt-2 text-center text-xs text-chalk/50">Need at least 2 free players</p>}
        </form>
      )}

      {started ? (
        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-chalk/50">Courts</h2>
          {Array.from({ length: session.court_count }, (_, i) => i + 1).map((court, i) => {
            const m = matches.find((x) => x.court_number === court);
            return (
              <div key={m ? `m${m.id}` : `c${court}`} className={`court flex flex-wrap ${m ? "court-new" : "opacity-60"}`} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="absolute -top-3 left-3 bg-court px-2 text-xs font-bold uppercase tracking-widest text-shuttle">Court {court}</span>
                {m ? (
                  <>
                    <div className="net flex basis-full">
                      <Team ids={m.team_a_players} />
                      <Team ids={m.team_b_players} />
                    </div>
                    <form action={finishCourt} className="basis-full border-t-2 border-white/30">
                      <input type="hidden" name="sessionId" value={id} />
                      <input type="hidden" name="court" value={court} />
                      <Submit className="press w-full py-2 text-sm font-bold uppercase tracking-widest text-shuttle/90">Finished ✓</Submit>
                    </form>
                  </>
                ) : (
                  <div className="flex h-24 basis-full items-center justify-center text-sm text-chalk/40">empty</div>
                )}
              </div>
            );
          })}
          <form action={undoLast} className="text-right">
            <input type="hidden" name="sessionId" value={id} />
            <Submit className="press text-xs uppercase tracking-widest text-chalk/50 underline-offset-4 hover:underline">↶ undo last</Submit>
          </form>
          <div className="rounded border-2 border-dashed border-bench/60 p-3 text-bench">
            <div className="text-xs font-bold uppercase tracking-widest">Bench · next up</div>
            <div className="display mt-1 flex flex-wrap gap-x-3 text-lg">
              {bench.length ? bench.map((p) => <span key={p.id}>{p.name}<span className="ml-1 text-xs opacity-60">{played[p.id] ?? 0}g</span></span>) : "everyone's playing"}
            </div>
            {resting.length > 0 && (
              <div className="mt-2 text-sm opacity-60">
                <span className="text-xs font-bold uppercase tracking-widest">Resting</span> · {resting.map((p) => p.name).join(", ")}
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="court flex h-28 items-center justify-center text-sm text-chalk/40">
          <span className="relative z-10 bg-court px-3">courts are empty</span>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-chalk/50">Players</h2>
        <form action={addPlayer} className="flex gap-2">
          <input type="hidden" name="sessionId" value={id} />
          <input name="name" placeholder="Add a name" required className="field min-w-0 flex-1 p-3" />
          <select name="skill" className="field p-3" aria-label="Skill 1–5">
            <option value="">★?</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>★{n}</option>)}
          </select>
          <Submit className="press rounded-full bg-chalk px-5 font-bold text-court-deep">Add</Submit>
        </form>
        <ul className="panel divide-y divide-white/15">
          {players.map((p) => (
            <li key={p.id} className="row flex items-center gap-3 px-3 py-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${!started ? "bg-chalk/20" : onCourt.has(p.id) ? "bg-shuttle" : p.resting ? "bg-chalk/20" : "bg-bench"}`} aria-hidden />
              <span className="display flex-1 text-lg">{p.name}</span>
              <form action={setSkill}>
                <input type="hidden" name="sessionId" value={id} />
                <input type="hidden" name="playerId" value={p.id} />
                <AutoSelect key={p.skill_rating ?? 0} name="skill" defaultValue={p.skill_rating ?? ""} aria-label={`${p.name} skill`} className="field cursor-pointer border-0 bg-transparent p-1 text-xs text-shuttle">
                  <option value="">★?</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                </AutoSelect>
              </form>
              <span className="tabular-nums text-xs text-chalk/50">{played[p.id] ?? 0}g</span>
              {!onCourt.has(p.id) && (
                <form action={toggleRest}>
                  <input type="hidden" name="sessionId" value={id} />
                  <input type="hidden" name="playerId" value={p.id} />
                  <Submit className={`press rounded-full border px-2 py-0.5 text-xs ${p.resting ? "border-bench text-bench" : "border-chalk/30 text-chalk/60"}`}>
                    {p.resting ? "resting" : "rest"}
                  </Submit>
                </form>
              )}
              {!onCourt.has(p.id) && (
                <form action={removePlayer}>
                  <input type="hidden" name="sessionId" value={id} />
                  <input type="hidden" name="playerId" value={p.id} />
                  <Submit className="press px-2 text-coral" aria-label={`Remove ${p.name}`}>✕</Submit>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <details className="pt-8 text-center text-xs text-chalk/40">
        <summary className="cursor-pointer uppercase tracking-widest">Delete this session</summary>
        <form action={deleteSession} className="mt-3 space-y-2">
          <input type="hidden" name="sessionId" value={id} />
          <p>Removes {session.venue}, its {players.length} players and {done} games. No undo.</p>
          <Submit className="press rounded-full border-2 border-coral px-5 py-2 font-bold text-coral">Yes, delete</Submit>
        </form>
      </details>
    </main>
  );
}
