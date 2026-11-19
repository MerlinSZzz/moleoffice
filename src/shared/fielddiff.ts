// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READER THAT SAYS WHICH FIELDS DIFFER BETWEEN TWO VALUES, AND WHAT EACH ONE WENT FROM AND TO.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHY THERE MUST NOT BE A SECOND ONE
 * ---------------------------------------------------------------------------------------
 *
 * Two places in Mole Office ask "what is different between these two objects, named by field path":
 *
 *   THE CHANGE LOG on a record page, which reads one change row's stored old and new value and
 *   draws the keys that really moved instead of two walls of JSON.
 *
 *   THE REVISION LEDGER, which compares two stored revisions of a record and answers with the same
 *   list of field paths.
 *
 * They are the same question. Answering it in two files is the defect this codebase keeps
 * producing: the two would drift, and then a record's history and its ledger would disagree about
 * which field changed, with nothing failing. So the walk lives here, in `src/shared/`, which is the
 * one directory both the browser and the server may import.
 *
 * IT CAME FROM src/web/components/ChangeLog.tsx, where it was written first and where it still
 * has its only drawing code. That file now imports it and re-exports it, so nothing that used
 * `diffValues` had to change and there is still exactly one walk.
 *
 * ---------------------------------------------------------------------------------------
 * THE PATHS IT PRODUCES ARE THE PATHS THE CHANGE LOG STORES
 * ---------------------------------------------------------------------------------------
 *
 * `pathStep` below is the naming rule, and it is the same function `mergeData` in
 * src/server/lib/records.ts uses to name the paths it writes into `changes.field`. That is why it
 * lives here rather than there: a merge patch writing `data.extra["mm/s"]` and a comparison
 * reporting `data.extra.mm/s` would be two spellings of one path, and the ledger's agreement test
 * would report a difference that is only a difference in spelling.
 */

/**
 * Extend a JSON path by one key: `data` + `context` -> `data.context`.
 *
 * A key that is not a plain identifier is written in brackets — `data.extra["mm/s"]` — so that
 * a path in the change log can always be read back to exactly one key. Dotting it would make
 * `{"a.b": 1}` and `{"a": {"b": 1}}` produce the same path, and the change log is the record of
 * what happened; two different edits must not print the same.
 */
export function pathStep(prefix: string, key: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${prefix}[${JSON.stringify(key)}]`
  return prefix === '' ? key : `${prefix}.${key}`
}

/**
 * A path read back into the keys it is made of: `data.blocks[#b-1].text` -> data, blocks, b-1, text.
 *
 * IT IS HERE BECAUSE `pathStep` IS HERE. The grammar of a path is written by this file, in three
 * places — a dotted key, a bracketed key that is not a plain identifier, and `[#id]` for one entry
 * of an identified array, plus `[0]` from `partsInside` below. A reader of that grammar living in a
 * component would be a second place that knows it, and then a new bracket form would draw as
 * nonsense on one screen with nothing failing.
 *
 * A bracketed key is unquoted only when the quotes are the whole of it and nothing is escaped. Where
 * they are not, the step is the text between the brackets exactly as the path holds it — that is
 * still the truth about where the value sits, and there is no case where this guesses.
 */
export function stepsOfPath(path: string): string[] {
  const out: string[] = []
  let at = 0
  while (at < path.length) {
    if (path[at] === '.') {
      at += 1
      continue
    }
    if (path[at] === '[') {
      const end = closingBracket(path, at)
      if (end === -1) {
        out.push(path.slice(at))
        break
      }
      const inside = path.slice(at + 1, end)
      if (inside.startsWith('#')) out.push(inside.slice(1))
      else if (/^"[^"\\]*"$/.test(inside)) out.push(inside.slice(1, -1))
      else out.push(inside)
      at = end + 1
      continue
    }
    let next = at
    while (next < path.length && path[next] !== '.' && path[next] !== '[') next += 1
    out.push(path.slice(at, next))
    at = next
  }
  return out
}

/** Where the bracket opened at `at` closes, skipping any `]` inside a quoted key, or -1. */
function closingBracket(path: string, at: number): number {
  let i = at + 1
  let quoted = false
  while (i < path.length) {
    const ch = path[i]
    if (quoted) {
      if (ch === '\\') i += 1
      else if (ch === '"') quoted = false
    } else if (ch === '"') quoted = true
    else if (ch === ']') return i
    i += 1
  }
  return -1
}

/**
 * One key that differs between the two values.
 *
 * `before` and `after` are already printable: an object or an array is JSON, a string is itself,
 * and an absent key is null. NULL MEANS THE KEY WAS NOT THERE, which is a different fact from a key
 * whose value is the JSON `null`, and the row says which — `added` and `removed` are their own
 * words rather than an empty side of an arrow.
 */
export interface FieldDiff {
  /** The path from the changed field down to what moved, e.g. `parts[#p1].items[#i2].state`. */
  path: string
  before: string | null
  after: string | null
  kind: 'added' | 'removed' | 'changed'
}

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parse a stored change value, or null when it is not JSON at all. */
function parseValue(raw: string | null): { ok: boolean; value: unknown } {
  if (raw === null) return { ok: false, value: null }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, value: null }
  }
}

/** How a value is printed once it is known to have moved. Objects and arrays as their JSON. */
function printable(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value) ?? String(value)
}

/**
 * Every entry of an array, by its stored `id`, or null when the array is not that shape.
 *
 * Null rather than a partial answer: an array where only some entries carry an id cannot be
 * diffed by id without silently pairing the wrong two, and a wrong pairing reads as a change
 * somebody made.
 *
 * ---------------------------------------------------------------------------------------
 * AN ID THAT APPEARS TWICE IS NOT AN IDENTITY, SO THE ARRAY IS NOT WALKED BY ID
 * ---------------------------------------------------------------------------------------
 *
 * WHAT WENT WRONG. This used to write every entry into the map and keep the last one, so two
 * checklist items sharing one id collapsed to a single entry on BOTH sides. Every change to the
 * earlier twin then had nothing to compare against and vanished. Measured 18 August 2026: a
 * module whose `data.parts[0].items` held the id `twin` twice was edited, and
 * `GET /api/records/<id>/revisions/1/compare/2` answered `differences: []` with "Revisions 1 and 2
 * hold exactly the same content", while the two stored `data` strings plainly differed. The restore
 * of revision 1 then answered "Nothing moved" and really did move the record back.
 *
 * WHAT IS DONE NOW, AND WHY IT IS THE HONEST READING. The whole array is refused for pairing, so
 * the walk falls through to the leaf case and prints both arrays whole. Keying entries by an id
 * that repeats is a claim the data does not support: the id is supposed to be the thing that says
 * "this entry and that entry are the same entry", and once it appears twice it cannot say that.
 * Two arrays that differ are then reported as differing, which is the fact that matters, and the
 * reader sees both versions rather than a sentence about which line moved.
 *
 * THE TWO ALTERNATIVES AND WHY NEITHER IS TAKEN. Keeping the first entry, or the last, answers a
 * question nobody asked and hides the other one — that is the defect above, written deliberately.
 * Pairing the twins by position instead reads a reorder as a change to both lines, which is the
 * false report this by-id walk exists to prevent.
 *
 * THE DUPLICATE SHOULD NOT ARRIVE AT ALL, and as of the same day it cannot arrive through a write:
 * `validateData` in ./kinds/validation.ts refuses two objects of one shape in one record sharing an id. This
 * stays defensive anyway, because rows written before that rule existed are in the corpus and in
 * every archive, and because `data.extra` is a declared open bag that nothing checks inside.
 */
export function byId(value: unknown): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(value)) return null
  const out = new Map<string, Record<string, unknown>>()
  for (const entry of value) {
    if (!isPlainObject(entry)) return null
    const id = entry['id']
    if (typeof id !== 'string' || id.trim() === '') return null
    if (out.has(id)) return null
    out.set(id, entry)
  }
  return out
}

/**
 * How deep the walk goes before a value is printed whole.
 *
 * Six, because the deepest real case in this database is a module's
 * `parts[#p1].items[#i2].state` — object, array, object, array, object, leaf — and stopping one
 * level short of it prints the whole checklist item as JSON on both sides, which is the wall of
 * text this diff exists to remove. A limit rather than no limit: past this depth a path is longer
 * than the value it names.
 */
const DIFF_DEPTH = 6

/**
 * Compare two decoded values and report only what differs, deepest name first.
 *
 * The three rules, in order: two plain objects are compared key by key; two arrays whose every
 * entry carries an `id` are compared entry by entry, so an item that moved position is not reported
 * as two changes; anything else is one leaf, compared as JSON.
 */
function walk(before: unknown, after: unknown, path: string, depth: number, out: FieldDiff[]): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return

  if (depth < DIFF_DEPTH && isPlainObject(before) && isPlainObject(after)) {
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])]) {
      const next = pathStep(path, key)
      if (!(key in before)) {
        out.push({ path: next, before: null, after: printable(after[key]), kind: 'added' })
        continue
      }
      if (!(key in after)) {
        out.push({ path: next, before: printable(before[key]), after: null, kind: 'removed' })
        continue
      }
      walk(before[key], after[key], next, depth + 1, out)
    }
    return
  }

  const oldById = depth < DIFF_DEPTH ? byId(before) : null
  const newById = depth < DIFF_DEPTH ? byId(after) : null
  if (oldById !== null && newById !== null) {
    for (const id of [...new Set([...oldById.keys(), ...newById.keys()])]) {
      const next = `${path}[#${id}]`
      const was = oldById.get(id)
      const now = newById.get(id)
      if (was === undefined) {
        out.push({ path: next, before: null, after: printable(now), kind: 'added' })
        continue
      }
      if (now === undefined) {
        out.push({ path: next, before: printable(was), after: null, kind: 'removed' })
        continue
      }
      walk(was, now, next, depth + 1, out)
    }
    return
  }

  out.push({ path, before: printable(before), after: printable(after), kind: 'changed' })
}

/**
 * Every field path that differs between two DECODED values, with what each one went from and to.
 *
 * This is the entry point the revision ledger uses: it holds the two contents already decoded, so
 * there is nothing to parse. `diffValues` below is the same walk over two stored JSON strings, which
 * is what the change log holds. Both call `walk` and there is only one of it.
 *
 * An EMPTY ARRAY means the two really are the same. It is not the same answer as `diffValues`
 * returning null, which means "these two cannot be compared field by field, print them whole".
 */
export function fieldsThatDiffer(before: unknown, after: unknown): FieldDiff[] {
  const out: FieldDiff[] = []
  walk(before, after, '', 0, out)
  return out
}

/**
 * What really changed inside one change row's two values, or null when there is nothing to diff.
 *
 * NULL IS THE ORDINARY ANSWER for most rows: a title, a summary and a state are strings, and a
 * before-and-after of two strings is already the clearest thing to print. Null is returned when
 * either side is missing, when either side is not JSON, and when neither side is an object or an
 * array — in every one of those the caller prints the two values as it always has.
 *
 * An EMPTY ARRAY is a different answer again and is not null: the two objects were both read and
 * nothing in them differs. That happens, it is worth saying out loud, and it used to be drawn as
 * two identical walls of JSON with one of them crossed out.
 */
/** One thing a single value holds: where it sits inside that value, and what it says. */
export interface ValuePart {
  path: string
  text: string
}

/**
 * EVERYTHING ONE VALUE HOLDS, OPENED UP, so a value with no other side to compare against is still
 * readable.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT `diffValues` WITH AN EMPTY OBJECT ON THE OTHER SIDE
 * ---------------------------------------------------------------------------------------
 *
 * `diffValues` answers null the moment either side is missing, and that is right: a field that was
 * added has no earlier value to compare, so there is nothing to diff. The caller then printed the
 * value with JSON.stringify, and that is where the wall of braces on the version comparison came
 * from — 246 of them in one drawn view, measured 21 August 2026.
 *
 * Comparing against an empty object does not fix it either. The walk reports a key that is missing
 * from one side as ONE difference and prints its whole value, so a nested object comes back as JSON
 * again one level down.
 *
 * ---------------------------------------------------------------------------------------
 * IT WALKS AN ARRAY BY POSITION, WHICH THE COMPARISON REFUSES TO DO
 * ---------------------------------------------------------------------------------------
 *
 * `walk` above refuses to pair two arrays that are not identified by id, because pairing the wrong
 * two entries reports a change nobody made. THERE IS NOTHING TO PAIR HERE. One value is being read
 * out, not compared, so entry 0 is entry 0 and saying so invents nothing. That is why a table's
 * columns open up here and would not open up there.
 *
 * NULL means this is not something to open up — no value, not JSON, or a plain string or number,
 * all of which the caller draws as they are. An EMPTY LIST is a different answer: it is an empty
 * object or an empty array, which holds nothing, and the caller draws the value itself.
 */
export function partsInside(raw: string | null): ValuePart[] | null {
  if (raw === null) return null
  const parsed = parseValue(raw)
  if (!parsed.ok) return null
  if (!isPlainObject(parsed.value) && !Array.isArray(parsed.value)) return null
  const out: ValuePart[] = []
  openUp(parsed.value, '', 0, out)
  return out
}

/** One value, down to its leaves, named by the same rules `walk` names a difference by. */
function openUp(value: unknown, path: string, depth: number, out: ValuePart[]): void {
  if (depth < DIFF_DEPTH && isPlainObject(value)) {
    for (const key of Object.keys(value)) openUp(value[key], pathStep(path, key), depth + 1, out)
    return
  }
  if (depth < DIFF_DEPTH && Array.isArray(value)) {
    const identified = byId(value)
    if (identified !== null) {
      for (const [id, entry] of identified) openUp(entry, `${path}[#${id}]`, depth + 1, out)
      return
    }
    value.forEach((entry, at) => openUp(entry, `${path}[${String(at)}]`, depth + 1, out))
    return
  }
  out.push({ path, text: printable(value) })
}

export function diffValues(oldValue: string | null, newValue: string | null): FieldDiff[] | null {
  if (oldValue === null || newValue === null) return null
  const before = parseValue(oldValue)
  const after = parseValue(newValue)
  if (!before.ok || !after.ok) return null
  const structural = (v: unknown) => isPlainObject(v) || Array.isArray(v)
  if (!structural(before.value) && !structural(after.value)) return null
  return fieldsThatDiffer(before.value, after.value)
}
