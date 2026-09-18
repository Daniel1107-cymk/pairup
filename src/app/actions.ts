"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { token } from "@/lib/auth";
import { sql } from "@/lib/db";
import { planFill } from "@/lib/next-fill";

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

/**
 * Games already played by the least-played player here. A late joiner starts level with them
 * instead of at 0, so they get on court next without monopolising every fill to "catch up".
 */
const joinOffset = (sessionId: number) => sql`
  select coalesce(min(n), 0)::int as n from (
    select count(m.id) as n from players p
    left join matches m on (p.id = any(m.team_a_players) or p.id = any(m.team_b_players))
    where p.session_id = ${sessionId} group by p.id) c`;

export async function addPlayer(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const name = String(form.get("name")).trim().slice(0, 50);
  const skill = form.get("skill") ? int(form.get("skill"), 1, 5) : null;
  if (!name) return;
  const [{ n }] = await joinOffset(sessionId);
  await sql`insert into players (session_id, name, skill_rating, games_offset) values (${sessionId}, ${name}, ${skill}, ${n})`;
  revalidatePath(`/s/${sessionId}`);
}

/** Copy players from this club's earlier sessions (most recent rating wins). */
export async function addFromRoster(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const names = form.getAll("name").map((v) => String(v).trim().slice(0, 50)).filter(Boolean);
  if (!names.length) return;
  const [{ n }] = await joinOffset(sessionId);
  await sql`
    insert into players (session_id, name, skill_rating, games_offset)
    select ${sessionId}, r.name, r.skill_rating, ${n} from (
      select distinct on (name) name, skill_rating from players
      where session_id <> ${sessionId} and name = any(${names}) order by name, id desc) r
    where not exists (select 1 from players p where p.session_id = ${sessionId} and p.name = r.name)`;
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
  const plan = await planFill(sessionId);
  if (!plan) return;
  const { matches, empty } = plan;

  // generateRound numbers courts 1..n; remap onto the actually-empty court numbers
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

/** Put hand-picked players on an empty court. Leave the second slot of each side blank for singles. */
export async function assignCourt(form: FormData) {
  const sessionId = int(form.get("sessionId"), 1, 1e9);
  const court = int(form.get("court"), 1, 20);
  const pick = (k: string) => (form.get(k) ? int(form.get(k), 1, 1e9) : null);
  const teamA = [pick("a1"), pick("a2")].filter((x): x is number => x !== null);
  const teamB = [pick("b1"), pick("b2")].filter((x): x is number => x !== null);
  const ids = [...teamA, ...teamB];
  if (!teamA.length || !teamB.length || new Set(ids).size !== ids.length) return;

  // all picks must be free: in this session, not resting, not on an active court, and the court must be empty
  const [{ ok }] = await sql`
    select count(*)::int = ${ids.length} as ok from players p
    where p.id = any(${ids}) and p.session_id = ${sessionId} and not p.resting
      and not exists (select 1 from matches m join rounds r on r.id = m.round_id
                      where r.session_id = ${sessionId} and m.finished_at is null
                        and (p.id = any(m.team_a_players) or p.id = any(m.team_b_players) or m.court_number = ${court}))`;
  if (!ok) return;

  const [{ id: roundId }] = await sql`
    insert into rounds (session_id, round_number)
    values (${sessionId}, (select coalesce(max(round_number), 0) + 1 from rounds where session_id = ${sessionId}))
    returning id`;
  await sql`insert into matches (round_id, court_number, team_a_players, team_b_players) values (${roundId}, ${court}, ${teamA}, ${teamB})`;
  revalidatePath(`/s/${sessionId}`);
}
