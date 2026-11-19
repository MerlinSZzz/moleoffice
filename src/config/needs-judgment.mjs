// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE "NEEDS JUDGMENT" LIST: THE PATHS A CHECKER TOOL COULD NOT DECIDE, HANDED TO THE INSPECTOR.
 *
 * Sandbox v1 decision R4, in the owner's own formulation: everything a program can decide with
 * certainty becomes a tool. The tool decides the part it can, and hands the part that needs
 * judgment to the agent responsible for it, which is the inspector. For Mole Office that part is a
 * protected path (design/) that a submission changed and that is not a generated file the tool
 * could regenerate and compare byte for byte.
 *
 * WHAT A CHECKER TOOL WRITES, and what `node tools/the-inspector.mjs --needs-judgment <file>` reads:
 *
 *     { "needsJudgment": [ { "path": "design/flows/ACCEPTANCE.md", "why": "..." } ] }
 *
 * or the bare list, `[ { "path": …, "why": … } ]`, which is what a person writes by hand. In the
 * object form the other top-level keys are the checker's own report and are not read here; the
 * reader says which ones it left. Each item has exactly two keys:
 *
 *   path   the path as git spells it, relative to the checkout
 *   why    in plain words, why the tool could not decide it
 *
 * An empty list is a real answer and is kept: a checker ran and handed nothing on. No list at all
 * is a different fact (nobody ran a checker), and the inspector says the two differently.
 *
 * WHY IT IS ITS OWN FILE. The checker tools write this list, the inspector tool reads it, and the
 * merger passes it between them. One declaration of its shape, in `src/config` where both a plain
 * node tool and the TypeScript server can import it.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** The keys one item carries, and no others. */
export const NEEDS_JUDGMENT_KEYS = /** @type {const} */ (['path', 'why'])

/**
 * @typedef {{ path: string, why: string }} PathThatNeedsJudgment
 */

/**
 * READ A "NEEDS JUDGMENT" LIST, or throw a sentence saying exactly what is wrong with it.
 *
 * Loose input, strict storage: either shape above is read, and the answer says which one it was.
 * Anything it cannot read with certainty is a loud stop rather than a guess, because a path left
 * off this list is a protected change nobody judges.
 *
 * @param {unknown} value the parsed JSON
 * @returns {{ list: PathThatNeedsJudgment[], says: string }}
 */
export function readTheNeedsJudgmentList(value) {
  /** @type {unknown} */
  let items = value
  let shape = 'a bare list'
  /** @type {string[]} */
  let leftUnread = []
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const held = /** @type {Record<string, unknown>} */ (value)
    if (!('needsJudgment' in held)) {
      throw new Error(
        'The needs-judgment file is an object with no "needsJudgment" key. It must be a list of ' +
          '{"path","why"} items, or an object carrying that list under "needsJudgment".',
      )
    }
    items = held['needsJudgment']
    shape = 'the "needsJudgment" list of a checker\'s report'
    leftUnread = Object.keys(held).filter((key) => key !== 'needsJudgment')
  }
  if (!Array.isArray(items)) {
    throw new Error('The needs-judgment list is not a list. It must be a list of {"path","why"} items.')
  }
  /** @type {PathThatNeedsJudgment[]} */
  const list = []
  const seen = new Set()
  items.forEach((item, at) => {
    const which = `Item ${String(at + 1)} of the needs-judgment list`
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`${which} is not an object with "path" and "why".`)
    }
    const held = /** @type {Record<string, unknown>} */ (item)
    const unknown = Object.keys(held).filter((key) => !(/** @type {readonly string[]} */ (NEEDS_JUDGMENT_KEYS)).includes(key))
    if (unknown.length > 0) {
      throw new Error(
        `${which} carries ${unknown.map((key) => `"${key}"`).join(', ')}, which this reader does not read. ` +
          'An item has "path" and "why" and nothing else; put anything more into "why".',
      )
    }
    const path = held['path']
    const why = held['why']
    if (typeof path !== 'string' || path.trim() === '') throw new Error(`${which} has no "path".`)
    if (typeof why !== 'string' || why.trim() === '') throw new Error(`${which} (${path}) does not say why it needs judgment.`)
    if (seen.has(path)) {
      throw new Error(`${path} is named twice on the needs-judgment list. Name it once and put both reasons into its "why".`)
    }
    seen.add(path)
    list.push({ path, why })
  })
  const says =
    `Read ${String(list.length)} path${list.length === 1 ? '' : 's'} that need judgment, from ${shape}.` +
    (leftUnread.length === 0 ? '' : ` The report's other keys were not read: ${leftUnread.join(', ')}.`)
  return { list, says }
}

/**
 * WRITE A "NEEDS JUDGMENT" LIST FOR THE INSPECTOR TOOL TO READ, in the object form above, beside the
 * reader so the one shape is written and read in one file. The message worker writes it before it
 * starts a scoped check (src/worker/runtimes/inspection.ts), and the tool reads it with
 * `readTheNeedsJudgmentList`.
 *
 * @param {string} path where the file goes
 * @param {PathThatNeedsJudgment[]} list the paths handed on, each with why
 */
export function writeTheNeedsJudgmentList(path, list) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ needsJudgment: list.map((one) => ({ path: one.path, why: one.why })) }, null, 2))
}
