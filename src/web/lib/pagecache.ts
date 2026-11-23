// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PAGE LAST SHOWED, KEPT SO THE NEXT OPEN SHOWS IT AT ONCE.
 *
 * Round 17 of wave 13w, on a decision, layer 2. Every page asked every door
 * again on every open and every reload, and drew "Reading…" until they answered. On the owner's
 * office a read takes two to five seconds, so every page was blank for that long, every time.
 *
 * WHAT THIS HOLDS. One answer per name (a page's read: "settings.roles", "record:<id>:view"), for
 * the person or agent this page writes as, in the project on screen. It is held in memory and copied
 * into the browser's IndexedDB, so it survives a reload.
 *
 * WHAT A PAGE DOES WITH IT. It draws the kept answer at once, marked "Refreshing…" (the re-read strip
 * in components/ui.tsx), asks the door again behind it, and replaces it with the answer. A kept answer
 * is never drawn as if it had just been read. The chat is the one reader that does not always ask
 * again: it asks only for the lists an event may have changed since it last read them (see `isFresh`).
 *
 * WHO IS LOOKING IS PART OF EVERY KEY. A page that changes who it writes as (the writer choice on the
 * Settings page, which is this office's only way of becoming somebody else; there is no sign-out
 * press) forgets everything, in memory and in IndexedDB, before the next read. An answer kept for one
 * actor is therefore never drawn for another. Loading also deletes whatever was kept for anyone else.
 *
 * A NEW SHAPE CLEARS IT. The version is `PAGE_CACHE_SHAPE` with the time of the code this page is
 * running (src/web/lib/served.ts), so a page built from changed code starts with nothing kept. That
 * time is read off `window`, where served.ts puts it, and not imported: served.ts reads a module only
 * Vite makes, and this file is reached by tests that run under plain Node (WrongWorld.tsx does the same).
 * A page with no stamp keeps answers in memory only, since it could not tell an old copy from a new one.
 *
 * NO INDEXEDDB, NO COPY. A browser that refuses IndexedDB (or a test with no browser) keeps answers in
 * memory only, for this load. That is said on the `<html>` element as `data-mole-office-page-cache`.
 */
import { getActor, subscribeActor } from '../api.ts'
import { currentWorkspace } from './workspace.ts'
import { whereRequestsGo } from './visiting.ts'

/** Raise this when the shape of a kept answer changes in a way the served time would not show. */
export const PAGE_CACHE_SHAPE = 1

const DB_NAME = 'mole-office-page-cache'
const STORE = 'answers'
/** How long after the last change the copy into IndexedDB is written. */
const WRITE_AFTER_MS = 400

interface Kept {
  value: unknown
  /** When it was read, by `Date.now()`. */
  at: number
}

interface OnDisk {
  key: string
  version: string
  who: string
  value: unknown
  at: number
}

/** Null when this page has no served-code stamp, and then nothing is copied to IndexedDB. */
function theVersion(): string | null {
  const stamp = typeof window === 'undefined' ? undefined : window.moleOfficeServedCode
  return stamp === undefined ? null : `${String(PAGE_CACHE_SHAPE)} ${stamp.servedAt}`
}

/** Who is looking: the actor this page writes as, and the office it asks. */
export function whoIsLooking(): string {
  const actor = getActor()
  return `${actor.type}:${actor.id}:${actor.sessionId ?? ''} ${whereRequestsGo('/')}`
}

/** Where one answer is kept: who is looking, in which project, under which name. */
export interface Place {
  who: string
  key: string
}

export function placeOf(name: string, workspace: string = currentWorkspace()): Place {
  const who = whoIsLooking()
  return { who, key: `${who}\n${workspace}\n${name}` }
}

const memory = new Map<string, Kept>()
/** The names read, or kept up to date by events, since this page loaded. Everything else is stale. */
const fresh = new Set<string>()
const toWrite = new Map<string, OnDisk>()
let writeTimer: ReturnType<typeof setTimeout> | null = null
let opened: Promise<IDBDatabase | null> | null = null

function say(state: string): void {
  if (typeof document !== 'undefined') document.documentElement.dataset['moleOfficePageCache'] = state
}

function open(): Promise<IDBDatabase | null> {
  if (opened !== null) return opened
  opened = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      say('memory only: this browser has no IndexedDB')
      resolve(null)
      return
    }
    if (theVersion() === null) {
      say('memory only: this page has no served-code stamp, so a kept copy could not be dated')
      resolve(null)
      return
    }
    let asked: IDBOpenDBRequest
    try {
      asked = indexedDB.open(DB_NAME, 1)
    } catch (err) {
      say(`memory only: ${err instanceof Error ? err.message : String(err)}`)
      resolve(null)
      return
    }
    asked.onupgradeneeded = () => {
      asked.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    asked.onsuccess = () => {
      say('kept')
      resolve(asked.result)
    }
    asked.onerror = () => {
      say(`memory only: ${asked.error?.message ?? 'IndexedDB refused to open'}`)
      resolve(null)
    }
  })
  return opened
}

/**
 * READ WHAT WAS KEPT, ONCE, BEFORE THE APP DRAWS (src/web/main.tsx waits for it, for a short while).
 * Whatever was kept under another version or for anyone other than who is looking is deleted. An
 * answer this page has already kept in memory is newer than the copy on disk and is left alone.
 */
export async function loadThePageCache(): Promise<void> {
  const db = await open()
  const version = theVersion()
  if (db === null || version === null) return
  const who = whoIsLooking()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const all = store.getAll()
    all.onsuccess = () => {
      for (const one of all.result as OnDisk[]) {
        if (one.version !== version || one.who !== who) {
          store.delete(one.key)
          continue
        }
        if (!memory.has(one.key)) memory.set(one.key, { value: one.value, at: one.at })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => {
      say(`memory only: ${tx.error?.message ?? 'reading the kept answers failed'}`)
      resolve()
    }
  })
}

/** The answer kept under this name, for who is looking now, in the project on screen. */
export function keptAnswer<T>(name: string, workspace?: string): { value: T; at: number } | undefined {
  const held = memory.get(placeOf(name, workspace).key)
  return held === undefined ? undefined : { value: held.value as T, at: held.at }
}

/** Every project this name is kept in for who is looking now, the most recently read first. */
export function keptInEveryProject<T>(name: string): { workspace: string; value: T; at: number }[] {
  const who = whoIsLooking()
  const found: { workspace: string; value: T; at: number }[] = []
  for (const [key, held] of memory) {
    if (!key.startsWith(`${who}\n`) || !key.endsWith(`\n${name}`)) continue
    found.push({ workspace: key.slice(who.length + 1, key.length - name.length - 1), value: held.value as T, at: held.at })
  }
  return found.sort((a, b) => b.at - a.at)
}

/**
 * KEEP AN ANSWER at the place worked out when its read STARTED. A read that started for somebody
 * else (the writer was changed while it was out) is not kept: it was read for them.
 */
export function keepAnswerAt(place: Place, name: string, value: unknown): void {
  void name
  if (place.who !== whoIsLooking()) return
  const at = Date.now()
  memory.set(place.key, { value, at })
  const version = theVersion()
  if (version === null) return
  toWrite.set(place.key, { key: place.key, version, who: place.who, value, at })
  if (writeTimer === null) writeTimer = setTimeout(writeOut, WRITE_AFTER_MS)
}

export function keepAnswer(name: string, value: unknown): void {
  keepAnswerAt(placeOf(name), name, value)
}

function writeOut(): void {
  writeTimer = null
  const batch = [...toWrite.values()]
  toWrite.clear()
  void open().then((db) => {
    if (db === null) return
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const one of batch) {
      // AN ANSWER THE BROWSER CANNOT COPY (one holding a function) is kept in memory only, and said.
      try {
        store.put(one)
      } catch (err) {
        console.warn(`Mole Office: the answer kept as "${one.key.split('\n')[2] ?? ''}" could not be copied for the next load: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  })
}

/**
 * WHETHER THIS NAME WAS READ IN THIS PAGE'S LIFE AND NO EVENT HAS SAID IT CHANGED SINCE. A name kept
 * from before a reload is never fresh: events were not heard while the page was closed.
 */
export function isFresh(name: string): boolean {
  return fresh.has(name)
}

/** Counts every stale mark, so a read can be told whether one came after it started. */
let clock = 0
const staleAt = new Map<string, number>()
/** When the read that made each answer started, on `clock`. */
const startedAt = new WeakMap<object, number>()

/**
 * MARK WHAT A READ ANSWERS WITH WHEN IT STARTED. `markFreshFrom` then calls a name fresh only when no
 * event marked it stale after that, so an answer read before a change is never called current.
 */
export function stamped<T>(read: Promise<T>): Promise<T> {
  const since = clock
  return read.then((value) => {
    if (typeof value === 'object' && value !== null && !startedAt.has(value)) startedAt.set(value, since)
    return value
  })
}

/** This name is current as of the read that answered `value`, unless an event came after it started. */
export function markFreshFrom(names: readonly string[], value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  const since = startedAt.get(value)
  if (since === undefined) return
  for (const one of names) if ((staleAt.get(one) ?? -1) <= since) fresh.add(one)
}

/** Mark these stale and say which of them were fresh until now. */
export function markStale(names: Iterable<string>): string[] {
  clock += 1
  const were: string[] = []
  for (const one of names) {
    staleAt.set(one, clock)
    if (fresh.delete(one)) were.push(one)
  }
  return were
}

/**
 * HOW MANY CHANGES THIS PAGE HAS MARKED SO FAR. A read begun at one count answers for every change
 * marked before it began, and for none marked after (src/web/lib/oneread.ts).
 */
export function changesMarked(): number {
  return clock
}

/** A reader that has just brought these up to date itself, from the event that marked them stale. */
export function markFresh(names: Iterable<string>): void {
  for (const one of names) fresh.add(one)
}

/** Events were lost: nothing read before is known to be current. */
export function nothingIsFresh(): void {
  clock += 1
  fresh.clear()
}

/**
 * FORGET EVERYTHING, in memory and in IndexedDB. Called when the page changes who it writes as, so
 * the next actor is never drawn the last one's answers, not even for a frame.
 */
export function forgetEverything(): void {
  memory.clear()
  clock += 1
  fresh.clear()
  toWrite.clear()
  if (writeTimer !== null) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  void open().then((db) => {
    if (db === null) return
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear()
  })
}

subscribeActor(forgetEverything)
