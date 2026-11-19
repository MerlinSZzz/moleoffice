// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { ActionPacks } from './action-packs.ts'
import { loadTuftActions, canonicalFrame, stageAt } from './action-data.ts'
import { TUFT_ACTION_VERSION } from './action-version.ts'
import { decodeOwner, pageCompositions, type Compositions, type Composition } from './action-resources.ts'
import { composeAction, actionCompositionKey } from './action-compose.ts'
import type { ActionBinding } from './action-binding.ts'
import type { NativePixels } from './look-png.ts'
import type { Point } from './geometry.ts'
import { PageIntents } from './action-intent.ts'
export interface ActionClock { now: () => number; frame: (callback: () => void) => number; cancelFrame: (id: number) => void }
const clock: ActionClock = { now: () => performance.now(), frame: cb => requestAnimationFrame(cb), cancelFrame: id => cancelAnimationFrame(id) }
const listeners = new Set<() => void>()
export const pageActionPacks = new ActionPacks(new Map([['tuft',{ version: TUFT_ACTION_VERSION, load: loadTuftActions }]]),pageCompositions,() => { for (const listener of listeners) listener() })
const consumed = new PageIntents()
export interface ActionCandidate { key: string; token: string; binding: ActionBinding; foot: Point; scale: number }
interface Episode { candidate: ActionCandidate; started: number; sourceIndex: number; sourceKey: string; terminal: boolean; announced: boolean; output: string | null }
export class ActionRuntime {
  private candidates: ActionCandidate[] = []
  private episodes = new Map<string, Episode>()
  private active = false
  private closed = false
  private latched = false
  private acknowledging = false
  private epoch = 0
  private paintEpoch = 0
  private sourceEpoch = 0
  private appearanceEpoch = 0
  private demandEpoch = 0
  private acknowledgedAt: number | null = null
  private presentedAt: number | null = null
  private animation: number | null = null
  private paintFrames = new Set<number>()
  private settledListener: () => void = () => {}
  constructor(private repaint: () => void, private original: () => NativePixels | null, private actionClock: ActionClock = clock,
    private packs: ActionPacks = pageActionPacks, private cache: Compositions = pageCompositions, private used = consumed,
    private paintClock: ActionClock = clock) { listeners.add(this.changed) }
  private changed = (): void => { if (!this.closed) { this.reconcile(); this.repaint() } }
  invalidate(source: boolean, appearance: boolean): void {
    this.epoch++; if (source) this.sourceEpoch++; if (appearance) this.appearanceEpoch++
    this.latched = false; this.acknowledging = false; this.acknowledgedAt = this.presentedAt = null
    for (const frame of this.paintFrames) this.paintClock.cancelFrame(frame); this.paintFrames.clear()
    this.stop(); this.episodes.clear(); this.packs.setNeeds([])
  }
  setActive(active: boolean): void { if (active === this.active) return; this.active = active; this.reconcile(); this.repaint() }
  setCandidates(candidates: ActionCandidate[]): void { this.candidates = candidates; this.reconcile() }
  onSettled(listener: () => void): void { this.settledListener = listener }
  settled(key: string, token: string): boolean {
    const episode = this.episodes.get(key)
    return episode ? episode.candidate.token === token && episode.terminal && episode.announced : this.used.consumed(key, token)
  }
  /** Called only after the complete own-static current-look surface is attached to the DOM. */
  commitStatic(): void {
    if (this.closed || this.latched || this.acknowledging) return
    const epoch = this.epoch; this.acknowledging = true; this.paintEpoch++
    this.presentedAt = performance.timeOrigin + performance.now()
    const schedule = (done: () => void): void => { let id = 0; id = this.paintClock.frame(() => { this.paintFrames.delete(id); if (!this.closed && this.epoch === epoch) done() }); this.paintFrames.add(id) }
    schedule(() => schedule(() => { this.acknowledging = false; this.latched = true; this.acknowledgedAt = performance.timeOrigin + performance.now(); this.reconcile(); this.repaint() }))
  }
  private reconcile(): void {
    if (this.closed) return
    const eligible = this.active && this.latched ? this.candidates : [], next = new Map(eligible.map(actor => [actor.key,actor]))
    for (const [key,episode] of this.episodes) if (next.get(key)?.token !== episode.candidate.token) this.episodes.delete(key)
    const needs = eligible.filter(actor => this.episodes.has(actor.key) || this.used.canPlay(actor.key,actor.token))
    this.demandEpoch++; this.packs.setNeeds(needs.length ? ['tuft'] : [])
    const resident = this.packs.resident('tuft')
    if (resident) for (const candidate of needs) if (!this.episodes.has(candidate.key) && this.used.canPlay(candidate.key,candidate.token)) {
      this.used.remember(candidate.key,candidate.token); const first = canonicalFrame(candidate.binding.action,0)
      this.episodes.set(candidate.key,{ candidate,started: this.actionClock.now(),sourceIndex: first.index,sourceKey: stageAt(resident.data,first.index)?.source ?? 'stand',terminal: false,announced: false,output: null })
    }
    if ([...this.episodes.values()].some(episode => !episode.terminal)) this.schedule(); else this.stop()
  }
  private schedule(): void { if (this.animation === null) this.animation = this.actionClock.frame(() => { this.animation = null; this.repaint(); if ([...this.episodes.values()].some(episode => !episode.terminal)) this.schedule() }) }
  private stop(): void { if (this.animation !== null) this.actionClock.cancelFrame(this.animation); this.animation = null }
  private tick(): void {
    const data = this.packs.resident('tuft')?.data; if (!data) return
    for (const episode of this.episodes.values()) { const frame = canonicalFrame(episode.candidate.binding.action,this.actionClock.now()-episode.started); episode.sourceIndex = frame.index; episode.sourceKey = stageAt(data,frame.index)?.source ?? 'stand'; episode.terminal = frame.terminal }
  }
  draw(ctx: CanvasRenderingContext2D, key: string): boolean {
    const episode = this.episodes.get(key), resident = this.packs.resident('tuft'); if (!episode || !resident || !this.active || !this.latched) return false
    this.tick(); const stage = stageAt(resident.data,episode.sourceIndex); if (!stage) return false
    const source = stage.source === 'stand' ? this.original() : resident.sources.get(stage.source); if (!source) return false
    const output = 'action:tuft:'+resident.version+':'+actionCompositionKey(resident.data,stage)
    const composition = this.cache.get(output) ?? this.cache.put(output,composeAction(resident.data,stage,source,resident.objects),source.width,source.height,'tuft'); if (!composition) return false
    episode.output = output
    if ([...this.episodes.values()].every(e => e.terminal)) this.stop()
    const { foot,scale } = episode.candidate
    ctx.drawImage(composition.canvas,foot.x+(stage.origin[0]!-231)*scale,foot.y+(stage.origin[1]!-255)*scale,source.width*scale,source.height*scale)
    if (episode.terminal && !episode.announced) { episode.announced = true; this.settledListener() }
    return true
  }
  /** A bound action can change frame during a walk. Reserve every source
   * canvas at its displayed origin, or refuse movement until metadata exists. */
  collisionBounds(): { x: number; y: number; width: number; height: number } | null {
    const data = this.packs.resident('tuft')?.data
    if (!data || !data.stages.length) return null
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const stage of data.stages) {
      const source = stage.source === 'stand' ? { width: 128, height: 128 } : data.sources[stage.source]
      if (!source || ![...stage.origin, source.width, source.height].every(Number.isFinite)) return null
      const x = stage.origin[0]! - 231, y = stage.origin[1]! - 255
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + source.width); bottom = Math.max(bottom, y + source.height)
    }
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  evidence(key: string): { sourceIndex: number; sourceKey: string; sourceSHA256: string; sourceOrigin: number[]; sourcePixels: Uint8Array; sourceWidth: number; sourceHeight: number; pixels: Uint8Array; width: number; height: number; canvas: HTMLCanvasElement; binding: ActionBinding; scale: number; foot: Point } | null {
    const episode = this.episodes.get(key), resident = this.packs.resident('tuft'), composition: Composition | null = episode?.output ? this.cache.peek(episode.output) : null
    if (!episode || !resident || !composition) return null
    const stage = stageAt(resident.data,episode.sourceIndex), source = stage?.source === 'stand' ? this.original() : resident.sources.get(stage?.source ?? '')
    if (!stage || !source) return null
    return { sourceIndex: episode.sourceIndex,sourceKey:stage.source,sourceSHA256:resident.data.sources[stage.source]?.sha256 ?? 'c52327072d44c1d6dfd3e93894821b84ddafca62ee21ff1128314fec91b3cdf1',sourceOrigin:stage.origin.slice(),sourcePixels:source.data,sourceWidth:source.width,sourceHeight:source.height,pixels:composition.pixels,width:composition.width,height:composition.height,canvas:composition.canvas,binding:{...episode.candidate.binding},scale:episode.candidate.scale,foot:{...episode.candidate.foot} }
  }
  snapshot() { return { latched: this.latched,paintEpoch:this.paintEpoch,sourceEpoch:this.sourceEpoch,appearanceEpoch:this.appearanceEpoch,demandEpoch:this.demandEpoch,presentedAt:this.presentedAt,acknowledgedAt:this.acknowledgedAt,intentLedger:this.used.snapshot(),owner:decodeOwner.snapshot(),...this.packs.snapshot(),cache:this.cache.snapshot(),actors:Object.fromEntries([...this.episodes].map(([key,e]) => [key,{sourceIndex:e.sourceIndex,sourceKey:e.sourceKey,episodeToken:e.candidate.token,terminal:e.terminal,ready:!!this.packs.resident('tuft')}])) } }
  dispose(): void { this.invalidate(false,false); this.closed = true; listeners.delete(this.changed); this.candidates = [] }
}
