// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO FILE IN tools/kit/ HOLDS A PERSONAL DEFAULT, AND THE TWO TOOLS THAT NEED A PLACE OR AN ADDRESS
 * STOP AND SAY SO WHEN IT IS MISSING.
 *
 * The owner accepted DES-15: the kit's scripts ship rewritten neutral outside
 * design/. The copies under design/agents/kit fell back to one person's checkout
 * (`/home/<owner>/PROJECTS/mole-office`) and to the port of the owner's office, and their examples named the owner and the owner's
 * project. A default like that is a silent guess (invariant 2): a waiter started on another machine
 * would run whatever sits at that path, and a message sent without an address would go to whichever
 * office answers on that port.
 *
 * WHAT IS PROVED
 *   1. No file in tools/kit/ names a home folder (`/home/`), a live office's port (each port
 *      tools/live-office-ports.mjs says a test keeps off, which is MOLE_OFFICE_PORT where it is set) or the owner's
 *      project (panelx). Every file in the folder is read, so a file added later is read too; the nine tools must
 *      be there, so an empty folder cannot pass.
 *   2. waiter.sh with no MOLE_OFFICE_CHECKOUT exits 1 with a sentence naming the variable, before it
 *      writes anything.
 *   3. send-message.py with neither --api nor MOLE_OFFICE_API exits 2 with a sentence naming both and
 *      saying nothing was sent.
 *
 * WHY THESE TWO CASES CANNOT REACH ANYTHING EVEN WHEN THE SCRIPT IS BROKEN. Case 2 runs bash by its
 * own path with PATH set to an empty folder of this file's own, so a waiter that went past the check
 * could run no program at all, not even node. Case 3 names a body file that does not exist, and the
 * script reads it only after the address check, so a script that went past the check fails on the
 * file before it can send.
 *
 * EVERY PROCESS THIS FILE STARTS IS IN A PROCESS GROUP OF ITS OWN (office regulations, chapter 2):
 * `detached: true` makes it the leader of a new group, and it is waited for. If it has not ended
 * within ten seconds its group is stopped by that id and the case fails.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN (see the commit message): put the old line
 * `CHECKOUT="${MOLE_OFFICE_CHECKOUT:-/home/<owner>/PROJECTS/mole-office}"` back in tools/kit/waiter.sh.
 * Case 1 goes red naming that line, and case 2 goes red because no sentence names the variable. Make
 * theHandleRules ignore its list, and case 5 goes red. Write a made-up handle into one file of the kit and set a made-up
 * list naming it in this file's own process before the list is read, and case 4 goes red.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { KIT, theFilesInTheKit, whatTheKitSays } from './the-files-in-the-tools-kit.ts'

/** The nine tools the folder must hold. */
const THE_TOOLS = [
  'waiter.sh',
  'read-new.sh',
  'mark-read.sh',
  'send-message.py',
  'waiter-groups.sh',
  'stop-waiter.sh',
  'waiter-identity.sh',
  'logins-week.py',
  'mark-seen-in-the-office.py',
] as const

/** What no file in the folder may say, each with what it would be. */
const PERSONAL = [
  { pattern: /\/home\//u, is: 'a home folder' },
  ...thePortsATestKeepsOff().map((port) => ({ pattern: new RegExp(String(port), 'u'), is: `a live office's port, ${String(port)}` })),
  { pattern: /panelx/iu, is: "the owner's project" },
] as const


let scratch = ''

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-tools-kit-defaults-'))
})

afterAll(() => {
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** Where a program is on this runner's PATH, found by reading the folders, so finding it starts nothing. */
function onThePath(program: string): string {
  const found = (process.env.PATH ?? '').split(':').map((folder) => join(folder, program)).find((path) => existsSync(path))
  if (found === undefined) throw new Error(`${program} is not on PATH`)
  return found
}

/** Run one command in a process group of its own, with only the environment given, and wait for it. */
async function inItsOwnGroup(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; printed: string }> {
  const child = spawn(command, args, { detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let printed = ''
  child.stdout.on('data', (chunk: Buffer) => (printed += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (printed += chunk.toString('utf8')))
  let stoppedByTheTimer = false
  const timer = setTimeout(() => {
    stoppedByTheTimer = true
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group ended between the timer and the signal.
      }
    }
  }, 10_000)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  if (stoppedByTheTimer) throw new Error(`${command} ${args.join(' ')} was still running after ten seconds, so its group was stopped`)
  return { code, printed }
}

describe('no file in tools/kit holds a personal default', () => {
  it('case 1: no file names a home folder, the owner\'s port or the owner\'s project', () => {
    const files = theFilesInTheKit()
    for (const tool of THE_TOOLS) expect(files, `tools/kit/${tool} is missing`).toContain(tool)
    const found = whatTheKitSays(PERSONAL)
    expect(found, found.join('\n')).toEqual([])
  })

  it('case 2: waiter.sh with no MOLE_OFFICE_CHECKOUT says so and stops before it writes anything', async () => {
    const run = join(scratch, 'waiter')
    const emptyPath = join(run, 'no-programs')
    mkdirSync(emptyPath, { recursive: true })
    const out = join(run, 'out-folder', 'waiter.out')
    const ended = await inItsOwnGroup(onThePath('bash'), [join(KIT, 'waiter.sh'), 'a-handle', 'a-session', 'a-project', out], {
      PATH: emptyPath,
      HOME: join(run, 'home'),
    })
    expect(ended.code, ended.printed).toBe(1)
    expect(ended.printed).toContain('MOLE_OFFICE_CHECKOUT')
    expect(ended.printed).toContain('Nothing was started.')
    expect(existsSync(join(run, 'out-folder')), 'the waiter made its out folder before the check').toBe(false)
  })

  it('case 3: send-message.py with no address says so, names both ways to give one, and sends nothing', async () => {
    const ended = await inItsOwnGroup(
      onThePath('python3'),
      [join(KIT, 'send-message.py'), 'a-project', 'another-agent', 'A title', join(scratch, 'no-such-body-file'), '--as', 'the-sender'],
      { PATH: process.env.PATH ?? '', HOME: join(scratch, 'home') },
    )
    expect(ended.code, ended.printed).toBe(2)
    expect(ended.printed).toContain('--api')
    expect(ended.printed).toContain('MOLE_OFFICE_API')
    expect(ended.printed).toContain('Nothing was sent.')
  })


})
