// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PARTIAL CHANGE IS MERGED INTO A RECORD'S DATA, and how its outcome is told back: `mergeData`, the
 * `DataEdit` and `DataPatchOutcome` shapes, the sentences `describeOutcome` and `plainOutcome` make, and
 * `aPatchThatReplaces`. They were moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
// HOW A JSON PATH IS NAMED. It sits in shared/ beside the walk that says which paths differ between
// two values, because the record page's change log and this server's revision ledger ask the same
// question, and two answers to one question is the defect this repository keeps producing.
import { pathStep } from '@shared/fielddiff.ts'
import { saveAnswerInEnglish } from '@shared/save-answer.ts'
import { fieldWords } from '@shared/work.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { PanelError } from '../panel-error.ts'

// `pathStep` — how a JSON path gains one key — is imported from @shared/fielddiff.ts and is not
// written out here. It was declared in src/server/lib/records.ts until 18 August 2026, and the comparison that
// reads a revision against the one before it needs exactly the same rule: a merge patch writing
// `data.extra["mm/s"]` into a change row and a comparison reporting `data.extra.mm/s` would be two
// spellings of one path, which is the same fact worked out in two places.

/** One leaf change a merge produced. Becomes exactly one row in the change log. */
export interface DataEdit {
  /** Where it happened, e.g. `data.summaryBlocks` or `data.numbers.trials`. */
  path: string
  /** What was there. `undefined` when the key did not exist. */
  before: unknown
  /** What is there now. `undefined` when the key was removed. */
  after: unknown
  /** True when the patch sent null and the key was deleted rather than set. */
  deleted: boolean
}

/**
 * What a merge patch actually did, in the caller's own paths. This goes back in the response:
 * a caller that cannot see the result of its write is the position the audit was written from.
 */
export interface DataPatchOutcome {
  /** Paths whose value is different now. */
  changed: string[]
  /** Paths whose key was REMOVED, because the patch sent null for it. */
  deleted: string[]
  /** Paths the patch named that already held exactly the value sent. Nothing was written. */
  unchanged: string[]
  /** Paths the patch asked to delete that were not there to begin with. Nothing was written. */
  alreadyAbsent: string[]
  /**
   * WHAT HAPPENED, IN THE WORDS A PERSON READS. No stored paths.
   *
   * This is printed straight onto the screen: the record page shows it under the box you just
   * typed in, and the graph editor shows it beside the field it saved. It used to be `detail`
   * below, and a person editing one field on a record read *"1 path changed: data.state."* — a
   * count of JSON paths, which is a true sentence about the database and not an answer to
   * "did my edit save".
   */
  note: string
  /**
   * THE SAME FOUR LISTS WITH THE EXACT PATHS, for an agent and for Developer mode.
   *
   * Built from the same four lists as `note`, in the same function, so the short answer cannot
   * come to say something the long one does not. This is the sentence `note` used to be.
   */
  detail: string
}

/** "a", "a and b", "a, b and c" — a list of things read out loud rather than printed. */
export function andList(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1] ?? ''}`
}

/**
 * WHAT A MERGE PATCH DID, IN THE WORDS A PERSON READS. Never a path, never a count of paths.
 *
 * `saveAnswer` in src/shared/save-answer.ts builds it from the four lists, and the record page
 * builds the same sentence there in the page's language. Here it is English, for agents, with each
 * field named by `fieldWords`. `describeOutcome` below is the same four lists with the exact paths
 * in them, so the two cannot come to disagree about what happened.
 */
export function plainOutcome(o: Omit<DataPatchOutcome, 'note' | 'detail'>): string {
  return saveAnswerInEnglish(o, fieldWords)
}

export function describeOutcome(o: Omit<DataPatchOutcome, 'note' | 'detail'>): string {
  const list = (paths: string[]) => paths.join(', ')
  const parts: string[] = []
  if (o.changed.length > 0) {
    parts.push(`${o.changed.length} path${o.changed.length === 1 ? '' : 's'} changed: ${list(o.changed)}`)
  }
  if (o.deleted.length > 0) {
    parts.push(
      `${o.deleted.length} key${o.deleted.length === 1 ? '' : 's'} deleted, not set to null — ` +
        `a null in dataPatch removes the key, and a null is never stored: ${list(o.deleted)}`,
    )
  }
  if (o.unchanged.length > 0) {
    parts.push(`${o.unchanged.length} already held the value sent: ${list(o.unchanged)}`)
  }
  if (o.alreadyAbsent.length > 0) {
    parts.push(
      `${o.alreadyAbsent.length} asked to be deleted but ${o.alreadyAbsent.length === 1 ? 'was' : 'were'} ` +
        `not there: ${list(o.alreadyAbsent)}`,
    )
  }
  if (parts.length === 0) return 'The patch named no keys, so nothing was written.'
  return `${parts.join('. ')}.`
}

/**
 * Merge `patch` into `current`, key by key, and say what that did.
 *
 * Pure: it reads nothing and writes nothing, which is why the tests can check the semantics
 * without a database.
 *
 * THE THREE RULES, and why each one is what it is:
 *
 *   - null DELETES the key. It does not store a null. A stored null is a value that every
 *     reader then has to have an opinion about, and there is no other way to remove a key from
 *     a merge patch — leaving it out means "do not touch it", which is the point of merging.
 *     Deleting is what makes it possible to fix the mis-keyed record the audit found without
 *     resending the whole thing.
 *
 *   - two objects merge, recursively. `{"numbers":{"trials":300}}` changes `trials` and leaves
 *     the other numbers alone.
 *
 *   - everything else replaces, including arrays. An array is NOT merged element by element:
 *     index-wise merging cannot shorten a list, and it corrupts a reordered one by writing
 *     element 2 over what is now a different element 2. A checklist that is one item shorter is
 *     a normal edit, so a merge that could not express it would push callers straight back to
 *     sending the whole record. To change one item in an array, send the array — or, for the one
 *     array this became intolerable on, use patchChecklistItem below, which addresses a checklist
 *     line by its id and reuses this function on the item alone.
 *
 * `prefix` is what the reported paths are built from. It is `data` for a patch on a record's
 * whole `data` bag, which is every caller but one: patchChecklistItem below merges into a single
 * checklist ITEM and passes the path of that item, so the change rows it writes say
 * `data.parts[#mount].items[#mount-1].state` rather than `data.state`. The merge rules do not
 * change with the prefix — only the names in the report do.
 */
export function mergeData(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  prefix = 'data',
): { data: Record<string, unknown>; edits: DataEdit[]; outcome: DataPatchOutcome } {
  const edits: DataEdit[] = []
  const changed: string[] = []
  const deleted: string[] = []
  const unchanged: string[] = []
  const alreadyAbsent: string[] = []

  const walk = (base: Record<string, unknown>, incoming: Record<string, unknown>, prefix: string) => {
    const out: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(incoming)) {
      const path = pathStep(prefix, key)
      const had = Object.prototype.hasOwnProperty.call(base, key)
      const previous = base[key]

      // `undefined` cannot survive JSON, so this only reaches us from a caller inside the
      // process. Treating it as "delete" or as "skip" would both be a guess, and a guess about
      // a write is how a key goes missing without anyone being told.
      if (value === undefined) {
        throw new PanelError(
          `${path} in a merge patch is undefined. Send null to delete the key, or leave it out to keep it as it is.`,
        )
      }

      // `__proto__` is refused rather than merged, and this is not theoretical tidiness.
      // Assigning it — `out["__proto__"] = value` — does not create a key: it runs the setter
      // every object inherits and REPLACES the object's prototype. The key would then be absent
      // from what is stored while this function reported the path as changed and wrote a change
      // row saying so: a write that says it succeeded and stored nothing, which is the exact
      // failure this whole phase exists to stop. Refusing is the only answer that cannot lie.
      // (Fastify's JSON parser rejects it over HTTP already; this covers the seed script, the
      // tests and any future importer, which call mergeData directly.)
      if (key === '__proto__') {
        throw new PanelError(
          `A merge patch may not contain the key "__proto__" (at ${path}). Assigning it would change the ` +
            `object's prototype instead of storing a key, so the merge would report a change it did not make. ` +
            `If a record somehow already holds that key, replace the whole object with "data" instead.`,
        )
      }

      if (value === null) {
        if (!had) {
          alreadyAbsent.push(path)
          continue
        }
        delete out[key]
        edits.push({ path, before: previous, after: undefined, deleted: true })
        deleted.push(path)
        continue
      }

      if (isJsonObject(value) && isJsonObject(previous)) {
        out[key] = walk(previous, value, path)
        continue
      }

      if (had && JSON.stringify(previous) === JSON.stringify(value)) {
        unchanged.push(path)
        continue
      }

      out[key] = value
      edits.push({ path, before: had ? previous : undefined, after: value, deleted: false })
      changed.push(path)
    }
    return out
  }

  const data = walk(current, patch, prefix)
  const outcome = { changed, deleted, unchanged, alreadyAbsent }
  return { data, edits, outcome: { ...outcome, note: plainOutcome(outcome), detail: describeOutcome(outcome) } }
}

/**
 * The merge patch that turns `current` into `replacement` exactly, under the rules of mergeData.
 *
 * Sending `replacement` itself as a patch keeps every key of `current` it leaves out, at every
 * depth, because two objects merge. This adds a null for each of those keys, so the merge deletes
 * them, and the stored object is `replacement` and nothing else. The change rows the merge writes
 * still hold every old value, so what was replaced stays readable in the record's revisions.
 * A second refusal of a run kept the first one's precedent this way.
 */
export function aPatchThatReplaces(current: Record<string, unknown>, replacement: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(current)) if (!Object.prototype.hasOwnProperty.call(replacement, key)) patch[key] = null
  for (const [key, value] of Object.entries(replacement)) {
    const previous = current[key]
    patch[key] = isJsonObject(value) && isJsonObject(previous) ? aPatchThatReplaces(previous, value) : value
  }
  return patch
}
