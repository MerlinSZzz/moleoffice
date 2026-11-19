// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TRUNK IS READ FROM THE REPOSITORY, AND A RUN'S OWN LOG DOES NOT BLOCK THE SEAL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * An agent's supervisor in the CFC repository, 15 September 2026 (problem `zhjORdd3zYyr`):
 * finishing a worker's session runs the Git seal of its submitted work, and the seal carried two
 * faults in one act.
 *
 *   1. IT ASSUMED THE TRUNK WAS `main`. The base was `String(data.cutFrom ?? 'main')`, so a
 *      repository whose trunk is `master` failed at `rev-parse --verify main^{commit}` and the
 *      refusal was git's own words, which never said the office had assumed `main`.
 *   2. IT REFUSED A RUN'S OWN LOG. The cleanliness check counted every untracked file, and the
 *      office's procedure writes each worker's log under `<workingDirectory>/.logs/`. Mole
 *      Office's own .gitignore names `.logs/` so its workers never met it; the CFC repository's
 *      does not, so every CFC worker's seal was refused and the advice ("Commit the submitted
 *      files first") was wrong for a log.
 *
 * The supervisor moved the logs out of the tree by hand and wrote `cutFrom` by hand. That is the
 * rejected route. These cases drive the real finish door — `PATCH /api/records/:id` with
 * `dataPatch.state = 'finished'` — in a scratch repository of the test's own, and measure what
 * the seal recorded.
 *
 * Every scratch repository lives under this test's own temporary directory and is removed by it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Put `String(data['cutFrom'] ?? 'main')` back in `sealFinishedRun`, and the first case goes
 *     red with git's words about `main` instead of a seal.
 *   - Put the untracked filter back to every path, and the first case goes red on `.logs/worker.log`.
 *   - Put `Commit the submitted files first.` back, and the second case goes red on the two ways
 *     through.
 *   - Make `inspectionTrunk` return `main` when there is no origin/HEAD, and the third goes red:
 *     both branches exist and it should refuse, not choose.
 *   - Make `inspectionTrunk` ignore the remote head, and the fourth goes red: it uses `main`.
 *   - Make `sealFinishedRun` ignore a named cutFrom, and the fifth goes red.
 *   - Put the word `main` back as the fallback in `inspectionBase` (a cutFrom that resolves to the
 *     run's own HEAD), and the sixth goes red with git's words about `main`: a supervisor
 *     met exactly that on 15 September 2026 at 17:4x, in a worktree sitting on its base branch.
 *   - Make the seal say "the check" where the named base did not resolve, and 'uses the clone trunk
 *     for an older run whose named base cannot resolve' goes red: the check and the seal say the one
 *     maker's sentence (`aBaseThatDidNotResolve`), each with its own name. (A1) and (A2) below
 *     compare with that maker's answer for the parts each reader gives it.
 *   - Leave `forkBaseSays` out of what `captureGit` returns, and that case and 'seals and checks
 *     against the recorded commit' go red.
 *   - Leave it out of the seal that keeps an earlier fork base, and 'says on a second seal with no
 *     rebase' goes red.
 *   - Take the session's entry out of CROSS_CHECKS in src/shared/kinds.ts, and 'refuses a malformed
 *     cutFromCommit at the record door' goes red: the door stores the value, and the mistake shows
 *     only when the run ends, as an account of the round the office could not write.
 *   - Take the cutFrom check out of sessionWave13nCrossChecks, or make it refuse only a name that
 *     starts with --, and 'refuses a cutFrom that starts with -' goes red: the door stores a name
 *     git would read as an option.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  THE_TRUNK_CANNOT_BE_TOLD, aBaseThatDidNotResolve, aBaseWithNoTrunkInItsPlace, howToMakeTheBaseExact, recordedCutFrom,
} from '../src/server/lib/check-tip.ts'
import { A_CUT_FROM_COMMIT_IS, A_CUT_FROM_MAY_NOT_START_WITH_A_DASH } from '../src/shared/kind-fields/session-wave-13n.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')

const WORKSPACE = 'default'
const actor = { type: 'agent' as const, id: 'trunk-worker' }
const headers = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'trunk-worker',
}

/** Every scratch directory this file makes, removed in one place when it is done. */
const scratch: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  scratch.push(dir)
  return dir
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function configure(dir: string): void {
  git(dir, 'config', 'user.email', 'a-test@example.invalid')
  git(dir, 'config', 'user.name', 'A test')
  git(dir, 'config', 'commit.gpgsign', 'false')
}

function commit(dir: string, message: string): void {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
}

/** A run whose record names no branch, in the working directory given. */
function runIn(directory: string, extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic trunk-seal run',
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'trunk-worker', workingDirectory: directory, ...extra },
  }).id
}

async function finish(id: string) {
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { state: 'finished' } } })
}

/**
 * `git init -b master`, one commit on master, then a branch `the-work` with one more commit and
 * the worktree on it. The trunk is master and there is no origin.
 */
function masterRepo(): string {
  const dir = tmp('mole-office-trunk-master-')
  git(dir, 'init', '-q', '-b', 'master')
  configure(dir)
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'before.txt'), 'before\n')
  commit(dir, 'Before the work')
  git(dir, 'switch', '-q', '-c', 'the-work')
  writeFileSync(join(dir, 'work', 'submitted.txt'), 'submitted\n')
  commit(dir, 'The work')
  return dir
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  seals = await import('../src/server/lib/sealed-tip.ts')
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    payload: { handle: 'trunk-starter', name: 'Synthetic trunk starter' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': 'trunk-starter' },
    payload: { handle: 'trunk-worker', name: 'Synthetic trunk worker', workArea: ['work'] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

describe('the seal reads the trunk from the repository and ignores a run’s own log', () => {
  it('seals and checks against the recorded commit even when the name cannot resolve', async () => {
    const dir = masterRepo()
    const base = git(dir, 'rev-parse', 'master')
    git(dir, 'branch', '-f', 'master', 'HEAD')
    const id = runIn(dir, { cutFrom: 'main' })
    const data = t.api.getRecord(id)!.data
    writeDataBypassingTheGate(t, id, { ...data, cutFromCommit: { named: 'main', commit: base } })

    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(base)
    expect(recordedCutFrom(dir, base).branch).toBe(base)
    expect(seals.readRunSeal(id)!.seal.git!.forkBaseSays)
      .toBe(seals.theForkBaseSays(base, recordedCutFrom(dir, base).says))
  })

  it('uses the clone trunk for an older run whose named base cannot resolve', async () => {
    const dir = masterRepo()
    const id = runIn(dir, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(git(dir, 'rev-parse', 'master'))
    const checked = recordedCutFrom(dir, 'main')
    expect(checked.branch).toBe('master')
    expect(checked.says).toContain('main')
    expect(checked.says).toContain('master')
    // THE SEAL SAYS WHY IT READ master IN THE CHECK'S OWN WORDS, WITH ITS OWN NAME (aBaseThatDidNotResolve).
    const master = git(dir, 'rev-parse', 'master')
    expect(checked.says).toBe(aBaseThatDidNotResolve('check', dir, 'main', 'master', master))
    expect(seals.readRunSeal(id)!.seal.git!.forkBaseSays)
      .toBe(seals.theForkBaseSays('master', aBaseThatDidNotResolve('seal', dir, 'main', 'master', master)))
  })

  it('says on a second seal with no rebase that it kept the first seal\'s fork base', async () => {
    const dir = masterRepo()
    const id = runIn(dir, { cutFrom: 'main' })
    expect((await finish(id)).statusCode).toBe(200)
    const first = seals.readRunSeal(id)!.seal.git!.forkBase
    writeFileSync(join(dir, 'work', 'more.txt'), 'more\n')
    commit(dir, 'More of the work')
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    const again = seals.readRunSeal(id)!.seal.git!
    expect(again.commit).toBe(git(dir, 'rev-parse', 'HEAD'))
    expect(again.forkBase).toBe(first)
    expect(again.forkBaseSays).toBe(`An earlier seal of this run read the fork base ${first}. The run was not rebased onto a newer base, so this seal keeps it.`)
  })

  it('names the clone and all local branches when the named base and trunk are absent', async () => {
    const dir = masterRepo()
    git(dir, 'branch', '-m', 'master', 'trunk')
    git(dir, 'branch', '-m', 'dev')
    const id = runIn(dir, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain(dir)
    expect(reply.body).toContain('main')
    expect(reply.body).toContain('trunk')
    expect(reply.body).toContain('dev')
    const branches = git(dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').join(', ')
    expect(reply.body).toContain(branches)
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('uses a later cutFrom instead of the commit recorded for the old name', async () => {
    const dir = masterRepo()
    const old = git(dir, 'rev-parse', 'master')
    git(dir, 'branch', 'new-base', 'HEAD')
    writeFileSync(join(dir, 'work', 'later.txt'), 'later\n')
    commit(dir, 'Later work')
    const id = runIn(dir, { cutFrom: 'new-base' })
    writeDataBypassingTheGate(t, id, { ...t.api.getRecord(id)!.data, cutFromCommit: { named: 'main', commit: old } })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(git(dir, 'rev-parse', 'new-base'))
  })

  it('refuses a malformed recorded commit and names the field', async () => {
    const dir = masterRepo()
    const id = runIn(dir, { cutFrom: 'master' })
    writeDataBypassingTheGate(t, id, { ...t.api.getRecord(id)!.data, cutFromCommit: { named: 'master', commit: 'short' } })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain('cutFromCommit')
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('refuses a malformed cutFromCommit at the record door, in the words the seal says for one stored before', async () => {
    const shape = A_CUT_FROM_COMMIT_IS
    const dir = masterRepo()
    const id = runIn(dir, { cutFrom: 'master' })
    const before = t.api.getRecord(id)!.data
    for (const cutFromCommit of [{ named: 'master', commit: 'not-a-commit' }, { named: 'master' }, { named: 7, commit: 'a'.repeat(40) }, { named: 'master', commit: 'A'.repeat(40) }]) {
      const reply = await app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { cutFromCommit } } })
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.body).toContain(shape)
    }
    expect(t.api.getRecord(id)!.data).toEqual(before)
    expect(() => runIn(dir, { cutFrom: 'master', cutFromCommit: { named: 'master', commit: 'short' } })).toThrow(shape)
    const sound = await app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { cutFromCommit: { named: 'master', commit: git(dir, 'rev-parse', 'master') } } } })
    expect(sound.statusCode, sound.body).toBe(200)
  })

  it('refuses a cutFrom that starts with - at the record door, and takes a branch, a name with a - inside and a full commit', async () => {
    expect(A_CUT_FROM_MAY_NOT_START_WITH_A_DASH).toEqual(expect.any(String))
    const dir = masterRepo()
    const id = runIn(dir, { cutFrom: 'master' })
    const before = t.api.getRecord(id)!.data
    for (const cutFrom of ['-x', '--orphan', '-']) {
      const reply = await app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { cutFrom } } })
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.body).toContain(A_CUT_FROM_MAY_NOT_START_WITH_A_DASH)
    }
    expect(t.api.getRecord(id)!.data).toEqual(before)
    expect(() => runIn(dir, { cutFrom: '-x' })).toThrow(A_CUT_FROM_MAY_NOT_START_WITH_A_DASH)
    for (const cutFrom of ['the-work', 'feature-x', git(dir, 'rev-parse', 'master')]) {
      const sound = await app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { cutFrom } } })
      expect(sound.statusCode, sound.body).toBe(200)
      expect(t.api.getRecord(id)!.data['cutFrom']).toBe(cutFrom)
    }
  })

  it('refuses a missing full commit instead of falling back to the trunk', async () => {
    const dir = masterRepo()
    const missing = '0'.repeat(40)
    const id = runIn(dir, { cutFrom: missing })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain(missing)
    expect(recordedCutFrom(dir, missing).branch).toBeNull()
  })

  it('checks and seals against the same base when a lightweight tag names the tip', async () => {
    const dir = masterRepo()
    git(dir, 'tag', 'work-tag')
    const id = runIn(dir, { cutFrom: 'work-tag' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    const checked = recordedCutFrom(dir, 'work-tag')
    expect(checked.branch).not.toBeNull()
    expect(git(dir, 'merge-base', 'HEAD', checked.branch!)).toBe(seals.readRunSeal(id)!.seal.git!.forkBase)
  })

  it('says revision syntax cannot be read without git instead of guessing the trunk', () => {
    const dir = masterRepo()
    git(dir, 'branch', '-f', 'master', 'HEAD')
    const named = 'master~1'
    const checked = recordedCutFrom(dir, named)
    expect(checked.branch).toBeNull()
    expect(checked.says).toContain(named)
    expect(checked.says.toLowerCase()).toContain('cannot')
    expect(checked.says.toLowerCase()).toContain('git')
  })
  it('seals against master and leaves .logs/worker.log out of the sealed files', async () => {
    const dir = masterRepo()
    mkdirSync(join(dir, '.logs'), { recursive: true })
    writeFileSync(join(dir, '.logs', 'worker.log'), 'a run log, which is not submitted work\n')

    const id = runIn(dir)
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)

    const sealed = seals.readRunSeal(id)!.seal.git!
    // THE BASE IS THE MERGE BASE WITH MASTER, the repository's trunk, not a branch called main.
    expect(sealed.forkBase).toBe(git(dir, 'merge-base', 'HEAD', 'master'))
    expect(sealed.forkBase).toBe(git(dir, 'rev-parse', 'master'))
    expect(sealed.files.map((one) => one.path)).toEqual(['work/submitted.txt'])
    expect(sealed.files.map((one) => one.path)).not.toContain('.logs/worker.log')
  })

  it('still refuses an untracked file outside .logs/, and names it and both ways through', async () => {
    const dir = masterRepo()
    writeFileSync(join(dir, 'notes.txt'), 'work that is not in the commit\n')

    const id = runIn(dir)
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    // THE FILE IS NAMED, and so are both ways through: commit it, or have git ignore it.
    expect(reply.body).toContain('notes.txt')
    expect(reply.body).toContain('Commit them')
    expect(reply.body).toContain('.gitignore')
    expect(reply.body).toContain('.git/info/exclude')
    // AND NOTHING WAS SEALED AND THE RUN DID NOT FINISH.
    expect(seals.readRunSeal(id)).toBeNull()
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
  })

  it('falls back to the trunk, not to main, when cutFrom names the run’s own branch', async () => {
    // THE WORKTREE SITS ON THE BRANCH THE RUN NAMES AS cutFrom, so cutFrom resolves to HEAD. The
    // old rule fell back to the word main; in a master repository that was a refusal in git's
    // words (an agent's supervisor, cfc-fix-base-20260915, 15 September 2026 17:4x).
    const dir = masterRepo()
    const id = runIn(dir, { cutFrom: 'the-work' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)

    const sealed = seals.readRunSeal(id)!.seal.git!
    expect(sealed.forkBase).toBe(git(dir, 'rev-parse', 'master'))
    expect(sealed.files.map((one) => one.path)).toEqual(['work/submitted.txt'])
  })

  it('refuses when both main and master exist, naming both and cutFrom', async () => {
    const dir = tmp('mole-office-trunk-both-')
    git(dir, 'init', '-q', '-b', 'master')
    configure(dir)
    mkdirSync(join(dir, 'work'), { recursive: true })
    writeFileSync(join(dir, 'work', 'committed.txt'), 'committed\n')
    commit(dir, 'One commit')
    git(dir, 'branch', 'main')

    const id = runIn(dir)
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain('main')
    expect(reply.body).toContain('master')
    expect(reply.body).toContain('cutFrom')
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('reads the trunk from origin/HEAD when it names neither main nor master', async () => {
    const origin = tmp('mole-office-trunk-origin-')
    git(origin, 'init', '-q', '--bare')
    const seed = tmp('mole-office-trunk-seed-')
    git(seed, 'init', '-q', '-b', 'trunk')
    configure(seed)
    mkdirSync(join(seed, 'work'), { recursive: true })
    writeFileSync(join(seed, 'work', 'before.txt'), 'before\n')
    commit(seed, 'Before the work')
    git(seed, 'branch', 'main')
    git(seed, 'branch', 'master')
    writeFileSync(join(seed, 'work', 'after.txt'), 'after\n')
    commit(seed, 'A second commit only trunk has')
    git(seed, 'remote', 'add', 'origin', origin)
    git(seed, 'push', '-q', 'origin', 'trunk', 'main', 'master')
    // The bare repository's own HEAD points at trunk, so origin/HEAD does too.
    git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/trunk')

    const clone = tmp('mole-office-trunk-clone-')
    execFileSync('git', ['clone', '-q', origin, clone], { encoding: 'utf8' })
    configure(clone)
    // AS THE CRITERION SAYS: make the remote head name a branch called neither main nor master.
    git(clone, 'remote', 'set-head', 'origin', 'trunk')
    expect(git(clone, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).toBe('origin/trunk')
    // BOTH main AND master ALSO EXIST LOCALLY, one commit back, so step 1 has to beat step 2.
    git(clone, 'branch', 'main', 'origin/main')
    git(clone, 'branch', 'master', 'origin/master')

    git(clone, 'switch', '-q', '-c', 'the-work')
    writeFileSync(join(clone, 'work', 'submitted.txt'), 'submitted\n')
    commit(clone, 'The work')
    mkdirSync(join(clone, '.logs'), { recursive: true })
    writeFileSync(join(clone, '.logs', 'worker.log'), 'a run log\n')

    const id = runIn(clone)
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)

    const sealed = seals.readRunSeal(id)!.seal.git!
    // TRUNK WINS OVER main AND master, which both exist here and point one commit back.
    expect(sealed.forkBase).toBe(git(clone, 'rev-parse', 'trunk'))
    expect(sealed.forkBase).not.toBe(git(clone, 'rev-parse', 'main'))
    expect(sealed.forkBase).not.toBe(git(clone, 'rev-parse', 'master'))
  })

  it('uses the branch a session names, even where the trunk is another branch', async () => {
    const dir = tmp('mole-office-trunk-named-')
    git(dir, 'init', '-q', '-b', 'master')
    configure(dir)
    mkdirSync(join(dir, 'work'), { recursive: true })
    writeFileSync(join(dir, 'work', 'before.txt'), 'before\n')
    commit(dir, 'Before the work')
    git(dir, 'switch', '-q', '-c', 'base')
    writeFileSync(join(dir, 'work', 'base-only.txt'), 'only base has this\n')
    commit(dir, 'The base branch moves on')
    git(dir, 'switch', '-q', '-c', 'the-work')
    writeFileSync(join(dir, 'work', 'submitted.txt'), 'submitted\n')
    commit(dir, 'The work')

    const id = runIn(dir, { cutFrom: 'base' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)

    const sealed = seals.readRunSeal(id)!.seal.git!
    // THE NAMED BRANCH IS THE BASE, not the trunk (master), and the two fork points differ here.
    expect(sealed.forkBase).toBe(git(dir, 'rev-parse', 'base'))
    expect(sealed.forkBase).not.toBe(git(dir, 'rev-parse', 'master'))
  })
})

/**
 * A BASE THAT DID NOT RESOLVE IS NAMED WITH THE TRUNK READ INSTEAD, AND HOW TO MAKE IT EXACT.
 *
 * A run whose cutFrom names no branch or commit of its repository is read against the repository's trunk, and that
 * fallback stays. What changes is what the seal and the check say about it. They said "The base main did not resolve
 * in <the directory>." and then the trunk's own sentence, which named no commit; where the trunk could not be told,
 * they ended with "record cutFrom on the session as the way through", which named no branch to record. One maker
 * (`aBaseThatDidNotResolve`, src/server/lib/check-tip.ts) says which reader read which trunk, at which commit, and how
 * to make the base exact; where the trunk cannot be told, the check (`aBaseWithNoTrunkInItsPlace`) and the seal
 * (`aSealWithNoBaseAndNoTrunkIsRefused`, src/server/lib/sealed-tip.ts) say why, and the check names no trunk. Which
 * base is read does not change, and each case says so too.
 *
 * THE WORDS ARE READ FROM THE CODE THAT DEFINES THEM. Each case compares with the function the right answer calls,
 * given the reader, the base, the trunk and the commit the case expects, and checks that the commit, the trunk and
 * the advice are in the words, so a maker that drops one of them is caught though both sides call it.
 *
 * WHAT GOES RED WHEN THE CODE IS PUT BACK, one change at a time:
 *   - The maker leaves the commit out: (A1), (A2), (A5) and (A6).
 *   - The maker leaves the --cut-from advice out: (A1), (A2), (A5), (A6) and (A7).
 *   - The seal's refusal leaves the local branches out: (A3), and 'names the clone and all local branches …' above.
 *   - The seal makes its words from the branch named before theNewerTrunk chose: (A5).
 *   - The maker ignores which reader it is and always says "the check": (A1).
 *   - The check leaves origin's copy of the trunk out: (A6).
 *   - The check turns a trunk whose commit it cannot read into no branch: (A7).
 *   - The check gives a trunk it cannot tell the fallback's words, with main as the trunk: (A4).
 *   - The refusal with no local branch lists an empty list of branches: (A3b).
 */
describe('a base that did not resolve is named with the trunk read instead, and how to make it exact', () => {
  /** masterRepo(), with origin/master one commit ahead of master and origin/HEAD pointing at it. */
  function aheadOnOrigin(): { dir: string; master: string; origin: string } {
    const dir = masterRepo()
    const master = git(dir, 'rev-parse', 'master')
    const origin = git(dir, 'commit-tree', 'master^{tree}', '-p', 'master', '-m', 'Ahead on origin')
    git(dir, 'update-ref', 'refs/remotes/origin/master', origin)
    git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master')
    return { dir, master, origin }
  }

  it('(A1) the seal names the trunk it read instead, at its commit, and how to make the base exact', async () => {
    const dir = masterRepo()
    const master = git(dir, 'rev-parse', 'master')
    const id = runIn(dir, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(master)
    const says = seals.readRunSeal(id)!.seal.git!.forkBaseSays!
    expect(says).toBe(seals.theForkBaseSays('master', aBaseThatDidNotResolve('seal', dir, 'main', 'master', master)))
    for (const part of [dir, master, howToMakeTheBaseExact('master')]) expect(says).toContain(part)
    // THE SEAL SAYS IT WITH ITS OWN NAME: the check's sentence of the same run is not in it.
    expect(says).not.toContain(recordedCutFrom(dir, 'main').says)
  })

  it('(A2) the check says the same of the same run, with its own name', () => {
    const dir = masterRepo()
    const master = git(dir, 'rev-parse', 'master')
    const checked = recordedCutFrom(dir, 'main')
    expect(checked).toEqual({ branch: 'master', says: aBaseThatDidNotResolve('check', dir, 'main', 'master', master) })
    for (const part of [dir, master, howToMakeTheBaseExact('master')]) expect(checked.says).toContain(part)
  })

  it('(A3) the seal refuses where the trunk cannot be told, says why, and names the local branches to choose from', async () => {
    const dir = masterRepo()
    git(dir, 'branch', '-m', 'master', 'trunk')
    git(dir, 'branch', '-m', 'dev')
    const id = runIn(dir, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    const error = JSON.parse(reply.body).error as string
    expect(error).toBe(seals.aSealWithNoBaseAndNoTrunkIsRefused(realpathSync(dir), 'main', ['dev', 'trunk']))
    for (const part of [realpathSync(dir), THE_TRUNK_CANNOT_BE_TOLD, 'dev', 'trunk']) expect(error).toContain(part)
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('(A3b) the same refusal says so where the repository has no local branch at all', async () => {
    const dir = masterRepo()
    git(dir, 'switch', '-q', '--detach')
    git(dir, 'branch', '-q', '-D', 'master', 'the-work')
    const id = runIn(dir, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    const error = JSON.parse(reply.body).error as string
    expect(error).toBe(seals.aSealWithNoBaseAndNoTrunkIsRefused(realpathSync(dir), 'main', []))
    expect(error).toContain(seals.A_REPOSITORY_WITH_NO_LOCAL_BRANCH_IS_TOLD)
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('(A4) the check reads nothing in place of the base where the trunk cannot be told, and says why', () => {
    const dir = masterRepo()
    git(dir, 'branch', '-m', 'master', 'trunk')
    git(dir, 'branch', '-m', 'dev')
    const checked = recordedCutFrom(dir, 'main')
    expect(checked).toEqual({ branch: null, says: aBaseWithNoTrunkInItsPlace(dir, 'main') })
    for (const part of [dir, THE_TRUNK_CANNOT_BE_TOLD]) expect(checked.says).toContain(part)
  })

  it('(A5) the seal names the branch and commit it read, origin/master where that is the newer trunk', async () => {
    const { dir, master, origin } = aheadOnOrigin()
    const id = runIn(dir, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    const sealed = seals.readRunSeal(id)!.seal.git!
    expect(sealed.forkBase).toBe(master)
    expect(sealed.forkBaseSays).toBe(seals.theForkBaseSays('origin/master', aBaseThatDidNotResolve('seal', dir, 'main', 'origin/master', origin)))
    for (const part of [origin, howToMakeTheBaseExact('origin/master')]) expect(sealed.forkBaseSays).toContain(part)
  })

  it('(A6) the check names the trunk and the copy of it on origin where they stand at two commits', () => {
    const { dir, master, origin } = aheadOnOrigin()
    const checked = recordedCutFrom(dir, 'main')
    expect(checked).toEqual({
      branch: 'master',
      says: aBaseThatDidNotResolve('check', dir, 'main', 'master', master, { branch: 'origin/master', commit: origin }),
    })
    for (const part of [master, origin, howToMakeTheBaseExact('master')]) expect(checked.says).toContain(part)
  })

  it('(A7) the check names a trunk whose commit it could not read, and still reads that trunk', () => {
    const dir = masterRepo()
    git(dir, 'branch', '-q', '-D', 'master')
    // A REMOTE REF HOLDING A COMMIT ID THAT NO OBJECT STORE HAS, written as files because git refuses to write it.
    mkdirSync(join(dir, '.git', 'refs', 'remotes', 'origin'), { recursive: true })
    writeFileSync(join(dir, '.git', 'refs', 'remotes', 'origin', 'master'), 'f'.repeat(40) + '\n')
    writeFileSync(join(dir, '.git', 'refs', 'remotes', 'origin', 'HEAD'), 'ref: refs/remotes/origin/master\n')
    const checked = recordedCutFrom(dir, 'main')
    expect(checked).toEqual({ branch: 'origin/master', says: aBaseThatDidNotResolve('check', dir, 'main', 'origin/master', null) })
    expect(checked.says).toContain(howToMakeTheBaseExact('origin/master'))
  })
})
