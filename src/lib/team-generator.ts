export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'
export type Stamina = 'Low' | 'Med' | 'High'

export interface DraftPlayer {
  name?: string
  rating: number   // integer 1–10
  position: Position
  stamina: Stamina
  isGhost?: boolean
}

export interface GeneratedTeam {
  id: number
  players: DraftPlayer[]
  totalRating: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD']
const ALL_STAMINAS: readonly Stamina[] = ['Low', 'Med', 'High']

// ─── Math ────────────────────────────────────────────────────────────────────

function variance(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
}

// ─── Rule 1: Ghost Goalkeepers ────────────────────────────────────────────────

function padWithGhosts(players: DraftPlayer[], numTeams: number): DraftPlayer[] {
  const padded = [...players]
  while (padded.length % numTeams !== 0) {
    padded.push({ name: 'Ghost Goalkeeper', rating: 5, position: 'DEF', stamina: 'Med', isGhost: true })
  }
  return padded
}

// ─── Rule 2: Sort descending; shuffle within equal-rating groups ──────────────

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function sortWithTiebreak(players: DraftPlayer[]): DraftPlayer[] {
  const groups = new Map<number, DraftPlayer[]>()
  for (const p of players) {
    const g = groups.get(p.rating) ?? []
    g.push(p)
    groups.set(p.rating, g)
  }
  return [...groups.keys()]
    .sort((a, b) => b - a)
    .flatMap(r => fisherYates(groups.get(r)!))
}

// ─── Rule 4: Optimal final-round assignment ───────────────────────────────────

// Yields every permutation of arr (each as a fresh array).
function* permutations<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) { yield arr.slice(); return }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, k) => k !== i)
    for (const perm of permutations(rest)) yield [arr[i], ...perm]
  }
}

// Among all orderings of remainingPlayers, find the one that minimises variance
// of total team ratings when each perm[i] is assigned to draftOrder[i].
function optimalFinalRound(
  remainingPlayers: DraftPlayer[],
  draftOrder: number[],
  currentSums: number[],
): DraftPlayer[] {
  let bestVariance = Infinity
  let bestPerm = remainingPlayers.slice()

  for (const perm of permutations(remainingPlayers)) {
    const sums = [...currentSums]
    for (let i = 0; i < draftOrder.length; i++) sums[draftOrder[i]] += perm[i].rating
    const v = variance(sums)
    if (v < bestVariance) { bestVariance = v; bestPerm = perm.slice() }
  }

  return bestPerm
}

// ─── Rule 5: Position + Stamina balance ──────────────────────────────────────

// Lower score = more evenly distributed positions and stamina.
function balanceScore(players: DraftPlayer[]): number {
  const pos = ALL_POSITIONS.map(p => players.filter(x => x.position === p).length)
  const stam = ALL_STAMINAS.map(s => players.filter(x => x.stamina === s).length)
  return variance(pos) + variance(stam)
}

// Greedily swap same-rating players between teams when the combined balance
// score of the two affected teams strictly decreases. Repeats until stable.
function applySwaps(rosters: DraftPlayer[][]): DraftPlayer[][] {
  const r = rosters.map(t => [...t])
  let improved = true

  while (improved) {
    improved = false
    outer: for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        for (let pi = 0; pi < r[i].length; pi++) {
          for (let pj = 0; pj < r[j].length; pj++) {
            const a = r[i][pi], b = r[j][pj]
            if (a.rating !== b.rating) continue

            const before = balanceScore(r[i]) + balanceScore(r[j])
            r[i][pi] = b; r[j][pj] = a
            const after = balanceScore(r[i]) + balanceScore(r[j])

            if (after < before) { improved = true; break outer }
            r[i][pi] = a; r[j][pj] = b  // revert
          }
        }
      }
    }
  }

  return r
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateTeams(players: DraftPlayer[], numTeams: number): GeneratedTeam[] {
  if (numTeams < 2)            throw new Error('numTeams must be at least 2')
  if (players.length < numTeams) throw new Error('Not enough players for the requested number of teams')

  // Rule 1
  const padded = padWithGhosts(players, numTeams)

  // Rule 2
  const sorted = sortWithTiebreak(padded)

  const playersPerTeam = sorted.length / numTeams
  const rosters: DraftPlayer[][] = Array.from({ length: numTeams }, () => [])
  const currentSums = new Array<number>(numTeams).fill(0)

  // Rules 3 & 4
  for (let round = 0; round < playersPerTeam; round++) {
    const forward = round % 2 === 0
    const draftOrder = Array.from({ length: numTeams }, (_, i) => forward ? i : numTeams - 1 - i)
    const start = round * numTeams
    const isLastRound = round === playersPerTeam - 1

    if (isLastRound) {
      // Rule 4: try all permutations of the remaining players
      const remaining = sorted.slice(start)
      const bestPerm = optimalFinalRound(remaining, draftOrder, currentSums)
      for (let i = 0; i < draftOrder.length; i++) rosters[draftOrder[i]].push(bestPerm[i])
    } else {
      // Rule 3: standard snake pick
      for (let i = 0; i < draftOrder.length; i++) {
        const player = sorted[start + i]
        rosters[draftOrder[i]].push(player)
        currentSums[draftOrder[i]] += player.rating
      }
    }
  }

  // Rule 5
  const balanced = applySwaps(rosters)

  return balanced.map((pl, id) => ({
    id,
    players: pl,
    totalRating: pl.reduce((s, p) => s + p.rating, 0),
  }))
}
