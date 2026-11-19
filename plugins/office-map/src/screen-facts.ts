// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { AgentFacts, Facts, Fact, ReadFailure } from './contracts.ts'
import { unloaded } from './contracts.ts'
import type { Views } from './read.ts'
import { AGENTS_LIMIT, READ_TARGET_LIMIT, theTargetOfARead } from '../../../src/shared/plugin-read.ts'

type HeavyView = 'people' | 'work'
interface Job { ids: string[]; screenVersion: number; revisions: Record<string, number>; card: boolean; rest: boolean }
interface Lane { active: Job | null; cards: string[]; screen: string[][]; rest: string[][] }
const lane = (): Lane => ({ active: null, cards: [], screen: [], rest: [] })
/** Conservative per-request work size; the slot ceiling and encoded target bound still apply. */
export const AGENT_CHUNK = Math.min(20, AGENTS_LIMIT.most)
/**
 * The most agents a map may hold for the page to read every one of them: 5 chunks per view, about what one
 * wide screen reads. A larger office is read only by screen, and its counters say so.
 */
export const WHOLE_OFFICE_LIMIT = 100
/** Keep the last coherent reading visible during a short refresh. */
export const REFRESH_GRACE_MS = 1000
/**
 * The longest path and query one read may send, aliased from the published slot limit.
 *
 * Node 22 counts the request target and the header names and values together against 16,383 bytes; the
 * method and protocol are not counted. READ_TARGET_LIMIT leaves room under that for the headers a browser
 * sends, which the slot cannot see in full. A longer read is refused there as too-long.
 */
export const ENCODED_REQUEST_LIMIT = READ_TARGET_LIMIT
const VALID_AGENT_ID = new RegExp(`^[A-Za-z0-9_-]{1,${AGENTS_LIMIT.idLength}}$`)
export function agentIds(ids: string[]): string[] {
  const result = [...new Set(ids)]
  if (result.some(id => !VALID_AGENT_ID.test(id))) throw new Error('Invalid agent registry id')
  return result
}
/**
 * The slot builds a read's path and query with the published builder, so this wrapper measures the same
 * encoded bytes the slot counts against READ_TARGET_LIMIT.
 */
export function encodedAgentsRequest(view: 'people' | 'work', ids: string[]): string {
  return theTargetOfARead(view, { agents: ids.join(',') })
}
/** Both views share the longer people path, so a shared partition stays under the bound in either view. */
export function chunks(ids: string[]): string[][] {
  const result: string[][] = []
  let current: string[] = []
  for (const id of ids) {
    const next = [...current, id]
    if (next.length > AGENT_CHUNK || encodedAgentsRequest('people', next).length > ENCODED_REQUEST_LIMIT) {
      if (current.length === 0) throw new Error('One agent id does not fit the encoded request bound')
      result.push(current)
      current = [id]
      if (encodedAgentsRequest('people', current).length > ENCODED_REQUEST_LIMIT) throw new Error('One agent id does not fit the encoded request bound')
    } else current = next
  }
  if (current.length > 0) result.push(current)
  return result
}

/** Per-agent facts are never a last-subset response masquerading as the whole office. */
export class ScreenFacts {
  private facts: Facts = Object.create(null) as Facts
  private selected: string[] = []
  private everyone: string[] = []
  private openCard: string | null = null
  private epoch = 0
  private screenVersion = 0
  private desired: Record<string, number> = Object.create(null) as Record<string, number>
  private lanes = { people: lane(), work: lane() }
  private grace = new Map<string, { facts: AgentFacts; until: number }>()
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  constructor(private ask: (view: HeavyView, ids: string[]) => boolean, private changed: () => void, private now: () => number) {}
  snapshot(): Facts {
    if (!this.grace.size) return this.facts
    const facts: Record<string, AgentFacts> = Object.assign(Object.create(null), this.facts), now = this.now()
    for (const [id, held] of this.grace) {
      const current = facts[id]
      if (current && now < held.until && (current.people.pending || current.work.pending) && current.people.status === 'loaded' && current.work.status === 'loaded' && !current.people.error && !current.work.error) {
        facts[id] = { ...held.facts, refreshGrace: true } as AgentFacts
      }
    }
    return facts
  }
  clear(): void { if (this.graceTimer !== null) clearTimeout(this.graceTimer); this.graceTimer = null; this.grace.clear(); this.facts = Object.create(null) as Facts; this.selected = []; this.everyone = []; this.openCard = null; this.epoch++; this.screenVersion++; this.desired = Object.create(null) as Record<string, number>; this.lanes = { people: lane(), work: lane() } }
  private hold(ids: string[]): void {
    const until = this.now() + REFRESH_GRACE_MS
    for (const id of ids) {
      const previous = this.facts[id]
      if (!previous || previous.people.pending || previous.work.pending || previous.people.status !== 'loaded' || previous.work.status !== 'loaded' || previous.people.error || previous.work.error || previous.people.revision !== previous.work.revision) continue
      this.grace.set(id, { facts: previous, until })
    }
    this.scheduleGrace()
  }
  private scheduleGrace(): void {
    if (this.graceTimer !== null) clearTimeout(this.graceTimer)
    this.graceTimer = null
    if (!this.grace.size) return
    const next = Math.min(...[...this.grace.values()].map(held => held.until))
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null
      const now = this.now()
      for (const [id, held] of this.grace) if (held.until <= now) this.grace.delete(id)
      this.changed(); this.scheduleGrace()
    }, Math.max(0, next - this.now()))
  }
  select(ids: string[]): void {
    const next = agentIds(ids)
    if (JSON.stringify(next) === JSON.stringify(this.selected)) return
    this.selected = next; this.screenVersion++
    for (const view of ['people', 'work'] as const) this.lanes[view].screen = chunks(next)
    try { this.markPending(next) } finally { this.drain() }
  }
  /** The work counters count the whole office, so on a map of at most WHOLE_OFFICE_LIMIT every agent is read once, after the screen's agents. */
  roster(ids: string[]): void {
    const listed = agentIds(ids), next = listed.length <= WHOLE_OFFICE_LIMIT ? listed : []
    if (JSON.stringify(next) === JSON.stringify(this.everyone)) return
    this.everyone = next
    const unread = next.filter(id => !(id in this.facts))
    if (!unread.length) return
    for (const view of ['people', 'work'] as const) this.lanes[view].rest.push(...chunks(unread))
    try { this.markPending(unread) } finally { this.drain() }
  }
  card(id: string | null): void {
    this.openCard = id
    if (id === null) return
    agentIds([id])
    for (const view of ['people', 'work'] as const) if (!this.lanes[view].cards.includes(id)) this.lanes[view].cards.push(id)
    try { this.markPending([id]) } finally { this.drain() }
  }
  refresh(): void {
    this.screenVersion++
    const cards = [...new Set([...(this.openCard ? [this.openCard] : []), ...Object.values(this.lanes).flatMap(lane => [...lane.cards, ...(lane.active?.card ? lane.active.ids : [])])])]
    const first = new Set([...this.selected, ...cards])
    for (const view of ['people', 'work'] as const) {
      this.lanes[view].screen = chunks(this.selected)
      this.lanes[view].rest = chunks(this.everyone.filter(id => !first.has(id)))
      for (const id of cards) if (!this.lanes[view].cards.includes(id)) this.lanes[view].cards.push(id)
    }
    // Receipts for a refreshed subset do not make older cached agents current.
    try { this.markPending([...new Set([...Object.keys(this.facts), ...first, ...this.everyone])]) } finally { this.drain() }
  }
  private markPending(ids: string[]): void {
    this.hold(ids)
    const revision = ++this.epoch, facts: Record<string, AgentFacts> = Object.assign(Object.create(null), this.facts)
    for (const id of ids) {
      this.desired[id] = revision
      const previous = facts[id] ?? { people: unloaded(), work: unloaded() }
      facts[id] = { people: { ...previous.people, pending: true }, work: { ...previous.work, pending: true } }
    }
    this.facts = facts; this.changed()
  }
  drain(): void {
    for (const view of ['people', 'work'] as const) {
      const lane = this.lanes[view]
      if (lane.active) continue
      const card = lane.cards[0], screen = lane.screen[0], ids = card ? [card] : screen ?? lane.rest[0]
      if (!ids) continue
      const job = { ids, screenVersion: this.screenVersion, revisions: Object.fromEntries(ids.map(id => [id, this.desired[id]!])), card: !!card, rest: !card && !screen }; lane.active = job
      if (this.ask(view, ids)) { if (card) lane.cards.shift(); else if (screen) lane.screen.shift(); else lane.rest.shift() }
      else lane.active = null
    }
  }
  accept(view: HeavyView, ids: string[], data: Views[keyof Views] | null, failure: ReadFailure | null = null): boolean | null {
    const lane = this.lanes[view], job = lane.active
    lane.active = null
    if (!job || JSON.stringify(job.ids) !== JSON.stringify(ids)) return null
    // A replaced screen request can never publish even a partly useful old subset.
    if (!job.card && !job.rest && job.screenVersion !== this.screenVersion) return null
    const body = data as Views[HeavyView] | null
    const asked = new Set(ids), absent = new Set(body?.notAgents ?? [])
    const rows = body?.view === 'people' ? body.agents : body?.view === 'work' ? body.work : []
    const returned = new Set(rows.map(row => 'agent' in row ? row.agent : row.id))
    const valid = body?.view === view && Array.isArray(body.notAgents) && absent.size === body.notAgents.length &&
      [...absent].every(id => asked.has(id) && !returned.has(id)) && [...returned].every(id => asked.has(id)) &&
      (view !== 'people' || rows.length === returned.size && ids.every(id => absent.has(id) || returned.has(id)))
    const facts: Record<string, AgentFacts> = Object.assign(Object.create(null), this.facts), receivedAt = this.now()
    let accepted = false
    for (const id of ids) {
      if (job.revisions[id] !== this.desired[id]) continue
      accepted = true
      const previous: AgentFacts = facts[id] ?? { people: unloaded(), work: unloaded() }
      let fact: Fact<unknown>
      if (!valid) fact = previous[view].status === 'loaded' || previous[view].status === 'absent' ? { ...previous[view], error: 'read', failure } : { status: 'unloaded', error: 'read', failure }
      else if (absent.has(id)) fact = { status: 'absent', receivedAt, error: null }
      else fact = { status: 'loaded', receivedAt, error: null, value: view === 'people' ? (body as Views['people']).agents.find(row => row.id === id)! : (body as Views['work']).work.filter(row => row.agent === id) }
      facts[id] = { ...previous, [view]: { ...fact, pending: false, revision: job.revisions[id] } } as AgentFacts
      if (fact.status !== 'loaded' || fact.error || (!facts[id]!.people.pending && !facts[id]!.work.pending)) this.grace.delete(id)
    }
    this.facts = facts
    this.scheduleGrace()
    return accepted ? !!valid : null
  }
}
