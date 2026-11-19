// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH WORLD THIS PAGE IS POINTED AT, AND THE TRIP IT IS ON.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C7 of design/messages/ACCEPTANCE.md section 8: a page can be pointed at another world and
 * can come back.
 *
 * Three things live here and nothing else does: where this page's requests go, the visit it holds,
 * and how a component hears that either has changed.
 *
 * ---------------------------------------------------------------------------------------
 * IT SURVIVES A RELOAD, AND WHY THAT IS `localStorage`
 * ---------------------------------------------------------------------------------------
 *
 * The criterion asks for it: *the visit survives a reload and is visible at the office.* A module
 * variable would end the visit the moment somebody pressed reload, and the office would still hold
 * a visit nobody was on. Every read and every write is wrapped, because a private window and a
 * browser told to block site data both throw here, and a page that cannot remember a visit is a page
 * at home — which is the safe answer and not a broken one.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE IS ALWAYS SOMEWHERE, AND SAYS WHICH
 * ---------------------------------------------------------------------------------------
 *
 * A page holding no visit talks to its own origin, exactly as it always has: `whereRequestsGo`
 * hands back the path unchanged. A page holding one talks to the address that world answers on, and
 * the strip at the top of the screen says so the whole time it is away.
 */

/** Where the visit this page is on is kept. */
export const VISIT_KEY = 'mole-office.visiting'

/** What this page remembers about a trip it is on. */
import { theApiUrlFor } from './api-address.ts'

export interface Visiting {
  /** The office id of the world being visited. */
  worldId: string
  /** The name a person reads for it, so the strip can say where they are without another request. */
  worldName: string
  /** The database identity of that world, which is what a reply's world header carries. */
  databaseIdentity: string
  /** Where that world answers, with no trailing slash. Every request is sent there. */
  address: string
  /** The commit that world was serving when the visit began, or null because it did not say. */
  head: string | null
  /** The office id of the visit itself. */
  visitId: string
  /**
   * The project this page was reading at home, so coming home puts it back.
   *
   * A PROJECT IS A THING IN ONE DATABASE. Entering another world takes the page to that world's
   * default project, because the one it was reading is a row in the world it left. Coming home has to undo
   * exactly that, or a trip would quietly change which project they read when they get back.
   *
   * Absent on a trip written before this existed, and then coming home leaves the project alone,
   * which is what those pages already do.
   */
  workspaceAtHome?: string
}

let held: Visiting | null | undefined
const listeners = new Set<() => void>()

/** The trip this page is on, or null because it is at home. */
export function theVisitThisPageHolds(): Visiting | null {
  if (held !== undefined) return held
  held = readIt()
  return held
}

function readIt(): Visiting | null {
  try {
    const said = window.localStorage.getItem(VISIT_KEY)
    if (said === null) return null
    const parsed: unknown = JSON.parse(said)
    if (typeof parsed !== 'object' || parsed === null) return null
    const one = parsed as Partial<Visiting>
    if (typeof one.worldId !== 'string' || typeof one.address !== 'string' || typeof one.visitId !== 'string') {
      return null
    }
    return {
      worldId: one.worldId,
      worldName: typeof one.worldName === 'string' ? one.worldName : one.worldId,
      databaseIdentity: typeof one.databaseIdentity === 'string' ? one.databaseIdentity : '',
      address: one.address,
      head: typeof one.head === 'string' ? one.head : null,
      visitId: one.visitId,
      // THE PROJECT THE PERSON WAS READING AT HOME HAS TO SURVIVE THE RELOAD, which is the only way a real
      // page ever reads a trip: Enter writes the trip and reloads, so every later reader comes
      // through here. The first version of this rebuilt the trip field by field and dropped it, and
      // coming home then left them in the visited world's project. Measured in a browser: the trip
      // ended, the strip went, and `mole-office.workspace` stayed `default`. A test that held the
      // trip in memory passed over it, because no real page ever does.
      ...(typeof one.workspaceAtHome === 'string' ? { workspaceAtHome: one.workspaceAtHome } : {}),
    }
  } catch {
    // Catching to the letter of invariant 4: what is handled here is "this browser will not let this
    // page read its own storage, or what is in there is not a trip this version can read". The
    // answer is null, which means the page is at home — true either way, and never a half-read trip.
    return null
  }
}

/** Say this page is visiting a world, and tell every component that draws the strip. */
export function thisPageIsVisiting(one: Visiting): void {
  held = one
  try {
    window.localStorage.setItem(VISIT_KEY, JSON.stringify(one))
  } catch {
    // The trip still holds for this page's life; it will not survive a reload. Nothing is hidden:
    // the strip is drawn from the same value either way.
  }
  announce()
}

/** Say this page has come home. */
export function thisPageIsHome(): void {
  held = null
  try {
    window.localStorage.removeItem(VISIT_KEY)
  } catch {
    // Nothing to do and nothing to hide: a page that cannot write its storage never wrote this.
  }
  announce()
}

/** Hear when the trip changes. The shape `useSyncExternalStore` asks for. */
export function subscribeToTheVisit(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function announce(): void {
  for (const listener of listeners) listener()
}

/** Forget the trip without ending it, so a test can start from a page that is at home. */
export function forgetTheVisitOnThisPage(): void {
  held = undefined
  try {
    window.localStorage.removeItem(VISIT_KEY)
  } catch {
    // The same fault and the same answer as everywhere else in this file.
  }
}

/**
 * WHERE ONE REQUEST GOES: this page's own API, or the world it is visiting.
 *
 * A page at home sends the path to the API of the machine that served the page.
 * `src/web/lib/api-address.ts` works that address out — the host from this page's own address bar,
 * the port the page was told. A page on a trip sends the same path to the address that world
 * answers on.
 *
 * A PAGE AT HOME USED TO HAND THE PATH BACK UNCHANGED, and that was right while the API was always
 * the page's own origin. It stopped being right when the browser app began to be served on a second
 * address for other machines: in `npm run dev` a bare path goes to Vite, which proxied it to
 * loopback, and the API then saw every browser call arrive from this computer whichever machine the
 * browser was really on. So a browser opened from another machine was never named as one, and was
 * given the authority of a caller on this machine. Problem `MqQjiJIdjK4a`, and
 * `src/web/lib/api-address.ts` has the whole account.
 *
 * IT NEVER TOUCHES A PATH THAT IS ALREADY WHOLE. Nothing in this app sends one today; if something
 * ever does, prefixing it would produce an address that is two addresses.
 */
export function whereRequestsGo(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path
  const trip = theVisitThisPageHolds()
  if (trip === null) return theApiUrlFor(path)
  return `${trip.address.replace(/\/+$/, '')}${path}`
}
