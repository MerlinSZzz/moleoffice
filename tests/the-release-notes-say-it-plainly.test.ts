// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE NOTES SAY IN PLAIN ENGLISH HOW TO BUILD AND INSTALL MOLE OFFICE, AND WHAT DOES NOT WORK YET.
 * RELEASE-NOTES.md is at the root, and the clean version carries it: its packaging phase packs nothing from a tree
 * without it (THE_RELEASE_FILES in scripts/clean-version.mjs). So the notes are written for anybody who has the public
 * tree, and these cases hold them to it:
 *
 *   1. they name the version package.json gives, in their first line, and no other version;
 *   2. the owner-content screen of the merge tool (tools/merge-tool/owner-content.mjs) finds nothing on any line of
 *      them, refused or reminded, with no allowance to let a line through;
 *   3. that screen looked for the names, the handles and the research words too, which it can do only where the
 *      file of the owner's content was read; where none was, this case is taken out and says why;
 *   4. they never call a person he, his, him or himself;
 *   5. they name the browser install as a step of the Linux and Windows builds, after npm ci and before the package
 *      scripts, with the command step 0 of the package scripts names (THE_BROWSER_INSTALL in
 *      scripts/the-plain-privacy-run.mjs), so the two cannot differ;
 *   6. every file they link to is in the tree;
 *   7. README.md points at them;
 *   8. the clean version's change to README.md still fits it, and keeps the pointer. The clean version's README is
 *      already changed, and the tool that holds the change is left out of it, so there this case is taken out and
 *      says why.
 *
 * MUTATIONS, each to be proved after a control run. They are written down by a round that ran no test, and are not
 * yet proved: another version in the first line turns case 1 red; a home folder written into a line turns case 2
 * red; a line that says "his" turns case 4 red; the browser install moved below the package scripts, or its command
 * changed by one word, turns case 5 red; a link to a file that is not there turns case 6 red; the README's pointer
 * taken out turns cases 7 and 8 red; a change of README.md that takes the pointer out with it turns case 8 red.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isTheCleanVersion } from '../scripts/the-clean-version-mark.mjs'
import { THE_BROWSER_INSTALL } from '../scripts/the-plain-privacy-run.mjs'
import { theHitsOn, theUncheckedIn } from '../tools/merge-tool/owner-content.mjs'
import { aWordPattern, THE_PERSONS_OLD_PRONOUNS } from './neutral-names.ts'
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
  it('name the version package.json gives in their first line, and no other version', () => {
    const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }
    expect(lines[0]).toContain(version)
    expect([...new Set(notes.match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?/g) ?? [])]).toEqual([version])
  })

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

  it('never call a person he, his, him or himself', () => {
    const old = aWordPattern(THE_PERSONS_OLD_PRONOUNS)
    expect(lines.flatMap((line, at) => (old.test(line) ? [`line ${String(at + 1)}`] : []))).toEqual([])
  })

  it('install the browser after npm ci and before the package scripts, with the command step 0 of the package scripts names', () => {
    const theLine = (words: string) => lines.findIndex((line) => line.trim() === words)
    const install = theLine(THE_BROWSER_INSTALL)
    expect(theLine('npm ci'), 'a line that is npm ci').toBeGreaterThan(-1)
    expect(install, 'the browser install comes after npm ci').toBeGreaterThan(theLine('npm ci'))
    for (const script of ['npm run package:linux', 'npm run package:windows']) {
      expect(theLine(script), `${script} comes after the browser install`).toBeGreaterThan(install)
    }
  })

  it('link only to files the tree has', () => {
    const targets = [...notes.matchAll(/\]\(([^)\s]+)\)/g)].map((link) => link[1]!).filter((target) => !/^[a-z]+:/i.test(target) && !target.startsWith('#'))
    expect(targets.length, 'the notes link to files').toBeGreaterThan(0)
    expect(targets.filter((target) => !existsSync(join(REPO, target.split('#')[0]!)))).toEqual([])
  })

  it('are named by README.md', () => {
    expect(readme).toContain(THE_POINTER)
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
