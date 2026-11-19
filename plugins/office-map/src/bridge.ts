// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import { string } from 'zod/mini'
import manifest from '../plugin.json'
import { PLUGIN_READ_INTERFACE } from '../../../src/shared/plugin-read.ts'
import type { PluginAsksTheSlot, PluginReadView, Facts, ReadFailure } from './contracts.ts'
import { ScreenFacts } from './screen-facts.ts'
import { readView, readViewSlices, type Views } from './read.ts'
import { SlicedBuild } from './layout-index.ts'
import { onFirstUse } from './startup.ts'

// Plain strings use the same core parser without bundling unused classic format methods.
// Built on first use, not while the module evaluates (startup.ts).
const schemas = onFirstUse(() => {
  z.config({ jitless: true })
  const context = z.object({
    interface: z.literal(PLUGIN_READ_INTERFACE), kind: z.literal('context'),
    plugin: z.literal(manifest.id), page: z.literal(manifest.pages[0]!.slug),
    language: z.enum(['en', 'zh']), theme: z.enum(['light', 'dark']), reducedMotion: z.boolean(), project: string().check(z.minLength(1)),
  })
  const answer = z.object({
    interface: z.literal(PLUGIN_READ_INTERFACE), kind: z.literal('answer'), id: string(), view: string(),
    status: z.number().int(), tag: z.nullable(string()), body: z.unknown(),
  })
  const refused = z.object({
    interface: z.literal(PLUGIN_READ_INTERFACE), kind: z.literal('refused'), id: z.nullable(string()),
    view: z.nullable(string()), why: z.enum(['not-understood', 'not-a-view', 'not-in-the-manifest', 'already-asking', 'could-not-ask']), said: string(),
  })
  const tooLong = z.object({
    interface: z.literal(PLUGIN_READ_INTERFACE), kind: z.literal('refused'), id: string(), view: string(),
    why: z.literal('too-long'), bytes: z.number().int().nonnegative().safe(), limit: z.number().int().nonnegative().safe(),
  })
  return { context, answer, refused, tooLong }
})
type Schemas = ReturnType<typeof schemas>
export type Context = z.infer<Schemas['context']>
export interface ViewState<V extends PluginReadView = PluginReadView> {
  data: Views[V] | null
  receivedAt: number | null
  status: 'waiting' | 'loading' | 'ready' | 'stale' | 'unavailable'
  error: 'permission' | 'invalid' | 'read' | null
  tag: string | null
  failure?: ReadFailure | null
}
export type ViewStates = { [V in PluginReadView]: ViewState<V> }
const freshViews = (): ViewStates => Object.fromEntries(manifest.reads.map(view => [view, {
  data: null, receivedAt: null, status: 'waiting', error: null, tag: null,
}])) as ViewStates

interface Pending { id: string; generation: number; baseline: boolean; talkEpoch: number; agents?: string[] }
export interface ContactBatch {
  sequence: number
  receivedAt: number
  messages: Views['talk']['messages']
  withdrawn: string[]
}
export interface BridgeSnapshot { context: Context | null; generation: number; views: ViewStates; active: boolean; contacts: ContactBatch | null; facts: Facts }

/** Manual refresh only: no background polling, simulation, storage, fetch or host actions. */
export class OfficeReader {
  private context: Context | null = null
  private views = freshViews()
  private generation = 0
  private sequence = 0
  private active = true
  private disposed = false
  // Keep old requests until answered: the slot cannot cancel them and permits only one per view.
  private pending = new Map<PluginReadView, Pending>()
  private decoding = new Map<PluginReadView, SlicedBuild<Views[PluginReadView] | null>>()
  private talkOpen = false
  private talkCursor: string | null = null
  private withdrawalCursor: string | null = null
  private baseline = false
  private talkEpoch = 0
  private batchSequence = 0
  private contacts: ContactBatch | null = null
  private denied = new Set<PluginReadView>()

  private readonly screenFacts: ScreenFacts

  constructor(
    private readonly send: (message: PluginAsksTheSlot) => void,
    private readonly changed: (snapshot: BridgeSnapshot) => void,
    private readonly now: () => number = Date.now,
    private readonly byScreen = true,
  ) { this.screenFacts = new ScreenFacts((view, ids) => this.read(view, ids), () => this.emit(), now) }

  start(): void { if (!this.disposed) this.send({ interface: PLUGIN_READ_INTERFACE, ask: 'ready' }) }

  snapshot(): BridgeSnapshot { return { context: this.context, generation: this.generation, views: this.views, active: this.active, contacts: this.contacts, facts: this.screenFacts.snapshot() } }

  receive(raw: unknown, sliced = false): void {
    if (this.disposed) return
    // Dispatch on kind before decoding. Without this, every answer is also parsed by
    // contextSchema and refusedSchema; both fail on kind and spend about 20 microseconds
    // building issues. Measured on a 5000-person answer: the envelope dispatch takes
    // 20229 ns before and 235 ns after (median, 50000 repetitions), and a full receive
    // takes 3.685 ms before and 3.654 ms after, because decoding the body dominates.
    // Neither schema reads body, so body size is not the reason for the dispatch.
    const kind = raw !== null && typeof raw === 'object' ? (raw as { kind?: unknown }).kind : null
    const { context: contextSchema, answer: answerSchema, refused: refusedSchema } = schemas()
    const context = kind === 'context' ? contextSchema.safeParse(raw) : null
    if (context?.success) {
      if (JSON.stringify(context.data) === JSON.stringify(this.context)) return
      this.context = context.data
      this.denied.clear()
      this.invalidate()
      this.emit()
      this.refresh()
      return
    }
    if (kind !== 'answer' && kind !== 'refused') return
    const envelope = raw as { interface?: unknown; id?: unknown; view?: unknown }
    if (envelope.interface !== PLUGIN_READ_INTERFACE || typeof envelope.id !== 'string') return
    // Only an issued ID identifies a read. A broken view must never redirect its failure to another lane.
    const match = [...this.pending].find(([, pending]) => pending.id === envelope.id)
    if (!match) return
    const [view, pending] = match
    if (this.decoding.has(view)) return
    const parsed = kind === 'answer' ? answerSchema.safeParse(raw) :
      (raw as { why?: unknown }).why === 'too-long' ? schemas().tooLong.safeParse(raw) : refusedSchema.safeParse(raw)
    if (!parsed.success || envelope.view !== view) { this.accept(view, pending, null); return }
    const message = parsed.data
    if (sliced && message.kind === 'answer' && message.status === 200 && pending.generation === this.generation) {
      const job = new SlicedBuild<Views[PluginReadView] | null>()
      this.decoding.set(view, job)
      job.start(readViewSlices(view, message.body), data => {
        this.decoding.delete(view)
        this.accept(view, pending, message, data)
      })
      return
    }
    this.accept(view, pending, message)
  }

  private accept(view: PluginReadView, pending: Pending,
    message: z.infer<Schemas['answer']> | z.infer<Schemas['refused']> | z.infer<Schemas['tooLong']> | null, decoded?: Views[PluginReadView] | null): void {
    if (this.disposed || this.pending.get(view) !== pending) return
    this.pending.delete(view)
    if (pending.generation !== this.generation || (view === 'talk' && pending.talkEpoch !== this.talkEpoch)) {
      if (this.byScreen && (view === 'people' || view === 'work')) this.screenFacts.drain()
      else this.read(view)
      return
    }
    const state = this.views[view]
    const failure: ReadFailure | null = message?.kind === 'refused' && message.why === 'too-long'
      ? { why: 'too-long', bytes: message.bytes, limit: message.limit } : null
    if (this.byScreen && pending.agents) {
      if (message?.kind === 'refused' && message.why !== 'could-not-ask' && message.why !== 'too-long' || message?.kind === 'answer' && [401, 403].includes(message.status)) {
        this.fail(view, 'permission', true); this.emit(); return
      }
      const data = message?.kind === 'answer' && message.status === 200 ? (decoded === undefined ? readView(view, message.body) : decoded) : null
      const valid = this.screenFacts.accept(view as 'people' | 'work', pending.agents, data, failure)
      if (valid === null) { this.emit(); this.screenFacts.drain(); return }
      state.data = null; state.tag = null
      state.status = valid ? 'ready' : 'unavailable'; state.error = valid ? null : message?.kind === 'refused' ? 'read' : 'invalid'; state.failure = failure
      if (valid) state.receivedAt = this.now()
      this.emit(); this.screenFacts.drain(); return
    }
    if (message === null) this.fail(view, 'invalid', false)
    else if (message.kind === 'refused') {
      // Transport failure may show the last read. Any refusal of access clears every private join.
      if (message.why === 'could-not-ask' || message.why === 'too-long') this.fail(view, 'read', false, failure)
      else this.fail(view, 'permission', true)
    } else if (message.status === 304) {
      if (state.data === null || state.tag === null || message.body !== null) this.fail(view, 'invalid', false)
      else { state.status = 'ready'; state.error = null; state.failure = null; state.receivedAt = this.now() }
    } else if (message.status === 200) {
      const data = decoded === undefined ? readView(view, message.body) : decoded
      if (data === null) this.fail(view, 'invalid', false)
      else {
        if (view === 'talk') {
          const talk = data as Views['talk']
          const receivedAt = this.now()
          // The first answer is a baseline even if it contains messages. Never replay it.
          // A truncated withdrawal page cannot establish which queued contacts remain permitted.
          this.contacts = { sequence: ++this.batchSequence, receivedAt,
            messages: pending.baseline || talk.withdrawn.more ? [] : talk.messages.slice(0, 20),
            withdrawn: talk.withdrawn.more ? [] : talk.withdrawn.ids.slice(0, 1000) }
          this.talkCursor = talk.last
          this.withdrawalCursor = talk.withdrawn.last
          this.baseline = true
          const metadata = { ...talk, messages: [], leftOutGroups: [], withdrawn: { ...talk.withdrawn, ids: [], leftOutGroups: [] } }
          this.views.talk.data = metadata
        } else {
          // The decoder above checks the same view discriminator before this indexed assignment.
          ;(state as ViewState).data = data
        }
        state.status = 'ready'; state.error = null; state.failure = null; state.receivedAt = this.now(); state.tag = message.tag
      }
    } else this.fail(view, message.status === 401 || message.status === 403 ? 'permission' : 'read', message.status === 401 || message.status === 403)
    this.emit()
  }

  refresh(): void {
    if (!this.active || this.context === null || this.disposed) return
    for (const view of (this.byScreen ? ['projects', 'roster', 'talk', 'online', 'asleep'] : ['projects', 'people', 'work', 'talk', 'online', 'asleep']) as PluginReadView[]) this.read(view)
    if (this.byScreen) this.screenFacts.refresh()
  }

  /** Viewport changes replace only queued screen work; card requests stay independent. */
  selectAgents(ids: string[]): void { if (this.byScreen && this.active && this.context) this.screenFacts.select(ids) }
  /** Every agent on the map. A map of at most WHOLE_OFFICE_LIMIT is read whole, after the screen's agents, so the work counters cover the office. */
  selectRoster(ids: string[]): void { if (this.byScreen && this.active && this.context) this.screenFacts.roster(ids) }
  requestCard(id: string | null): void { if (this.byScreen && this.active && this.context) this.screenFacts.card(id) }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return
    this.active = active
    this.invalidate()
    this.emit()
    if (active) this.refresh()
  }

  /** The native talk panel owns demand; closing invalidates even an already delivered partial decode. */
  setTalkOpen(open: boolean): void {
    if (this.disposed || this.talkOpen === open) return
    this.talkOpen = open
    const job = this.decoding.get('talk')
    if (job) { job.cancel(); this.decoding.delete('talk'); this.pending.delete('talk') }
    this.resetTalk(); this.views.talk = freshViews().talk; this.emit()
    if (open) this.read('talk')
  }

  /** Quiet/offscreen return must establish a new baseline without cancelling another view's read. */
  resetTalk(): void {
    this.talkEpoch++; this.baseline = false; this.talkCursor = null; this.withdrawalCursor = null; this.contacts = null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.active = false
    this.invalidate(); this.context = null; this.pending.clear()
    this.emit()
  }

  private invalidate(): void {
    // These requests have already arrived. Cancel their private partial decodes and allow
    // the next authorized generation to ask again, rather than waiting for a second reply.
    for (const [view, job] of this.decoding) { job.cancel(); this.pending.delete(view) }
    this.decoding.clear()
    this.generation += 1
    this.views = freshViews()
    this.screenFacts.clear()
    this.resetTalk()
  }

  private fail(view: PluginReadView, error: ViewState['error'], clear: boolean, failure: ReadFailure | null = null): void {
    if (clear) { this.denied.add(view); this.invalidate() }
    this.resetTalk()
    const state = this.views[view]
    state.status = state.data === null ? 'unavailable' : 'stale'
    state.error = error; state.tag = null; state.failure = failure
    if (view === 'talk') state.data = null
  }

  private read(view: PluginReadView, agents?: string[]): boolean {
    if (this.disposed || !this.active || this.context === null || this.pending.has(view) || this.denied.has(view) || (view === 'talk' && !this.talkOpen)) return false
    const state = this.views[view]
    const id = `read-${this.generation}-${++this.sequence}`
    this.pending.set(view, { id, generation: this.generation, baseline: view === 'talk' && !this.baseline, talkEpoch: this.talkEpoch, ...(agents ? { agents } : {}) })
    state.status = state.data === null ? 'loading' : 'stale'
    const query: Record<string, string | number> | undefined = agents ? { agents: agents.join(',') } : view !== 'talk' ? undefined : !this.baseline ? { start: 'latest' } : {
      limit: 20, ...(this.talkCursor === null ? {} : { after: this.talkCursor }),
      ...(this.withdrawalCursor === null ? {} : { withdrawnAfter: this.withdrawalCursor }),
    }
    this.send({ interface: PLUGIN_READ_INTERFACE, ask: 'read', id, view, ...(query === undefined ? {} : { query }),
      ...(state.tag === null || (view === 'talk' && !this.baseline) ? {} : { tag: state.tag }) })
    this.emit(); return true
  }

  private emit(): void { this.changed(this.snapshot()) }
}

/** Closing the iframe releases listeners and data; removal also destroys the browser's document. */
export function mountReader(
  target: Window,
  document: Document,
  changed: (snapshot: BridgeSnapshot) => void,
  isPaused: () => boolean = () => false,
): { reader: OfficeReader; dispose: () => void } {
  const reader = new OfficeReader(message => target.parent.postMessage(message, '*'), changed, Date.now, true)
  const onMessage = (event: MessageEvent): void => {
    if (event.source !== target.parent) return
    // Chromium unpacks the structured clone in this getter. Plugin validation starts
    // only after it returns, then large row collections run in separate bounded tasks.
    const raw: unknown = event.data
    reader.receive(raw, true)
  }
  const onVisibility = (): void => { reader.setActive(!document.hidden && !isPaused()) }
  const dispose = (): void => {
    target.removeEventListener('message', onMessage)
    target.removeEventListener('pagehide', dispose)
    target.removeEventListener('unload', dispose)
    document.removeEventListener('visibilitychange', onVisibility)
    reader.dispose()
  }
  target.addEventListener('message', onMessage)
  target.addEventListener('pagehide', dispose)
  target.addEventListener('unload', dispose)
  document.addEventListener('visibilitychange', onVisibility)
  reader.setActive(!document.hidden && !isPaused())
  reader.start()
  return { reader, dispose }
}
