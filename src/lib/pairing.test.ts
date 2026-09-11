import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRound, type Match, type Player } from "./pairing.ts";

// deterministic LCG so failures reproduce
const seeded = (s = 1) => () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
const mk = (n: number, rated = true): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, skill: rated ? (i % 5) + 1 : null }));
const ids = (m: Match) => [...m.teamA, ...m.teamB];

test("9 players / 2 courts: 8 play, 1 benched, nobody twice", () => {
  const r = generateRound(mk(9), 2, [], seeded());
  assert.equal(r.matches.length, 2);
  assert.equal(r.bench.length, 1);
  const all = [...r.matches.flatMap(ids), ...r.bench].sort((a, b) => a - b);
  assert.deepEqual(all, mk(9).map((p) => p.id));
});

test("6 players / 2 courts: one doubles, one singles", () => {
  const r = generateRound(mk(6), 2, [], seeded());
  assert.deepEqual(r.matches.map((m) => ids(m).length).sort(), [2, 4]);
  assert.equal(r.bench.length, 0);
});

test("bench rotates: whoever has played most sits", () => {
  const players = mk(9);
  const history: Match[] = [];
  const benched: number[] = [];
  for (let i = 0; i < 9; i++) {
    const r = generateRound(players, 2, history, seeded(i));
    benched.push(r.bench[0]);
    history.push(...r.matches);
  }
  // 9 rounds, 1 bench each → every player benched exactly once
  assert.deepEqual([...benched].sort((a, b) => a - b), players.map((p) => p.id));
});

test("balanced teams when rated", () => {
  const players: Player[] = [
    { id: 1, name: "a", skill: 5 }, { id: 2, name: "b", skill: 5 },
    { id: 3, name: "c", skill: 1 }, { id: 4, name: "d", skill: 1 },
  ];
  const r = generateRound(players, 1, [], seeded());
  const skill = (t: number[]) => t.reduce((s, id) => s + players[id - 1].skill!, 0);
  assert.equal(skill(r.matches[0].teamA), skill(r.matches[0].teamB));
});

test("avoids repeating the same partner", () => {
  const players = mk(4, false);
  const history: Match[] = [];
  const partnerKeys = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const r = generateRound(players, 1, history, seeded(i));
    for (const t of [r.matches[0].teamA, r.matches[0].teamB]) partnerKeys.add([...t].sort().join("-"));
    history.push(...r.matches);
  }
  assert.equal(partnerKeys.size, 6); // 4 players → 6 distinct pairs, all used in 3 rounds
});

test("unrated players still get a round", () => {
  const r = generateRound(mk(8, false), 2, [], seeded());
  assert.equal(r.matches.length, 2);
});
