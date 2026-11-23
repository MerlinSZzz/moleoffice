// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE NOTES SAY IN PLAIN ENGLISH HOW TO BUILD AND INSTALL MOLE OFFICE, AND WHAT DOES NOT WORK YET.
 * RELEASE-NOTES.md is at the root, and the clean version carries it: its packaging phase packs nothing from a tree
 * without it (THE_RELEASE_FILES in scripts/clean-version.mjs). So the notes are written for anybody who has the public
 * tree, and these cases hold them to it:
 *
 *   2. the owner-content screen of the merge tool (tools/merge-tool/owner-content.mjs) finds nothing on any line of
 *      them, refused or reminded, with no allowance to let a line through;
 *   3. that screen looked for the names, the handles and the research words too, which it can do only where the
 *      file of the owner's content was read; where none was, this case is taken out and says why;
 *   8. the clean version's change to README.md still fits it, and keeps the pointer. The clean version's README is
 *      already changed, and the tool that holds the change is left out of it, so there this case is taken out and
 *      says why.
 *
 * MUTATIONS, each to be proved after a control run. They are written down by a round that ran no test, and are not
 * yet proved: a home folder written into a line turns case 2 red; a change of README.md that takes the pointer out
 * with it turns case 8 red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isTheCleanVersion } from '../scripts/the-clean-version-mark.mjs'
import { theHitsOn, theUncheckedIn } from '../tools/merge-tool/owner-content.mjs'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'
import { THE_PATTERNS } from './the-owners-content-patterns.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_NOTES = 'RELEASE-NOTES.md'
const notes = readFileSync(join(REPO, THE_NOTES), 'utf8')
const lines = notes.split('\n')
const readme = readFileSync(join(REPO, 'README.md'), 'utf8')

/** How README.md links to the notes. */
const THE_POINTER = `](${THE_NOTES})`

describe('the release notes', () => {
  it('give the owner-content screen nothing to find on any line, with no allowance', () => {
    expect(lines.length, 'the notes were read').toBeGreaterThan(40)
    const hits = lines.flatMap((line, at) =>
      theHitsOn(THE_NOTES, line, { patterns: THE_PATTERNS, allowed: [] }).map((hit) => `line ${String(at + 1)}: ${hit.pattern} (${hit.says})`),
    )
    expect(hits).toEqual([])
  })

  it("were screened for the owner's names, the handles and the research words too", (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    expect(theUncheckedIn(THE_PATTERNS)).toEqual([])
  })

  it("keep their pointer through the clean version's change to README.md, which still fits it", async (context) => {
    if (isTheCleanVersion(REPO)) {
      const reason =
        "This checkout is the clean version: its README.md is already changed, and scripts/clean-version.mjs, which holds the change, is left out of it. " +
        'The case before this one shows that its README.md names the notes.'
      context.task.meta.takenOut = reason
      context.skip(`taken out: ${reason}`)
      return
    }
    // By a path worked out here, as other tests do: the clean version leaves the tool out, and its type check would
    // refuse a literal one.
    const tool = await import(pathToFileURL(join(REPO, 'scripts', 'clean-version.mjs')).href)
    const changes = Reflect.get(tool, 'CHANGED') as { path: string; change: (text: string, source: { at: string; read: (path: string) => string }) => unknown }[]
    const change = changes.find((one) => one.path === 'README.md')
    expect(change, 'the clean version changes README.md').toBeDefined()
    const changed = change!.change(readme, { at: '2026-01-01 00:00:00', read: (path) => readFileSync(join(REPO, path), 'utf8') })
    expect(typeof changed).toBe('string')
    expect(changed as string).toContain(THE_POINTER)
  }, 60_000)
})
