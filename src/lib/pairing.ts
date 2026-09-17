export type Player = { id: number; name: string; skill?: number | null };
export type Match = { court: number; teamA: number[]; teamB: number[] };
export type Round = { matches: Match[]; bench: number[] };

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Build the next round from the full player list and every match played so far.
 * Pure: no DB, no clock. `rng` is injectable for reproducible tests.
 */
export function generateRound(
  players: Player[],
  courtCount: number,
  history: Match[],
  rng: () => number = Math.random,
): Round {
  const shuffle = <T>(xs: T[]) => {
    const a = xs.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // --- who plays: fewest games first, ties broken randomly ---
  const games = new Map<number, number>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  for (const m of history) {
    for (const id of [...m.teamA, ...m.teamB]) games.set(id, (games.get(id) ?? 0) + 1);
    for (const t of [m.teamA, m.teamB])
      if (t.length === 2) partners.set(key(t[0], t[1]), (partners.get(key(t[0], t[1])) ?? 0) + 1);
    for (const a of m.teamA) for (const b of m.teamB) opponents.set(key(a, b), (opponents.get(key(a, b)) ?? 0) + 1);
  }

  let playing = Math.min(players.length, courtCount * 4);
  if (playing % 2) playing--; // odd leftovers bench, so courts are 4s or one 2
  const order = shuffle(players).sort((a, b) => (games.get(a.id) ?? 0) - (games.get(b.id) ?? 0));
  const active = order.slice(0, playing);
  const bench = order.slice(playing).map((p) => p.id);

  // --- how they're split: random restarts, keep the cheapest layout ---
  const skill = new Map(players.map((p) => [p.id, p.skill ?? 3])); // ponytail: unrated = average
  const sum = (t: Player[]) => t.reduce((s, p) => s + skill.get(p.id)!, 0);
  const cost = (A: Player[], B: Player[]) => {
    let c = Math.abs(sum(A) - sum(B));
    for (const t of [A, B]) if (t.length === 2) c += 2 * (partners.get(key(t[0].id, t[1].id)) ?? 0);
    for (const a of A) for (const b of B) c += opponents.get(key(a.id, b.id)) ?? 0;
    return c;
  };
  const bestSplit = (g: Player[]): [Player[], Player[], number] => {
    if (g.length === 2) return [[g[0]], [g[1]], cost([g[0]], [g[1]])];
    const [a, b, c, d] = g;
    const splits: [Player[], Player[]][] = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
    return splits.map(([A, B]) => [A, B, cost(A, B)] as [Player[], Player[], number]).sort((x, y) => x[2] - y[2])[0];
  };

  // ponytail: 200 random restarts instead of exact search; bump if 5+ courts still look lopsided
  let best: { matches: Match[]; total: number } | null = null;
  for (let iter = 0; iter < 200; iter++) {
    const pool = shuffle(active);
    const matches: Match[] = [];
    let total = 0;
    for (let court = 1; pool.length; court++) {
      const g = pool.splice(0, pool.length >= 4 ? 4 : 2);
      const [A, B, c] = bestSplit(g);
      matches.push({ court, teamA: A.map((p) => p.id), teamB: B.map((p) => p.id) });
      total += c;
    }
    if (!best || total < best.total) best = { matches, total };
    if (total === 0) break;
  }
  return { matches: best?.matches ?? [], bench };
}

/** mulberry32: tiny seeded PRNG so a preview and the real fill produce the same layout. */
export const seeded = (s: number) => () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
