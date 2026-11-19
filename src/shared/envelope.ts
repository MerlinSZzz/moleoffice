// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE HIERARCHICAL EFFORT ARITHMETIC. A PARENT'S TIME IS AN ENVELOPE, NOT A SUM.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A parent's time is an envelope; a child's time is its breakdown, never an addition.
 *
 * And, about the second number this file publishes:
 *
 * Capacity arithmetic that can be trusted does not pretend 18 fits inside 15 only to keep the
 * envelope: what is shown and the truthful effective minimum stay apart where they must.
 *
 * Both are from `design/ROUND-SEVEN-OWNER-MESSAGE.md`, and the second is why `shown` and `atLeast`
 * are two fields rather than one. `shown` is what a screen prints. `atLeast` is what capacity
 * arithmetic reads. A surface that offers `shown` to a capacity question is wrong.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The Plan page footer said 44h where the Schedule, over the same nesting, said 12h. The Schedule
 * understands containment for ALLOCATED hours — `envelopesOf` in ./planning.ts — and nothing
 * understood it for ESTIMATES. Four places added `effort_hours` row by row, so a piece of work and
 * a part of that same work were both counted.
 *
 * This is the only place effort is added over a tree. A test deleted on 13 November 2026 walked `src/` and
 * failed when a second one appeared.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * It is not `envelopesOf` in ./planning.ts and does not replace it. That one answers about
 * ALLOCATED hours in ONE PERIOD — how much time this week gives a piece of work. This one answers
 * about the ESTIMATE — how big the whole job is, with no period in the question at all. The two
 * quantities are different facts and are never added together, which ./planning.ts argues at
 * `PLAN_HOURS_BY_KIND`. The shapes are deliberately alike because the arithmetic is the same
 * arithmetic, and a reader who knows one can read the other.
 *
 * It does not read containment. The caller says who the parent is. Containment lives in
 * ./containment.ts and it needs records and links, which a caller has and this file must not go
 * looking for — this module is pure, has no database, makes no request, and runs in a browser.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENT IS ABSENT
 * ---------------------------------------------------------------------------------------
 *
 * Nobody having sized a piece of work is not the same fact as it taking no time. Every hours field
 * here is `number | null`, null means nobody said, and null never enters a sum as zero. A leaf
 * nobody sized has `shown: null`, and `total` over a set where nobody said anything is null.
 */

import { MAX_CONTAINMENT_DEPTH } from './containment.ts'

// ============================================================================ what goes in

/**
 * One thing that can hold an estimate, and what holds it.
 *
 * DELIBERATELY NOT A RECORD. The plan table has rows, the plan review has work rows, the draft
 * context has records of seven kinds, and none of the three is the same shape. All three can say
 * "this id, under that id, this many hours", which is everything this arithmetic needs.
 */
export interface EffortItem {
  /** The identity. Two items with the same id is a mistake, and it is reported below. */
  id: string
  /**
   * What holds this item, or null when nothing does.
   *
   * A parent id naming something that is not in the set makes this item a ROOT, and the set says
   * how many were left standing that way. That is the honest reading: this arithmetic can only
   * refuse to add a child to a parent it can see.
   */
  parentId?: string | null
  /**
   * What somebody explicitly said this item takes, in hours, or null when nobody has said.
   *
   * NEVER ZERO FOR UNKNOWN. Zero is a real answer — somebody looked and said it takes no time.
   */
  ownHours?: number | null
}

// ============================================================================ what comes out

/** One item's arithmetic, all six numbers, each null when there is nothing to say. */
export interface EffortReading {
  id: string
  /** The parent this arithmetic used, after orphans and loops were dealt with. */
  parentId: string | null
  /** The items directly inside this one, in the order they were handed in. */
  childIds: readonly string[]
  /** How deep it sits. A root is 0. */
  depth: number
  /** What somebody explicitly said. Null when nobody has said. */
  own: number | null
  /**
   * The sum of the children's `shown` values, or null when no child has one.
   *
   * NULL RATHER THAN ZERO, and the difference matters: zero would mean the parts add to nothing,
   * and null means nobody has broken this down. A leaf is always null here.
   */
  breakdown: number | null
  /** `own` when there is one, else `breakdown`, else null. This is what a screen prints. */
  shown: number | null
  /**
   * `own − breakdown`, when `own` is present and larger. Null otherwise.
   *
   * ALSO NULL WHEN `breakdown` IS NULL. Nobody has broken it down, so there is no breakdown to
   * subtract, and answering `own` here would be this file claiming the parts add to zero. A caller
   * wanting "none of it is broken down" reads `own` with an empty `childIds`.
   */
  notBrokenDown: number | null
  /** `breakdown − own`, when `breakdown` is larger. Null otherwise. This is the red mark. */
  over: number | null
  /**
   * The honest floor: the larger of `own` and what is inside it. Null when neither is known.
   *
   * IT READS THE CHILDREN'S `atLeast`, NOT THEIR `shown`, so parts that exceed their parent three
   * levels down still reach the top. With one level of nesting the two readings are the same
   * number. This is the one place this file goes further than the table in `design/ROUND-SEVEN.md`,
   * which writes `atLeast` as `max(own, breakdown)`; a floor that stopped at the first level would
   * be a floor somebody could sink through, and the effective minimum has to be truthful.
   */
  atLeast: number | null
}

/** One thing the arithmetic could not read, and why, in words a person can act on. */
export interface EffortNotRead {
  /** The item it is about. */
  id: string
  why: string
}

/** What `effortOf` answers about a whole set. */
export interface EffortTotals {
  /** One reading per item that was counted, in the order the items were handed in. */
  items: readonly EffortReading[]
  byId: ReadonlyMap<string, EffortReading>
  /** Every item nothing in this set holds, in the order handed in. */
  rootIds: readonly string[]
  /**
   * THE TOTAL: the sum of `shown` over the roots only. Null when no root has one.
   *
   * A child is never added to its parent. This is the number the owner's rule is about.
   */
  total: number | null
  /** How many roots the total added. A root nobody sized is not one of them. */
  totalFrom: number
  /** How many roots there are altogether, so a reader can see what the total could not count. */
  roots: number
  /** The sum of `atLeast` over the roots only, for capacity arithmetic. Null when nothing is known. */
  atLeastTotal: number | null
  /**
   * Every own estimate added up with nesting ignored, or null when nobody stated one.
   *
   * NOT A TOTAL TO ACT ON, and it is here for one reason: so a surface can write the sentence that
   * explains the difference — "this comes to 15h where the rows themselves add up to 24h". That is
   * exactly what `rowHours` on a `Load` is for in ./planning.ts, and the Schedule already prints
   * the sentence. A screen that shows this as the plan's size is the defect this file was written
   * to remove.
   */
  ownHoursAdded: number | null
  /** How many items nobody has given an own estimate. */
  withoutOwn: number
  /** Items whose stated parent is not in this set. Each is counted as a root. */
  parentNotHere: readonly EffortNotRead[]
  /** Items whose parent link was refused because following it went round in a circle. */
  cyclesBroken: readonly EffortNotRead[]
  /** Items detached because the chain above them was deeper than this reader walks. */
  tooDeep: readonly EffortNotRead[]
  /** Ids handed in more than once. The first item with that id was counted; the rest were not. */
  idUsedTwice: readonly EffortNotRead[]
  /** Items whose own hours were not a real number, so they were read as nobody having said. */
  notANumber: readonly EffortNotRead[]
}

// ============================================================================ the arithmetic

/**
 * Two decimal places, because hours are written like `2.5` and floating point is not.
 *
 * The same discipline and the same reason as `round2` in ./planning.ts, which records the bug that
 * caused it: two allocations of 0.1 and 0.2 printed `0.30000000000000004` on a screen. It is
 * applied to sums, never to what somebody typed.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** A name to put in a sentence. The id, because this file is never handed a title. */
function nameOf(id: string): string {
  return `"${id}"`
}

/**
 * Read a whole set of items as one tree of envelopes.
 *
 * Pure. The same input always gives the same answer, and the order of the input decides only the
 * order of the output.
 */
export function effortOf(items: readonly EffortItem[]): EffortTotals {
  const idUsedTwice: EffortNotRead[] = []
  const notANumber: EffortNotRead[] = []
  const parentNotHere: EffortNotRead[] = []
  const cyclesBroken: EffortNotRead[] = []
  const tooDeep: EffortNotRead[] = []

  // ---------------------------------------------------------------- one item per id
  // THE FIRST ONE WINS, and the rest are named. Two items with one id cannot be told apart, and
  // picking the larger or adding them would both be this file inventing a fact. The same rule
  // ./deadlines.ts keeps when a caller names the same work twice.
  const own = new Map<string, number | null>()
  /** What the FIRST item with each id said it was part of. A repeat's answer is never read. */
  const saidPartOf = new Map<string, string | null>()
  const order: string[] = []
  for (const item of items) {
    if (own.has(item.id)) {
      idUsedTwice.push({
        id: item.id,
        why: `${nameOf(item.id)} was handed in more than once. The first one was counted and this one was not.`,
      })
      continue
    }
    const stated = item.ownHours ?? null
    if (stated !== null && !Number.isFinite(stated)) {
      notANumber.push({
        id: item.id,
        why: `${nameOf(item.id)} says its estimate is ${String(stated)}, which is not a number of hours. It is read as nobody having sized it.`,
      })
      own.set(item.id, null)
    } else {
      own.set(item.id, stated)
    }
    saidPartOf.set(item.id, item.parentId ?? null)
    order.push(item.id)
  }

  // ---------------------------------------------------------------- who holds what
  const parentOf = new Map<string, string>()
  for (const id of order) {
    const parent = saidPartOf.get(id) ?? null
    if (parent === null) continue
    if (parent === id) {
      cyclesBroken.push({
        id,
        why: `${nameOf(id)} says it is part of itself. The link was refused and it is counted on its own.`,
      })
      continue
    }
    if (!own.has(parent)) {
      parentNotHere.push({
        id,
        why: `${nameOf(id)} says it is part of ${nameOf(parent)}, which is not in this set. It is counted on its own.`,
      })
      continue
    }
    parentOf.set(id, parent)
  }

  // ---------------------------------------------------------------- break any circle
  // A LOOP IS BROKEN AND SAID, NEVER WALKED. Following one would hang the browser, and answering
  // nothing at all would lose every honest number in the set. So the link that closes the circle is
  // refused, the item it belonged to becomes a root, and `cyclesBroken` says which link went.
  const visiting = new Set<string>()
  const settled = new Set<string>()
  for (const id of order) {
    if (settled.has(id)) continue
    const path: string[] = []
    let at: string | undefined = id
    while (at !== undefined && !settled.has(at)) {
      visiting.add(at)
      path.push(at)
      const up: string | undefined = parentOf.get(at)
      if (up === undefined) break
      if (visiting.has(up)) {
        cyclesBroken.push({
          id: at,
          why:
            `Following what holds ${nameOf(at)} came back round to ${nameOf(up)}, so the two hold each ` +
            `other. That link was refused and ${nameOf(at)} is counted on its own.`,
        })
        parentOf.delete(at)
        break
      }
      at = up
    }
    for (const seen of path) {
      visiting.delete(seen)
      settled.add(seen)
    }
  }

  // ---------------------------------------------------------------- the forest, depth first
  // TWENTY LEVELS, the same cap and the same reason as `MAX_CONTAINMENT_DEPTH` in ./containment.ts:
  // a chain that deep is broken data rather than deep work. It is imported rather than typed out
  // again, so the two readers cannot come to disagree about how deep is too deep.
  const childrenOf = new Map<string, string[]>()
  for (const id of order) {
    const parent = parentOf.get(id)
    if (parent === undefined) continue
    const list = childrenOf.get(parent)
    if (list === undefined) childrenOf.set(parent, [id])
    else list.push(id)
  }

  const depthOf = new Map<string, number>()
  const byDepth: string[] = []
  const queue: string[] = order.filter((id) => !parentOf.has(id))
  for (const id of queue) depthOf.set(id, 0)
  for (let at = 0; at < queue.length; at += 1) {
    const id = queue[at] as string
    byDepth.push(id)
    const depth = depthOf.get(id) ?? 0
    for (const child of childrenOf.get(id) ?? []) {
      if (depth + 1 > MAX_CONTAINMENT_DEPTH) {
        tooDeep.push({
          id: child,
          why:
            `What holds ${nameOf(child)} is more than ${String(MAX_CONTAINMENT_DEPTH)} levels deep. This ` +
            `reader stops there, so the link above it was refused and it is counted on its own.`,
        })
        parentOf.delete(child)
        depthOf.set(child, 0)
      } else {
        depthOf.set(child, depth + 1)
      }
      queue.push(child)
    }
  }

  // ---------------------------------------------------------------- the six numbers, deepest first
  const readings = new Map<string, EffortReading>()
  for (let at = byDepth.length - 1; at >= 0; at -= 1) {
    const id = byDepth[at] as string
    const childIds = (childrenOf.get(id) ?? []).filter((child) => parentOf.get(child) === id)
    const inside = childIds.map((child) => readings.get(child)).filter((r): r is EffortReading => r !== undefined)

    const stated = own.get(id) ?? null

    // THE BREAKDOWN IS THE CHILDREN'S `shown`, which is each child's own estimate when it has one
    // and its own breakdown when it has not. That is the envelope rule applied one level down.
    const parts = inside.map((child) => child.shown).filter((h): h is number => h !== null)
    const breakdown = parts.length === 0 ? null : round2(parts.reduce((n, h) => n + h, 0))

    // The floor reads the children's floors, so an overflow deep down still reaches the top.
    const floors = inside.map((child) => child.atLeast).filter((h): h is number => h !== null)
    const insideFloor = floors.length === 0 ? null : round2(floors.reduce((n, h) => n + h, 0))

    const shown = stated ?? breakdown
    const atLeast =
      stated === null ? insideFloor : insideFloor === null ? stated : round2(Math.max(stated, insideFloor))

    readings.set(id, {
      id,
      parentId: parentOf.get(id) ?? null,
      childIds,
      depth: depthOf.get(id) ?? 0,
      own: stated,
      breakdown,
      shown,
      notBrokenDown:
        stated !== null && breakdown !== null && stated > breakdown ? round2(stated - breakdown) : null,
      over: stated !== null && breakdown !== null && breakdown > stated ? round2(breakdown - stated) : null,
      atLeast,
    })
  }

  // ---------------------------------------------------------------- the totals, over roots only
  const rootIds = order.filter((id) => !parentOf.has(id))
  const roots = rootIds.map((id) => readings.get(id)).filter((r): r is EffortReading => r !== undefined)

  const shownAtRoots = roots.map((root) => root.shown).filter((h): h is number => h !== null)
  const floorsAtRoots = roots.map((root) => root.atLeast).filter((h): h is number => h !== null)

  // Every own estimate added up with nesting ignored. See the field's own note: this exists to
  // explain the difference and never to stand in for the total. It is THE ONLY PLAIN SUM OF
  // ESTIMATES ANYWHERE UNDER src/, and a test deleted on 13 November 2026 kept it that way.
  const everyOwn = order.map((id) => own.get(id) ?? null).filter((h): h is number => h !== null)
  const ownHoursAdded = everyOwn.length === 0 ? null : round2(everyOwn.reduce((n, ownHours) => n + ownHours, 0))

  return {
    items: order.map((id) => readings.get(id)).filter((r): r is EffortReading => r !== undefined),
    byId: readings,
    rootIds,
    total: shownAtRoots.length === 0 ? null : round2(shownAtRoots.reduce((n, h) => n + h, 0)),
    totalFrom: shownAtRoots.length,
    roots: rootIds.length,
    atLeastTotal: floorsAtRoots.length === 0 ? null : round2(floorsAtRoots.reduce((n, h) => n + h, 0)),
    ownHoursAdded,
    withoutOwn: order.filter((id) => (own.get(id) ?? null) === null).length,
    parentNotHere,
    cyclesBroken,
    tooDeep,
    idUsedTwice,
    notANumber,
  }
}

/**
 * What this reading could not read, as one sentence, or null when it read everything.
 *
 * ONE WRITER, so a screen, a route note and an agent's context cannot describe the same five gaps
 * three different ways. A caller that wants the detail reads the five lists themselves.
 */
export function whatWasNotRead(totals: EffortTotals): string | null {
  const said: string[] = []
  const plural = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`
  if (totals.parentNotHere.length > 0) {
    // PRECISE ABOUT THE RISK. A child whose parent is simply absent is counted correctly on its
    // own. The danger is one level further out: if the absent parent is itself inside something
    // that IS here, then the same work is in the total twice.
    said.push(
      `${plural(totals.parentNotHere.length, 'item is', 'items are')} part of something that is not in this ` +
        `set, so ${totals.parentNotHere.length === 1 ? 'it is' : 'they are'} counted on their own. If what ` +
        `holds ${totals.parentNotHere.length === 1 ? 'it' : 'them'} is itself inside something that IS here, ` +
        `this total counts the same work twice`,
    )
  }
  if (totals.cyclesBroken.length > 0) {
    said.push(`${plural(totals.cyclesBroken.length, 'item says', 'items say')} they hold each other in a circle`)
  }
  if (totals.tooDeep.length > 0) {
    said.push(
      `${plural(totals.tooDeep.length, 'item sits', 'items sit')} more than ` +
        `${String(MAX_CONTAINMENT_DEPTH)} levels deep, which this reader will not walk`,
    )
  }
  if (totals.idUsedTwice.length > 0) {
    said.push(`${plural(totals.idUsedTwice.length, 'id was', 'ids were')} handed in more than once`)
  }
  if (totals.notANumber.length > 0) {
    said.push(`${plural(totals.notANumber.length, 'estimate is', 'estimates are')} not a number of hours`)
  }
  if (said.length === 0) return null
  return `${said.join('. ')}.`
}
