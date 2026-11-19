// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILES RUN LANDS ONLY INSIDE ITS FILES AREA, decided on real locations. Acceptance finding 52 (report
 * EnJvvsDTF_Dx, block f-52), on the design the two secretaries approved on 23 September 2026 (messages
 * Yzb2Vd-cKicN and 1bbshFyI-jfU): the real location decides, with every link followed, and a folder whose
 * location moved after it was registered is never followed to its new target. One secretary's reason: the folder his
 * runs land in was once a link into a git working tree deployed to a robot.
 *
 * MUTATION PROOF, 23 September 2026, each alone: the spelling read instead of the real location, and the case of
 * the link that leads out goes red; the check for a folder that moved left out, and the repointed case goes red;
 * the git working tree check left out, and the case of the tree inside the area goes red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { insideTheFilesArea, theFoldersThatMoved, theHiddenHomeFolderHolding } from '../src/config/files-area.mjs'

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'a-files-area-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A lab folder with `runs/` (the area) and `reports/` (never the area), and a folder somewhere else. */
function aLab(name: string): { root: string; runs: string; elsewhere: string } {
  const root = join(scratch, name)
  mkdirSync(join(root, 'runs', 'console_1'), { recursive: true })
  mkdirSync(join(root, 'reports'), { recursive: true })
  writeFileSync(join(root, 'runs', 'console_1', 'ticks.jsonl'), '{}\n')
  const elsewhere = join(scratch, `${name}-elsewhere`)
  mkdirSync(elsewhere, { recursive: true })
  return { root, runs: join(root, 'runs'), elsewhere }
}

describe('a file of a files run and its files area', () => {
  it('is inside when its real location lies in a registered folder, even before it exists', () => {
    const lab = aLab('inside')
    const area = [{ written: lab.runs, resolved: realpathSync(lab.runs) }]
    expect(insideTheFilesArea(lab.root, 'runs/console_1/ticks.jsonl', area).inside).toBe(true)
    expect(insideTheFilesArea(lab.root, 'runs/console_2/new.jsonl', area).inside).toBe(true)
    const outside = insideTheFilesArea(lab.root, 'reports/survivors.md', area)
    expect(outside.inside).toBe(false)
    expect(outside.says).toContain('outside this agent\'s files area')
  })

  it('is outside when a link inside the folder leads out of it, and the sentence names where it really lands', () => {
    const lab = aLab('link-out')
    symlinkSync(lab.elsewhere, join(lab.runs, 'a-way-out'))
    const area = [{ written: lab.runs, resolved: realpathSync(lab.runs) }]
    const read = insideTheFilesArea(lab.root, 'runs/a-way-out/x.jsonl', area)
    expect(read.inside).toBe(false)
    expect(read.real).toBe(join(realpathSync(lab.elsewhere), 'x.jsonl'))
    expect(read.says).toContain(join(realpathSync(lab.elsewhere), 'x.jsonl'))
  })

  it('is outside, every file of it, when a registered folder was a link that has since been repointed', () => {
    const lab = aLab('repointed')
    const link = join(scratch, 'repointed-runs')
    symlinkSync(lab.runs, link)
    const area = [{ written: link, resolved: realpathSync(link) }]
    expect(insideTheFilesArea(lab.root, 'runs/console_1/ticks.jsonl', area).inside).toBe(true)
    unlinkSync(link)
    symlinkSync(lab.elsewhere, link)
    expect(theFoldersThatMoved(area)).toEqual([{ written: link, resolved: realpathSync(lab.runs), now: realpathSync(lab.elsewhere) }])
    const read = insideTheFilesArea(lab.elsewhere, 'x.jsonl', area)
    expect(read.inside).toBe(false)
    expect(read.says).toContain('the new location is never followed')
  })

  it('is outside when the agent has no files area at all', () => {
    const lab = aLab('no-area')
    expect(insideTheFilesArea(lab.root, 'runs/console_1/ticks.jsonl', null).says).toContain('this agent has no files area')
  })

  it('is outside when its real location lies in a git working tree that appeared inside the area', () => {
    const lab = aLab('a-tree-inside')
    const tree = join(lab.runs, 'console_1')
    execFileSync('git', ['init', '-q', tree])
    const area = [{ written: lab.runs, resolved: realpathSync(lab.runs) }]
    const read = insideTheFilesArea(lab.root, 'runs/console_1/ticks.jsonl', area)
    expect(read.inside).toBe(false)
    expect(read.says).toContain(`inside the git working tree ${realpathSync(tree)}; files that belong to a repository go through the git lane`)
    expect(insideTheFilesArea(lab.root, 'runs/console_2/ticks.jsonl', area).inside).toBe(true)
  })
})

describe('the hidden folder of a home a real location lies in', () => {
  it('is the folder directly under the home whose name begins with a dot, and nothing for any other location', () => {
    expect(theHiddenHomeFolderHolding('/x/home/.ssh/authorized_keys', ['/x/home'])).toBe('/x/home/.ssh')
    expect(theHiddenHomeFolderHolding('/x/home/.config', ['/x/home'])).toBe('/x/home/.config')
    expect(theHiddenHomeFolderHolding('/x/home/runs/.kept', ['/x/home'])).toBeNull()
    expect(theHiddenHomeFolderHolding('/x/home', ['/x/home'])).toBeNull()
    expect(theHiddenHomeFolderHolding('/x/other/.ssh', ['/x/home'])).toBeNull()
  })
})
