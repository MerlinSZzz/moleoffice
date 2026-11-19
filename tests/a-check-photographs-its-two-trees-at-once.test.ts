// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK PHOTOGRAPHS ITS OWN TREE AND THE WORKER'S AT ONCE.
 *
 * Before and after its model, a check photographs two trees: its own and the worker's (howTheCheckoutStands in
 * tools/the-inspector.mjs says why both). Each photograph is git's answers about one tree, and the inspector's thread
 * waits for git while it reads them. The inspector read the two trees one after the other. Nothing orders the two
 * reads, so it now reads the worker's tree on a thread of its own, begun before it reads its own tree
 * (tools/inspector-photographs.mjs).
 *
 * WHAT IS PROVED, one case each:
 *   - The photograph read on the thread is the photograph read on the calling thread: for a tree that is its commit, a
 *     tree with work in it, a folder that is not a repository, and a missing folder, both where a read that fails is
 *     said with the verdict and where it stops the check.
 *   - The thread has not read the tree when the call answers. It reads the tree while the calling thread waits for a
 *     child process, as the inspector's thread waits for git while it reads its own tree.
 *   - The inspector begins the worker's photograph before it reads its own tree and waits for it after, and reads a
 *     copy as a copy.
 *   - When a tree cannot be read and that stops the check, the inspector says the check's tree first, as it did.
 *
 * Every repository is made up by this test, in a temporary folder of its own that is removed after each case. The git
 * the second case watches is a shell script in that folder, which writes a line for each call and runs the real git.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, then restored:
 *   - Photograph on the calling thread before answering: the second case goes red, because every git call has ended
 *     before the thread waits.
 *   - Photograph on the calling thread when it is next free: the second case goes red, because no git call ends while
 *     the thread waits.
 *   - Leave `unreadIsSaid` out of what the thread is given: the first case goes red, because the thread stops the
 *     check where the calling thread says the tree is unread.
 *   - Wait for the worker's photograph before the inspector reads its own tree: the third case goes red.
 *   - Stop on the worker's tree before the check's: the fourth case goes red.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { aPhotographBegun, aPhotographOf } from '../tools/inspector-photographs.mjs'

const INSPECTOR = fileURLToPath(new URL('../tools/the-inspector.mjs', import.meta.url))

let scratch = ''
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'a-check-photographs-'))
})
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** A made-up repository at `at` with one commit of four files: that commit, and git run there. */
function aRepository(at: string): { tip: string; git: (...args: string[]) => string } {
  mkdirSync(join(at, 'sub'), { recursive: true })
  const env = {
    ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'A made-up check', GIT_AUTHOR_EMAIL: 'check@example.invalid',
    GIT_COMMITTER_NAME: 'A made-up check', GIT_COMMITTER_EMAIL: 'check@example.invalid',
  }
  const git = (...args: string[]) => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8', env })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(at, 'a.txt'), 'a\n')
  writeFileSync(join(at, 'b.txt'), 'b\n')
  writeFileSync(join(at, 'run.sh'), 'echo run\n')
  writeFileSync(join(at, 'sub', 'c.txt'), 'c\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'A made-up commit')
  return { tip: git('rev-parse', 'HEAD').trim(), git }
}

describe('the photograph of a tree read on a thread of its own', () => {
  it('is the photograph the calling thread reads, for every tree the inspector meets', async () => {
    const clean = join(scratch, 'clean')
    const cleanTip = aRepository(clean).tip
    // WORK IN THE TREE: a changed file, a deleted file, a file made executable, a staged file, an untracked file and an
    // untracked folder.
    const worked = join(scratch, 'worked')
    const { tip: workedTip, git } = aRepository(worked)
    writeFileSync(join(worked, 'a.txt'), 'a, changed after the commit\n')
    rmSync(join(worked, 'b.txt'))
    chmodSync(join(worked, 'run.sh'), 0o755)
    writeFileSync(join(worked, 'staged.txt'), 'staged\n')
    git('add', 'staged.txt')
    writeFileSync(join(worked, 'new.txt'), 'new\n')
    mkdirSync(join(worked, 'fresh'))
    writeFileSync(join(worked, 'fresh', 'd.txt'), 'd\n')
    const notARepository = join(scratch, 'not-a-repository')
    mkdirSync(notARepository)
    const missing = join(scratch, 'missing')

    const trees: [string, boolean][] = [
      [clean, false], [clean, true], [worked, false], [worked, true], [notARepository, false], [notARepository, true], [missing, true], [missing, false],
    ]
    for (const [at, unreadIsSaid] of trees) expect(await aPhotographBegun(at, unreadIsSaid), `${at}, unreadIsSaid ${String(unreadIsSaid)}`).toEqual(aPhotographOf(at, unreadIsSaid))

    // WHAT THE PHOTOGRAPHS SAY, so two that are the same because neither read anything are not taken for a proof.
    expect(aPhotographOf(clean)).toEqual({ head: cleanTip, dirty: '' })
    const ofTheWork = aPhotographOf(worked)
    expect(ofTheWork).toEqual({ head: workedTip, dirty: expect.any(String) })
    expect(String((ofTheWork as { dirty: string }).dirty).split('\n').map((line) => line.slice(3)).sort()).toEqual(['a.txt', 'b.txt', 'fresh/', 'new.txt', 'run.sh', 'staged.txt'])
    expect(aPhotographOf(notARepository)).toEqual({ head: expect.stringMatching(/^git could not answer rev-parse HEAD: /), dirty: expect.stringMatching(/^git could not answer the files against HEAD: /) })
    expect(aPhotographOf(missing, true)).toEqual({ unread: expect.stringMatching(/^git could not be run for rev-parse HEAD: .*ENOENT/) })
    const stops = aPhotographOf(missing) as { stops: string }
    expect(stops.stops).toMatch(new RegExp(`^This check is not posted, because the checkout could not be read at ${missing}: git could not be run for rev-parse HEAD: .*ENOENT`))
    expect(stops.stops).toContain('\nENOENT can mean git is missing or the checkout folder is missing.\n')
    expect(stops.stops.endsWith('Whether the checkout stayed unchanged could not be checked. Restore access to the checkout and git, then run the check again.\n')).toBe(true)
  })

  it('has not read the tree when the call answers, and reads it while the calling thread waits for a child process', async () => {
    const tree = join(scratch, 'tree')
    aRepository(tree)
    writeFileSync(join(tree, 'a.txt'), 'a, changed after the commit\n')
    const log = join(scratch, 'git-calls')
    const bin = join(scratch, 'bin')
    mkdirSync(bin)
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()
    writeFileSync(join(bin, 'git'), [
      '#!/bin/sh',
      `printf 'began\\n' >> '${log}'`,
      `'${realGit}' "$@"`,
      'code=$?',
      `printf 'ended\\n' >> '${log}'`,
      'exit $code',
      '',
    ].join('\n'), { mode: 0o755 })
    const path = process.env['PATH']
    process.env['PATH'] = `${bin}:${String(path)}`
    try {
      // HOW MANY GIT CALLS ONE PHOTOGRAPH MAKES, counted on the test's own thread through the same git.
      const here = aPhotographOf(tree)
      const calls = readFileSync(log, 'utf8').split('\n').filter((line) => line === 'ended').length
      expect(calls).toBeGreaterThan(1)
      rmSync(log)

      const begun = aPhotographBegun(tree)
      // THE CALLING THREAD IS HELD HERE, as the inspector's is by git while it reads its own tree: a shell counts the
      // git calls that ended every 50 ms, and ends when all of the photograph's have, or after 20 seconds.
      const said = execFileSync('sh', ['-c', [
        'ended() { if [ -f "$1" ]; then grep -c "^ended$" "$1"; else echo 0; fi; }',
        'if [ "$(ended "$1")" -ge "$2" ]; then echo "the tree was read before the thread waited"; exit 0; fi',
        'i=0',
        'while [ "$(ended "$1")" -lt "$2" ]; do',
        '  i=$((i + 1)); if [ "$i" -gt 400 ]; then echo "$(ended "$1") of $2 git calls ended while the thread waited"; exit 0; fi',
        '  sleep 0.05',
        'done',
        'echo "every git call of the photograph ended while the thread waited"',
      ].join('\n'), 'sh', log, String(calls)], { encoding: 'utf8', timeout: 30_000 })

      expect(said.trim()).toBe('every git call of the photograph ended while the thread waited')
      expect(await begun).toEqual(here)
    } finally {
      process.env['PATH'] = path
    }
  }, 60_000)
})

/** The inspector's `howTheCheckoutStands`, cut out of its source and run with `globals` as all it can see. */
function howTheCheckoutStands(globals: Record<string, unknown>): () => Promise<unknown> {
  const source = readFileSync(INSPECTOR, 'utf8')
  const start = source.indexOf('\nasync function howTheCheckoutStands(')
  if (start < 0) throw new Error(`No async function howTheCheckoutStands was found in ${INSPECTOR}`)
  const end = source.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`The end of howTheCheckoutStands was not found in ${INSPECTOR}`)
  return runInNewContext(`(${source.slice(start + 1, end + 2)})`, globals, { filename: INSPECTOR })
}

describe("the inspector's photograph of its two trees", () => {
  const CHECK = { head: 'the check commit', dirty: '' }
  const WORKER = { head: 'the worker commit', dirty: ' M a.txt' }
  const COPY = { head: 'a copy, which has no commit', dirty: 'a.txt 0a 644' }
  const STOPS_AT_THE_CHECK = 'The check tree could not be read.\n'
  const STOPS_AT_THE_WORKER = 'The worker tree could not be read.\n'

  /** The inspector's function with stand-ins for both photographs, the trees it names and its process, and what it did. */
  function theInspectorWith(answers: { check?: unknown; worker?: unknown; madeACopy?: boolean } = {}) {
    const events: string[] = []
    const written: string[] = []
    const run = howTheCheckoutStands({
      WHERE: '/the/check', THE_WORKERS_CHECKOUT: '/the/worker', IN_A_SANDBOX: true, MADE_A_COPY: answers.madeACopy ?? false,
      aPhotographBegun: (at: string, unreadIsSaid: boolean) => {
        events.push(`began ${at}, unreadIsSaid ${String(unreadIsSaid)}`)
        return new Promise((done) => setTimeout(() => {
          events.push(`answered ${at}`)
          done(answers.worker ?? WORKER)
        }, 20))
      },
      aPhotographOf: (at: string, unreadIsSaid?: boolean) => {
        events.push(`read ${at} here, unreadIsSaid ${String(unreadIsSaid ?? false)}`)
        return answers.check ?? CHECK
      },
      aPhotographOfTheCopy: (at: string) => {
        events.push(`read the copy ${at} here`)
        return COPY
      },
      process: {
        stderr: { write: (text: string) => { written.push(text) } },
        // `process.exit` ends the inspector, so it ends the cut-out function here, saying the code it was given.
        exit: (code: unknown) => { throw new Error(`exited ${String(code)}`) },
      },
    })
    return { run, events, written }
  }

  it("begins the worker's photograph before it reads its own tree, and waits for it after", async () => {
    const asked = theInspectorWith()
    expect(await asked.run()).toEqual({ check: CHECK, worker: WORKER })
    expect(asked.events).toEqual(['began /the/worker, unreadIsSaid true', 'read /the/check here, unreadIsSaid false', 'answered /the/worker'])

    const ofACopy = theInspectorWith({ madeACopy: true })
    expect(await ofACopy.run()).toEqual({ check: COPY, worker: WORKER })
    expect(ofACopy.events).toEqual(['began /the/worker, unreadIsSaid true', 'read the copy /the/check here', 'answered /the/worker'])
  })

  it("says the check's tree first when a tree that cannot be read stops the check", async () => {
    const neither = theInspectorWith({ check: { stops: STOPS_AT_THE_CHECK }, worker: { stops: STOPS_AT_THE_WORKER } })
    await expect(neither.run()).rejects.toThrow('exited 1')
    expect(neither.written).toEqual([STOPS_AT_THE_CHECK])

    const theWorkers = theInspectorWith({ worker: { stops: STOPS_AT_THE_WORKER } })
    await expect(theWorkers.run()).rejects.toThrow('exited 1')
    expect(theWorkers.written).toEqual([STOPS_AT_THE_WORKER])

    const unread = { unread: 'nothing could be read for rev-parse HEAD: the worker tree' }
    expect(await theInspectorWith({ worker: unread }).run()).toEqual({ check: CHECK, worker: unread })
  })
})
