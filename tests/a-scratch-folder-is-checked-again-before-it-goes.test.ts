// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S SCRATCH FOLDER IS CHECKED AGAIN JUST BEFORE THE HELPER REMOVES IT. The inspector's refusal J0Xw7UM9VoyT, agreed
 * by the coordinator in bnAX5wC4GDQP.
 *
 * The sandbox helper removes a finished run's own scratch folder (tools/sandbox-start.mjs, theScratchFolderAfterTheRun),
 * after checking that it is still the folder it made and that no process uses it. Between those checks and the removal it
 * waits on the office twice, for the run's record and for any record naming the folder. A process the command left behind
 * keeps running, and in that wait it may start working in the folder or open a file in it. So the checks are asked again,
 * through theScratchFolderIsStillFree (tools/scratch-folder-checks.mjs), with nothing waited on between that answer and the
 * removal.
 *
 * WHAT IS PROVED
 *   1. A folder that is still the one made, which no process uses, may go.
 *   2. A process that starts working in it after the first checks keeps it, and says which.
 *   3. A process that opens a file in it after the first checks keeps it, and says which.
 *   4. A link put at its path after the first checks keeps it, and says so, and no process is read for it.
 *
 * Each child this file starts is the leader of a process group of its own, and is stopped by that group's id.
 *
 * MUTATIONS, each proved red in the run that adds this file: the second asking taken out of the helper (5); a wait put
 * between the second asking and the removal (5); the processes not asked (2, 3); the path not asked (4).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { theScratchFolderIsStillFree } from '../tools/scratch-folder-checks.mjs'

let parent = ''
let folder = ''
const children: ChildProcess[] = []

/** What the helper records when it makes a scratch folder. */
function asMade(path: string): { real: string; parent: string; dev: number; ino: number } {
  const made = lstatSync(path)
  return { real: realpathSync(path), parent: realpathSync(dirname(path)), dev: made.dev, ino: made.ino }
}

/** A child in a group of its own, and the moment its working folder or open file is what is asked for. */
async function aChild(args: string[], cwd: string, ready: (pid: number) => boolean): Promise<number> {
  const child = spawn(args[0]!, args.slice(1), { cwd, detached: true, stdio: 'ignore' })
  children.push(child)
  const pid = child.pid ?? 0
  const until = Date.now() + 10_000
  while (!ready(pid)) {
    if (Date.now() > until) throw new Error(`the child ${String(pid)} was not ready within 10 s`)
    await new Promise((done) => setTimeout(done, 20))
  }
  return pid
}

beforeEach(() => {
  parent = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-scratch-again-')))
  folder = join(parent, 'a-run-scratch')
  mkdirSync(folder)
  writeFileSync(join(folder, 'left.txt'), 'left\n')
})

afterEach(() => {
  for (const child of children.splice(0)) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // The group is gone already.
    }
  }
  rmSync(parent, { recursive: true, force: true })
})

describe("a run's scratch folder is checked again just before the helper removes it", () => {
  it('lets a folder go that is still the one made and that no process uses', () => {
    expect(theScratchFolderIsStillFree(folder, asMade(folder)).why).toBeNull()
  })

  it('keeps it when a process starts working in it after the first checks', async () => {
    const made = asMade(folder)
    expect(theScratchFolderIsStillFree(folder, made).why).toBeNull()
    const pid = await aChild(['sleep', '30'], folder, (p) => {
      try {
        return readlinkSync(`/proc/${String(p)}/cwd`) === made.real
      } catch {
        return false
      }
    })
    expect(theScratchFolderIsStillFree(folder, made).why).toBe(`process ${String(pid)} works in it`)
  })

  it('keeps it when a process opens a file in it after the first checks', async () => {
    const made = asMade(folder)
    expect(theScratchFolderIsStillFree(folder, made).why).toBeNull()
    const file = join(made.real, 'left.txt')
    const pid = await aChild(['sh', '-c', `exec 3<"${file}"; exec sleep 30`], parent, (p) => {
      try {
        return readlinkSync(`/proc/${String(p)}/fd/3`) === file
      } catch {
        return false
      }
    })
    expect(theScratchFolderIsStillFree(folder, made).why).toBe(`process ${String(pid)} holds ${file} open`)
  })

  it('keeps it when a link is put at its path after the first checks', () => {
    const made = asMade(folder)
    expect(theScratchFolderIsStillFree(folder, made).why).toBeNull()
    const elsewhere = join(parent, 'somewhere-else')
    mkdirSync(elsewhere)
    renameSync(folder, `${folder}.moved`)
    symlinkSync(elsewhere, folder)
    expect(theScratchFolderIsStillFree(folder, made)).toEqual({ why: `a link to ${elsewhere} stands at its path, not the folder this helper made`, unreadable: [] })
  })

})
