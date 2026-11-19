// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { decodeOwner, type DecodeOwner, type Compositions } from './action-resources.ts'
import { readActionImage, pixelHash } from './action-pixels.ts'
import { decodeLookPng, type NativePixels } from './look-png.ts'
import { inlineLookMask } from './look-native.ts'
import { ActionTransportError, type ActionData } from './action-data.ts'
export interface ActionRegistryEntry { version: string; load: () => Promise<ActionData> }
export interface ResidentActions { identity: string; version: string; data: ActionData; sources: Map<string, NativePixels>; masks: Map<string, NativePixels>; objects: Map<string, NativePixels>; bytes: number }
interface Slot extends ResidentActions { epoch: number; status: 'loading' | 'ready'; abort: AbortController; task: Promise<void> | null }
interface Attempt { count: number; failures: number; failed: boolean; retryUsed: boolean; at: number; need: number; permanent: boolean }
export class InvalidActions extends Error {}
export const ACTION_SOURCE_BYTES = 768 * 1024
const bodies = ['r1','c1','p2','seated','p1','c2','c4']
const validActionURL = (url: unknown): boolean => {
  if (typeof url !== 'string' || !url || /[\u0000-\u0020\u007f]/.test(url)) return false
  try { if (/[\u0000-\u001f\u007f]/.test(decodeURI(url))) return false; return ['http:','https:'].includes(new URL(url,'https://action.invalid/').protocol) } catch { return false }
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)])) : value
/** Bind every source, mask, object and transform; emitted body URLs alone are build dependent. */
export const actionSourceVersion = (data: ActionData): string => pixelHash(new TextEncoder().encode(JSON.stringify(canonical({ ...data, sources: Object.fromEntries(Object.entries(data.sources).map(([key, { url: _url, ...source }]) => [key, source])) }))))
function validData(data: ActionData, identity: string, version: string): void {
  if (data.identity !== identity || data.version !== 1 || data.fps !== 30 || data.frames !== 264 || JSON.stringify(data.cuts) !== '[84,120]' || data.recolourApproved !== false || Object.keys(data.sources).sort().join(',') !== bodies.slice().sort().join(',') || Object.keys(data.objects).sort().join(',') !== 'book,paper,pin' || data.stages.length !== 14 || actionSourceVersion(data) !== version) throw new InvalidActions('Action metadata unavailable')
  let next = 0
  for (const stage of data.stages) { if (stage.first !== next || stage.last < stage.first || ![...bodies,'stand'].includes(stage.source) || stage.origin.length !== 2) throw new InvalidActions('Action timeline differs'); next = stage.last + 1 }
  if (next !== 264) throw new InvalidActions('Incomplete action timeline')
  for (const [name, source] of Object.entries(data.sources)) if (source.width !== (name === 'r1' ? 160 : 128) || source.height !== 128 || !/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-f0-9]{64}$/.test(source.rgbaSHA256) || !validActionURL(source.url)) throw new InvalidActions('Action source dimensions/hash/URL differ')
}
function metadataBytes(value: unknown, seen = new Set<object>()): number {
  if (value && typeof value === 'object') { if (seen.has(value)) return 8; seen.add(value) }
  if (typeof value === 'string') return value.length * 2 + 32
  if (typeof value === 'number' || typeof value === 'boolean') return 8
  if (Array.isArray(value)) return 32 + value.reduce((sum, child) => sum + 8 + metadataBytes(child, seen), 0)
  if (value && typeof value === 'object') return 32 + Object.entries(value).reduce((sum, [key, child]) => sum + key.length * 2 + 16 + metadataBytes(child, seen), 0)
  return 8
}
/** Two slots include pending reads; nonabortable work retains its reservation until settled. */
export class ActionPacks {
  private slots = new Map<string, Slot>()
  private needs = new Set<string>()
  private needNumber = new Map<string, number>()
  private needTime = new Map<string, number>()
  private attempts = new Map<string, Attempt>()
  private persistent = new Map<unknown, number>()
  private epoch = 0
  private closed = false
  constructor(private registry: ReadonlyMap<string, ActionRegistryEntry>, private cache: Compositions, private changed: () => void,
    private owner: DecodeOwner = decodeOwner, private read: typeof readActionImage = readActionImage, private now: () => number = () => Date.now()) {}
  private key(identity: string): string | null { const entry = this.registry.get(identity); return entry ? identity + ':' + entry.version : null }
  setNeeds(identities: Iterable<string>): void {
    if (this.closed) return
    const next = new Set([...identities].flatMap(identity => { const key = this.key(identity); return key ? [key] : [] }))
    for (const key of next) if (!this.needs.has(key)) { this.needNumber.set(key, (this.needNumber.get(key) ?? 0) + 1); this.needTime.set(key, this.now()) }
    this.needs = next
    for (const [key, slot] of this.slots) if (!next.has(key)) { slot.epoch++; slot.abort.abort(); if (slot.status === 'ready') this.drop(key, slot) }
    this.pump()
  }
  private drop(key: string, slot: Slot): void {
    if (this.slots.get(key) !== slot) return
    this.slots.delete(key); this.cache.dropIdentity(slot.identity); slot.sources.clear(); slot.masks.clear(); slot.objects.clear(); slot.bytes = 0
  }
  private pump(): void {
    if (this.closed) return
    for (const key of this.needs) {
      if (this.slots.has(key)) continue
      if (this.slots.size >= 2) break
      const identity = [...this.registry.keys()].find(value => this.key(value) === key), entry = identity && this.registry.get(identity)
      if (!identity || !entry) continue
      const previous = this.attempts.get(key), need = this.needNumber.get(key) ?? 0
      if (previous && (previous.permanent || previous.failed && (previous.retryUsed || need <= previous.need || (this.needTime.get(key) ?? 0) - previous.at < 1000))) continue
      const attempt = { count: (previous?.count ?? 0) + 1, failures: previous?.failures ?? 0, failed: previous?.failed ?? false, retryUsed: !!previous && (previous.retryUsed || previous.failed), at: this.now(), need, permanent: false }; this.attempts.set(key, attempt)
      const slot: Slot = { identity, version: entry.version, data: null as unknown as ActionData, sources: new Map(), masks: new Map(), objects: new Map(), bytes: 0, epoch: ++this.epoch, status: 'loading', abort: new AbortController(), task: null }
      this.slots.set(key, slot)
      const epoch = slot.epoch, alive = (): boolean => !this.closed && this.slots.get(key) === slot && slot.epoch === epoch && this.needs.has(key) && !slot.abort.signal.aborted
      slot.task = this.load(slot, entry, alive).then(() => { if (alive()) { attempt.failed = false; slot.status = 'ready'; this.changed() } }).catch(error => { if (alive()) { attempt.failed = true; attempt.failures++; if (!(error instanceof ActionTransportError)) attempt.permanent = true } }).finally(() => {
        slot.task = null
        if (slot.status !== 'ready' || !alive()) { this.drop(key, slot); this.changed() }
        this.pump()
      })
    }
  }
  private async load(slot: Slot, entry: ActionRegistryEntry, alive: () => boolean): Promise<void> {
    const check = (): void => { if (!alive()) throw Error('Action load superseded') }
    const data = await entry.load(); this.persistent.set(data, metadataBytes(data)); check(); validData(data, slot.identity, entry.version)
    slot.data = data
    const retain = (target: Map<string, NativePixels>, name: string, pixels: NativePixels): void => {
      if (slot.bytes + pixels.data.byteLength > ACTION_SOURCE_BYTES) throw new InvalidActions('Action pack exceeds decoded target')
      slot.bytes += pixels.data.byteLength; target.set(name, pixels)
    }
    for (const [name, source] of Object.entries(data.sources)) {
      const pixels = await this.owner.run('action image', () => this.read(source.url, source.width, source.height, slot.abort.signal, alive), slot.abort.signal); check()
      if (pixels.width !== source.width || pixels.height !== source.height || pixels.channels !== 4 || pixels.data.byteLength !== source.width * source.height * 4 || pixelHash(pixels.data) !== source.rgbaSHA256) throw new InvalidActions('Action source pixels differ')
      retain(slot.sources, name, pixels)
      const bytes = await inlineLookMask(source.mask, slot.abort.signal); check()
      if (bytes.length < 24) throw new InvalidActions('Action mask unavailable')
      const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      if (header.getUint32(16) !== source.width || header.getUint32(20) !== source.height) throw new InvalidActions('Action mask dimensions differ')
      let mask: NativePixels
      try { mask = await this.owner.run('action mask', () => decodeLookPng(bytes), slot.abort.signal); check() } catch (error) { check(); throw new InvalidActions(String(error)) }
      if (mask.channels !== 1 || mask.width !== source.width || mask.height !== source.height || mask.data.some(value => value !== 0 && value !== 255)) throw new InvalidActions('Action mask differs')
      retain(slot.masks, name, mask)
    }
    for (const [name, object] of Object.entries(data.objects)) {
      const bytes = await inlineLookMask(object.url, slot.abort.signal); check()
      if (pixelHash(bytes) !== object.sha256 || object.width > 160 || object.height > 128) throw new InvalidActions('Action object differs')
      const pixels = await this.owner.run('action object', () => this.read(object.url, object.width, object.height, slot.abort.signal, alive), slot.abort.signal); check()
      if (pixels.channels !== 4 || pixels.width !== object.width || pixels.height !== object.height || pixels.data.byteLength !== object.width * object.height * 4) throw new InvalidActions('Action object dimensions differ')
      retain(slot.objects, name, pixels)
    }
    check()
  }
  resident(identity: string): ResidentActions | null { const key = this.key(identity), slot = key && this.slots.get(key); return slot && slot.status === 'ready' ? slot : null }
  snapshot(): { slots: { identity: string; version: string; status: string; decodedBytes: number; epoch: number }[]; persistentMetadataBytes: number; attempts: { key: string; count: number; permanent: boolean }[] } {
    return { slots: [...this.slots.values()].map(slot => ({ identity: slot.identity, version: slot.version, status: slot.status, decodedBytes: slot.bytes, epoch: slot.epoch })), persistentMetadataBytes: [...this.persistent.values()].reduce((sum, bytes) => sum + bytes, 0), attempts: [...this.attempts].map(([key, value]) => ({ key, count: value.count, permanent: value.permanent })) }
  }
  dispose(): void { this.setNeeds([]); this.closed = true; for (const slot of this.slots.values()) { slot.epoch++; slot.abort.abort() }; for (const [key, slot] of this.slots) if (slot.status === 'ready') this.drop(key, slot) }
}
