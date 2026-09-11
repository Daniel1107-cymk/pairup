import Link from "next/link";
import { sql } from "@/lib/db";
import { createSession } from "./actions";
import { Submit } from "./submit";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sessions = await sql`select id, date, venue, court_count from sessions order by date desc, id desc limit 20`;
  return (
    <main className="mx-auto w-full max-w-md p-5 space-y-8">
      <header className="hero relative overflow-hidden pt-6">
        <h1 className="text-6xl font-extrabold leading-none tracking-tight">
          Pair<span className="text-shuttle">Up</span>
        </h1>
        <p className="mt-2 text-sm text-chalk/60">Fair courts. Even rest. No arguments.</p>
      </header>

      <form action={createSession} className="panel p-4 space-y-3 -rotate-1">
        <h2 className="text-xl font-bold">New session</h2>
        <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="field w-full p-3" />
        <input name="venue" placeholder="Venue" required className="field w-full p-3" />
        <label className="flex items-center gap-3 text-sm text-chalk/70">
          Courts
          <input name="courts" type="number" min={1} max={20} defaultValue={2} required className="field w-16 p-3 text-lg" />
        </label>
        <Submit className="shuttle-btn w-full rounded-full p-4 text-xl">Let&apos;s play</Submit>
      </form>

      {sessions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-[0.2em] text-chalk/50">Recent</h2>
          <ul className="panel divide-y divide-white/15">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/s/${s.id}`} className="press flex items-baseline justify-between gap-3 p-3 hover:bg-white/5">
                  <span className="display text-lg font-semibold">{s.venue}</span>
                  <span className="text-xs text-chalk/50">{new Date(s.date).toLocaleDateString()} · {s.court_count}ct</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
