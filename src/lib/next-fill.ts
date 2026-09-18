import { sql } from "@/lib/db";
import { generateRound, seeded, type Match, type Player } from "@/lib/pairing";

/**
 * What the next Fill would do. Deterministic per (session, games so far), so the page can
 * preview it and `fillCourts` can commit exactly that. `courts` overrides how many to plan.
 */
export async function planFill(sessionId: number, courts?: number) {
  const [session] = await sql`select court_count from sessions where id = ${sessionId}`;
  const players = await sql<Player[]>`select id, name, skill_rating as skill, games_offset as "gamesOffset" from players where session_id = ${sessionId} and not resting`;
  const history = await sql<(Match & { active: boolean })[]>`
    select m.court_number as court, m.team_a_players as "teamA", m.team_b_players as "teamB", m.finished_at is null as active
    from matches m join rounds r on r.id = m.round_id where r.session_id = ${sessionId} order by m.id`;

  const busy = new Set(history.filter((m) => m.active).flatMap((m) => [...m.teamA, ...m.teamB]));
  const occupied = new Set(history.filter((m) => m.active).map((m) => m.court));
  const empty = Array.from({ length: session.court_count }, (_, i) => i + 1).filter((c) => !occupied.has(c));
  const free = players.filter((p) => !busy.has(p.id));
  const n = courts ?? empty.length;
  if (!n || free.length < 2) return null;

  const { matches } = generateRound(free, n, history, seeded(sessionId * 1000 + history.length));
  return { matches, empty };
}
