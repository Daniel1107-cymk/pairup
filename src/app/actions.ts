"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { token } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateRound, type Match, type Player } from "@/lib/pairing";

const int = (v: FormDataEntryValue | null, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`expected integer ${min}-${max}`);
  return n;
};

export async function createSession(form: FormData) {
  const date = String(form.get("date"));
  const venue = String(form.get("venue")).trim().slice(0, 100);
  const courts = int(form.get("courts"), 1, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !venue) throw new Error("bad input");
  const [{ id }] = await sql`insert into sessions (date, venue, court_count) values (${date}, ${venue}, ${courts}) returning id`;
  redirect(`/s/${id}`);
}

export async function deleteSession(form: FormData) {
  const id = int(form.get("sessionId"), 1, 1e9);
  await sql`delete from sessions where id = ${id}`; // players/rounds/matches cascade
  redirect("/");
}

export async function addPlayer(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const name = String(form.get("name")).trim().slice(0, 50);
  const skill = form.get("skill") ? int(form.get("skill"), 1, 5) : null;
  if (!name) return;
  await sql`insert into players (session_id, name, skill_rating) values (${sessionId}, ${name}, ${skill})`;
  revalidatePath(`/s/${sessionId}`);
}

export async function removePlayer(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const id = int(form.get("playerId"), 1, 1e9);
  await sql`delete from players where id = ${id} and session_id = ${sessionId}`;
  revalidatePath(`/s/${sessionId}`);
}

/** Mark a court's match finished. The court stays empty until someone taps Fill. */
export async function finishCourt(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const court = int(form.get("court"), 1, 20);
  await sql`update matches m set finished_at = now() from rounds r
    where r.id = m.round_id and r.session_id = ${sessionId} and m.court_number = ${court} and m.finished_at is null`;
  revalidatePath(`/s/${sessionId}`);
}

/** Undo the most recent tap: a fill (newest batch, nothing finished yet) or a finish (latest finished match on an empty court). */
export async function undoLast(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const [r] = await sql`
    select id, created_at from rounds where session_id = ${sessionId}
      and not exists (select 1 from matches where round_id = rounds.id and finished_at is not null)
    order by round_number desc limit 1`;
  const [m] = await sql`
    select m.id, m.finished_at from matches m join rounds r on r.id = m.round_id
    where r.session_id = ${sessionId} and m.finished_at is not null
      and not exists (select 1 from matches a join rounds ra on ra.id = a.round_id
                      where ra.session_id = ${sessionId} and a.finished_at is null and a.court_number = m.court_number)
    order by m.finished_at desc limit 1`;
  // whichever happened later is the one to reverse
  if (r && (!m || new Date(r.created_at) > new Date(m.finished_at))) await sql`delete from rounds where id = ${r.id}`;
  else if (m) await sql`update matches set finished_at = null where id = ${m.id}`;
  revalidatePath(`/s/${sessionId}`);
}

/** Fill every empty court from players not currently on one. */
export async function fillCourts(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);

  const [session] = await sql`select court_count from sessions where id = ${sessionId}`;
  const players = await sql<Player[]>`select id, name, skill_rating as skill from players where session_id = ${sessionId} and not resting`;
  const history = await sql<(Match & { active: boolean })[]>`
    select m.court_number as court, m.team_a_players as "teamA", m.team_b_players as "teamB", m.finished_at is null as active
    from matches m join rounds r on r.id = m.round_id where r.session_id = ${sessionId}`;

  const busy = new Set(history.filter((m) => m.active).flatMap((m) => [...m.teamA, ...m.teamB]));
  const occupied = new Set(history.filter((m) => m.active).map((m) => m.court));
  const empty = Array.from({ length: session.court_count }, (_, i) => i + 1).filter((c) => !occupied.has(c));
  const free = players.filter((p) => !busy.has(p.id));
  if (!empty.length || free.length < 2) return;

  // generateRound numbers courts 1..n; remap onto the actually-empty court numbers
  const { matches } = generateRound(free, empty.length, history);
  const [{ id: roundId }] = await sql`
    insert into rounds (session_id, round_number)
    values (${sessionId}, (select coalesce(max(round_number), 0) + 1 from rounds where session_id = ${sessionId}))
    returning id`;
  for (const m of matches)
    await sql`insert into matches (round_id, court_number, team_a_players, team_b_players) values (${roundId}, ${empty[m.court - 1]}, ${m.teamA}, ${m.teamB})`;
  revalidatePath(`/s/${sessionId}`);
}

export async function login(form: FormData) {
  const input = Buffer.from(String(form.get("passphrase") ?? ""));
  const secret = Buffer.from(process.env.PASSPHRASE ?? "");
  const ok = input.length === secret.length && timingSafeEqual(input, secret);
  if (!ok) redirect("/login?bad");
  (await cookies()).set("pairup", token(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/",
  });
  redirect("/");
}

/** Toggle a player's rest flag; resting players sit out every Fill until toggled back. */
export async function toggleRest(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const id = int(form.get("playerId"), 1, 1e9);
  await sql`update players set resting = not resting where id = ${id} and session_id = ${sessionId}`;
  revalidatePath(`/s/${sessionId}`);
}

export async function setSkill(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const id = int(form.get("playerId"), 1, 1e9);
  const skill = form.get("skill") ? int(form.get("skill"), 1, 5) : null;
  await sql`update players set skill_rating = ${skill} where id = ${id} and session_id = ${sessionId}`;
  revalidatePath(`/s/${sessionId}`);
}
