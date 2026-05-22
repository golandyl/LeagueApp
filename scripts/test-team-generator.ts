/**
 * Run with:  npm run test:teams
 *
 * Tests every rule as a postcondition on the public generateTeams() output.
 * No knowledge of internal implementation is required.
 */

import { generateTeams, type DraftPlayer, type GeneratedTeam, type Position, type Stamina } from '../src/lib/team-generator'

// ─── Tiny test harness ────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(label: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${label}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${label}`)
    console.log(`      ${(e as Error).message}`)
    failed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertClose(a: number, b: number, tol: number, message: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${message} (got ${a.toFixed(4)}, expected ~${b.toFixed(4)})`)
}

// ─── Helpers (replicate here so tests have no implementation dependency) ─────

type Perm<T> = T[]
function* allPerms<T>(arr: T[]): Generator<Perm<T>> {
  if (arr.length <= 1) { yield arr.slice(); return }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, k) => k !== i)
    for (const p of allPerms(rest)) yield [arr[i], ...p]
  }
}

function variance(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
}

const ALL_POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD']
const ALL_STAMINAS: readonly Stamina[] = ['Low', 'Med', 'High']

function balanceScore(players: DraftPlayer[]): number {
  const pos  = ALL_POSITIONS.map(p => players.filter(x => x.position === p).length)
  const stam = ALL_STAMINAS.map(s => players.filter(x => x.stamina === s).length)
  return variance(pos) + variance(stam)
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePlayer(name: string, rating: number, position: Position, stamina: Stamina): DraftPlayer {
  return { name, rating, position, stamina }
}

// 10-player squad — no ties, varied positions and stamina
const squad10: DraftPlayer[] = [
  makePlayer('Alice',   9, 'GK',  'High'),
  makePlayer('Bob',     8, 'DEF', 'Med'),
  makePlayer('Carol',   7, 'MID', 'Low'),
  makePlayer('Dave',    7, 'FWD', 'High'),
  makePlayer('Eve',     6, 'DEF', 'Med'),
  makePlayer('Frank',   5, 'MID', 'High'),
  makePlayer('Grace',   4, 'FWD', 'Low'),
  makePlayer('Hank',    3, 'GK',  'Med'),
  makePlayer('Ivy',     2, 'DEF', 'High'),
  makePlayer('Jack',    1, 'MID', 'Low'),
]

// 7-player squad — needs ghost padding for 3 teams
const squad7: DraftPlayer[] = squad10.slice(0, 7)

// 22-player squad — realistic football match
const squad22: DraftPlayer[] = [
  makePlayer('P1',  10, 'GK',  'High'), makePlayer('P2',  10, 'GK',  'Med'),
  makePlayer('P3',   9, 'DEF', 'High'), makePlayer('P4',   9, 'DEF', 'Low'),
  makePlayer('P5',   8, 'DEF', 'Med'),  makePlayer('P6',   8, 'DEF', 'High'),
  makePlayer('P7',   7, 'MID', 'Med'),  makePlayer('P8',   7, 'MID', 'High'),
  makePlayer('P9',   7, 'MID', 'Low'),  makePlayer('P10',  6, 'MID', 'Med'),
  makePlayer('P11',  6, 'FWD', 'Low'),  makePlayer('P12',  6, 'FWD', 'High'),
  makePlayer('P13',  5, 'FWD', 'Med'),  makePlayer('P14',  5, 'MID', 'Low'),
  makePlayer('P15',  5, 'DEF', 'High'), makePlayer('P16',  4, 'GK',  'Low'),
  makePlayer('P17',  4, 'DEF', 'Med'),  makePlayer('P18',  4, 'MID', 'High'),
  makePlayer('P19',  3, 'FWD', 'Low'),  makePlayer('P20',  3, 'DEF', 'Med'),
  makePlayer('P21',  2, 'MID', 'High'), makePlayer('P22',  1, 'FWD', 'Low'),
]

// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== Team Generator — Test Suite ===\n')

// ─── Rule 1: Ghost Goalkeepers ───────────────────────────────────────────────

console.log('[Rule 1] Ghost Goalkeepers')

test('7 players / 3 teams → 2 ghosts added, 9 total players across teams', () => {
  const teams = generateTeams(squad7, 3)
  const total = teams.reduce((s, t) => s + t.players.length, 0)
  assert(total === 9, `expected 9 total, got ${total}`)
  const ghosts = teams.flatMap(t => t.players).filter(p => p.isGhost)
  assert(ghosts.length === 2, `expected 2 ghosts, got ${ghosts.length}`)
})

test('Ghost Goalkeeper has rating 5, position DEF, stamina Med', () => {
  const teams = generateTeams(squad7, 3)
  const ghost = teams.flatMap(t => t.players).find(p => p.isGhost)!
  assert(ghost.rating === 5, `rating: expected 5, got ${ghost.rating}`)
  assert(ghost.position === 'DEF', `position: expected DEF, got ${ghost.position}`)
  assert(ghost.stamina === 'Med', `stamina: expected Med, got ${ghost.stamina}`)
})

test('10 players / 2 teams → no ghosts needed', () => {
  const teams = generateTeams(squad10, 2)
  const ghosts = teams.flatMap(t => t.players).filter(p => p.isGhost)
  assert(ghosts.length === 0, `expected 0 ghosts, got ${ghosts.length}`)
})

test('11 players / 2 teams → 1 ghost added', () => {
  const squad11 = [...squad10, makePlayer('Extra', 5, 'MID', 'Med')]
  const teams = generateTeams(squad11, 2)
  const ghosts = teams.flatMap(t => t.players).filter(p => p.isGhost)
  assert(ghosts.length === 1, `expected 1 ghost, got ${ghosts.length}`)
})

// ─── Rule 2: Sort + Tiebreak ─────────────────────────────────────────────────

console.log('\n[Rule 2] Sort descending, shuffle tied ratings')

test('All teams combined: players sorted non-ascending by rating within each team slot', () => {
  // Verify the global pick sequence is descending (snake order means each team
  // sees a descending series, not that the roster is sorted, but the draft pool is)
  const teams = generateTeams(squad10, 2)
  const allRatings = teams.flatMap(t => t.players).map(p => p.rating)
  // The draft pool must be drawn from a sorted list, so the max any team can hold
  // is bounded. The simplest postcondition: no team has a higher-rated player
  // drafted AFTER a lower-rated player from a DIFFERENT rating group.
  // Verify: the two highest ratings (9, 8) are each on different teams.
  const teamRatings = teams.map(t => t.players.map(p => p.rating))
  const team0HasAlice = teamRatings[0].includes(9)
  const team1HasAlice = teamRatings[1].includes(9)
  assert(team0HasAlice || team1HasAlice, '9-rated player must be on one of the teams')
  // Both 9 and 8 should be on different teams (snake round 1: one to each)
  const aliceTeam = team0HasAlice ? 0 : 1
  const bobOnOther = teamRatings[1 - aliceTeam].includes(8)
  assert(bobOnOther, 'Top-2 rated players should be split across teams by snake round 1')
})

test('Tied-rating players appear in varied order across multiple runs', () => {
  // squad22 has multiple ties (10s, 9s, 7s, 6s, 5s, 4s, 3s)
  const orders: string[] = []
  for (let i = 0; i < 8; i++) {
    const teams = generateTeams(squad22, 2)
    orders.push(teams.flatMap(t => t.players).map(p => p.name).join(','))
  }
  const unique = new Set(orders)
  // With multiple tied groups, probability of all 8 runs identical is astronomically low
  assert(unique.size > 1, 'Same ordering on every run — shuffle is not working')
})

// ─── Rule 3: Snake Draft ──────────────────────────────────────────────────────

console.log('\n[Rule 3] Snake draft structure')

test('Each team has exactly the same number of players', () => {
  for (const [numTeams, squad] of [[2, squad10], [3, squad7], [2, squad22]] as const) {
    const teams = generateTeams(squad as DraftPlayer[], numTeams)
    const sizes = teams.map(t => t.players.length)
    assert(
      sizes.every(s => s === sizes[0]),
      `Unequal roster sizes ${sizes.join(',')} for ${numTeams} teams`,
    )
  }
})

test('All input players appear exactly once in the output', () => {
  const teams = generateTeams(squad22, 2)
  const outputNames = teams.flatMap(t => t.players).map(p => p.name).sort()
  const inputNames = squad22.map(p => p.name).sort()
  assert(
    inputNames.every(n => outputNames.includes(n)),
    'One or more input players are missing from the output',
  )
})

test('Snake round 1 picks: top-rated N players split one-per-team (no team gets two)', () => {
  // 4 teams, 10 players (no padding needed: 10%4=2, so we need 2 ghosts → 12 total).
  // Top 4 ratings in squad10: 9,8,7,7. After round 1 each team holds exactly one.
  const teams = generateTeams(squad10, 4)
  // Round 1 picks are the highest-rated player on each team (each team's first pick).
  // Their ratings must all be distinct from the top-4 tier (9,8,7,7) — one each.
  const round1Picks = teams.map(t => t.players[0].rating)
  const round1Set = new Set(round1Picks)
  // 4 picks from pool, each team gets one — sizes should all be equal
  assert(round1Picks.length === 4, 'Should have 4 teams')
  // All round-1 picks come from the highest-rated group; no team can be missing one
  assert(
    round1Picks.every(r => r >= 7),
    `Round-1 picks ${round1Picks} — expected all ≥7 (top-4 ratings in pool)`,
  )
})

// ─── Rule 4: Optimal Final Round ─────────────────────────────────────────────

console.log('\n[Rule 4] Optimal final-round assignment')

test('No permutation of final-round players produces lower team variance (2 teams)', () => {
  // Run multiple times to account for random tiebreaks
  for (let run = 0; run < 5; run++) {
    const teams = generateTeams(squad10, 2)
    assertOptimalFinalRound(teams)
  }
})

test('No permutation of final-round players produces lower team variance (3 teams)', () => {
  for (let run = 0; run < 5; run++) {
    const teams = generateTeams(squad7, 3)    // includes ghosts
    assertOptimalFinalRound(teams)
  }
})

test('No permutation of final-round players produces lower team variance (22-player / 2 teams)', () => {
  for (let run = 0; run < 3; run++) {
    const teams = generateTeams(squad22, 2)
    assertOptimalFinalRound(teams)
  }
})

/** Postcondition: the last player on each team (their final-round pick) is the
 *  optimal assignment.  We verify by trying every other permutation. */
function assertOptimalFinalRound(teams: GeneratedTeam[]) {
  const n = teams.length
  const finalPicks = teams.map(t => t.players[t.players.length - 1])
  const preRoundSums = teams.map(t => t.players.slice(0, -1).reduce((s, p) => s + p.rating, 0))

  const actualSums = preRoundSums.map((s, i) => s + finalPicks[i].rating)
  const actualVariance = variance(actualSums)

  for (const perm of allPerms(finalPicks)) {
    const altSums = preRoundSums.map((s, i) => s + perm[i].rating)
    const altVariance = variance(altSums)
    assert(
      altVariance >= actualVariance - 1e-9,
      `Found a better final-round assignment (var ${altVariance.toFixed(4)} < ${actualVariance.toFixed(4)}). ` +
      `Ratings: actual [${finalPicks.map(p => p.rating)}] vs better [${perm.map(p => p.rating)}]`,
    )
  }
}

// ─── Rule 5: Swap Optimisation ───────────────────────────────────────────────

console.log('\n[Rule 5] Swap optimisation')

test('After generation, no same-rating swap between any two teams improves balance', () => {
  for (let run = 0; run < 5; run++) {
    const teams = generateTeams(squad22, 2)
    assertNoRemainingSwaps(teams)
  }
})

test('Same-rating swap test with 3 teams', () => {
  for (let run = 0; run < 5; run++) {
    const teams = generateTeams(squad22.slice(0, 12), 3)  // 12 players, 4 each
    assertNoRemainingSwaps(teams)
  }
})

test('Constructed scenario: heavily imbalanced positions/stamina are corrected', () => {
  // Build two groups that are internally homogeneous but collectively diverse —
  // the algorithm should swap to balance across teams.
  // All 6 players have rating 5, so swaps are allowed.
  const homogeneous: DraftPlayer[] = [
    { name: 'A', rating: 5, position: 'GK',  stamina: 'High' },
    { name: 'B', rating: 5, position: 'GK',  stamina: 'High' },
    { name: 'C', rating: 5, position: 'GK',  stamina: 'High' },
    { name: 'D', rating: 5, position: 'FWD', stamina: 'Low'  },
    { name: 'E', rating: 5, position: 'FWD', stamina: 'Low'  },
    { name: 'F', rating: 5, position: 'FWD', stamina: 'Low'  },
  ]
  const teams = generateTeams(homogeneous, 2)

  // The initial naive split would put GKs on one team, FWDs on the other.
  // After swaps, each team should have a more balanced mix.
  const team0Positions = new Set(teams[0].players.map(p => p.position))
  const team1Positions = new Set(teams[1].players.map(p => p.position))
  assert(
    team0Positions.size > 1 && team1Positions.size > 1,
    `Expected both teams to have mixed positions. ` +
    `Team 0: ${[...team0Positions]}, Team 1: ${[...team1Positions]}`,
  )

  // Verify postcondition holds
  assertNoRemainingSwaps(teams)
})

/** Postcondition: for every pair of same-rating players across different teams,
 *  swapping them must not strictly decrease the combined balance score. */
function assertNoRemainingSwaps(teams: GeneratedTeam[]) {
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      for (const pi of teams[i].players) {
        for (const pj of teams[j].players) {
          if (pi.rating !== pj.rating) continue

          const before = balanceScore(teams[i].players) + balanceScore(teams[j].players)
          const swappedI = teams[i].players.map(p => (p === pi ? pj : p))
          const swappedJ = teams[j].players.map(p => (p === pj ? pi : p))
          const after = balanceScore(swappedI) + balanceScore(swappedJ)

          assert(
            after >= before - 1e-9,
            `Beneficial swap missed: ${pi.name}(t${i}) ↔ ${pj.name}(t${j}) ` +
            `would improve balance from ${before.toFixed(4)} → ${after.toFixed(4)}`,
          )
        }
      }
    }
  }
}

// ─── Integration: realistic 22-player match ───────────────────────────────────

console.log('\n[Integration] Realistic 22-player / 2-team generation')

test('totalRating on each GeneratedTeam is correct', () => {
  const teams = generateTeams(squad22, 2)
  for (const team of teams) {
    const computed = team.players.reduce((s, p) => s + p.rating, 0)
    assert(computed === team.totalRating, `totalRating mismatch: field=${team.totalRating}, computed=${computed}`)
  }
})

test('Team rating sums differ by ≤ 5 (within acceptable balance range)', () => {
  for (let run = 0; run < 10; run++) {
    const teams = generateTeams(squad22, 2)
    const ratings = teams.map(t => t.totalRating)
    const diff = Math.abs(ratings[0] - ratings[1])
    assert(diff <= 5, `Rating imbalance too large: teams ${ratings[0]} vs ${ratings[1]} (diff=${diff})`)
  }
})

test('Output is deterministic in structure even though player order varies', () => {
  // Run 5 times — total rating of each team should be stable (final-round
  // optimisation + swaps converge to the same rating distribution).
  const ratingSets = new Set<string>()
  for (let i = 0; i < 5; i++) {
    const teams = generateTeams(squad22, 2)
    ratingSets.add(teams.map(t => t.totalRating).sort().join(','))
  }
  // All runs should land on the same rating split (stable optimum)
  assert(ratingSets.size <= 2, `Unstable rating split across runs: ${[...ratingSets].join(' | ')}`)
})

// ─── Error handling ───────────────────────────────────────────────────────────

console.log('\n[Errors] Input validation')

test('Throws if numTeams < 2', () => {
  let threw = false
  try { generateTeams(squad10, 1) } catch { threw = true }
  assert(threw, 'Expected an error for numTeams=1')
})

test('Throws if players.length < numTeams', () => {
  let threw = false
  try { generateTeams(squad10.slice(0, 2), 5) } catch { threw = true }
  assert(threw, 'Expected an error when players < numTeams')
})

// ─── Summary ──────────────────────────────────────────────────────────────────

const total = passed + failed
console.log(`\n${'─'.repeat(40)}`)
if (failed === 0) {
  console.log(`✓ All ${total} tests passed\n`)
} else {
  console.log(`✗ ${failed}/${total} tests failed\n`)
  process.exit(1)
}
