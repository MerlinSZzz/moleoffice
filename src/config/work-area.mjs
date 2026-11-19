// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * IS THIS PATH INSIDE A WORK AREA? One rule, read by the server and by the inspector tool.
 *
 * A work area is the folders and files an agent registered when it started, in the words of
 * `node tools/register-a-started-agent.mjs --area <path>`. Criterion C25 of
 * design/rules/ACCEPTANCE.md says the inspector reads a run's changes through that area: a change
 * inside it is read, a change outside it is named and not read.
 *
 * WHY THIS IS ITS OWN FILE. The server sorts a check's changes into inside and outside, and the
 * tool that finds them with git has to decide which diffs are worth reading before it sends them:
 * a diff of an outside file is never read by anybody, and reading every one on a wide branch would
 * push the request past the server's body limit for nothing. Two copies of "inside" would drift
 * with nothing failing, so there is one, here, and `src/config` is where a module both the
 * TypeScript server and a plain-node tool import already lives.
 *
 * MEASURED, ON THE FIRST REAL CHECK THIS RULE WAS PART OF. tools/the-inspector.mjs asked git only
 * about the paths the area named, so a change outside the area was never found at all: not
 * filtered, not named. The run it was checking had changed src/web/pages/RecordPage.tsx outside a
 * work area of src/server/lib, src/server/api, src/shared, tools and tests, and the check's prompt
 * did not carry the name. The tool now asks git for every changed path and reads a diff only for
 * the ones this rule says are inside.
 */

/**
 * Does `path` sit inside one of the area's folders, or equal one of its files?
 *
 * Paths are compared as the work area spells them: relative to the checkout, with a leading `./`
 * and a trailing `/` ignored. A folder in the area holds everything under it.
 *
 * @param {string} path
 * @param {readonly string[]} area
 * @returns {boolean}
 */
export function insideTheWorkArea(path, area) {
  const plain = path.replace(/^\.\//u, '')
  return area.some((one) => {
    const at = one.replace(/^\.\//u, '').replace(/\/+$/u, '')
    return plain === at || plain.startsWith(`${at}/`)
  })
}

/**
 * IS THIS PATH ONE A SCOPED CHECK JUDGES? One rule, read by the server and by the inspector tool.
 *
 * A scoped check is `node tools/the-inspector.mjs --only <path...>`: a check again of a submission
 * an earlier check already judged, when only some of its files changed since. Sandbox v1 decision
 * R2: the verdict follows file content, so a file whose content did not change keeps the verdict
 * it had, and only the changed ones are judged again.
 *
 * `only` is null for an ordinary check, which judges every changed path. Otherwise a path is in the
 * scope when it is named exactly, as git spells it. A folder does not stand for what is under it:
 * the rule is about files whose content changed, so a scope names files.
 *
 * @param {string} path
 * @param {readonly string[] | null} only
 * @returns {boolean}
 */
export function insideTheScope(path, only) {
  return only === null || only.includes(path)
}
