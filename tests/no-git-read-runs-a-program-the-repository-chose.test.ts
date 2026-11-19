// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO GIT READ RUNS A PROGRAM THE REPOSITORY CHOSE.
 *
 * A sandboxed run can write its repository's config, its hooks and its attributes, and several settings there name a
 * program git starts. The office and the tools on the host read such a repository with the guard of
 * src/config/guarded-git.mjs, and never ask git to compare a file of the work tree: the files are compared in Node
 * (src/config/outside-the-commit.mjs). This file makes ONE HOSTILE REPOSITORY and reads it the way they do. Each program
 * it names leaves a marker file when it runs, and no marker may appear.
 *
 * THE HOSTILE REPOSITORY names: core.fsmonitor; core.hooksPath, to a folder of hooks; filter.x with a clean, a smudge
 * and a process program, and `* filter=x diff=x` in info/attributes; diff.x.textconv and diff.external; core.pager;
 * core.sshCommand, with a url rewrite that turns a folder into an ssh address; core.worktree, to another folder;
 * core.alternateRefsCommand, with an alternate object store; a remote whose uploadpack is a program; and gpg.program,
 * with log.showSignature, on a signed commit.
 *
 * WHAT THIS FILE PROVES:
 * 1. The reads of the office (readGit), of the host tools (tools/sandbox-git.mjs) and of the rules writer
 *    (src/worker/rules.ts) run nothing.
 * 2. A fetch from a folder runs no transport, upload-pack, hook or alternate-refs command the repository named.
 * 3. The seal still refuses a changed file and an untracked file, and seals the clean tip, and runs nothing. The
 *    untracked file is found in the run's folder although core.worktree names another.
 * 4. The check and the confirm read the sealed run again, and run nothing.
 * 5. The inspector's reading of the work tree names a changed file and an untracked file, and runs nothing.
 *
 * MUTATION PROOF, 15 October 2026, after a control run of 5 green. Each mutation alone, then restored:
 * - the guard's environment and its options dropped: 5 red. Thirteen reads ran the fsmonitor or gpg.program, the fetch
 *   ran the alternate-refs command and the hook, and the seal and the inspector ran the fsmonitor.
 * - core.fsmonitor=false dropped: 4 red, by the fsmonitor. ls-files, check-attr --cached and diff-tree -p ran it.
 * - core.hooksPath=/dev/null dropped: the fetch red, by the reference-transaction hook.
 * - core.alternateRefsCommand=true dropped: the fetch red, by the alternate-refs command.
 * - log.showSignature=false dropped: the reads red; log and show ran gpg.program.
 * - --no-textconv dropped: the reads red; diff -U0, log -p and show ran the process filter.
 * - --no-ext-diff dropped: the reads red; diff -U0 ran the process filter.
 * - --upload-pack dropped: the fetch red, by the remote's upload-pack.
 * - GIT_ALLOW_PROTOCOL dropped: the fetch red, by the ssh command.
 * - the work tree no longer pinned: the seal sealed with an untracked file in the run's folder, and the inspector did
 *   not name it.
 * - `git diff HEAD` back in the seal's dirty check, as before this guard: the seal refused the clean tip, because git
 *   compared HEAD with the folder core.worktree names. With the work tree pinned it ran the process filter instead.
 * - the rules writer's guard dropped: 1 red, by "the rules writer: git ls-files -z -- AGENTS.md ran fsmonitor"
 *   (17 October 2026). The failing case was 'the reads of the office and of the host tools run nothing the
 *   repository named'.
 * The confirm case is red with the seal case each time, because it reads the run the seal case seals.
 *
 * WHAT IT CANNOT PROVE BY A MUTATION: --no-pager, because git starts a pager only when it writes to a terminal and no
 * read here does; and the overrides that guard commands which write (core.editor, commit.gpgSign,
 * merge.verifySignatures, gc.auto, maintenance.auto), because no read here writes.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theStartIsRefusedOverATrackedRulesFile } from '../src/worker/rules.ts'
import { guardedGit, guardedGitBytes, guardedGitRun, outsideTheCommitInLines } from '../tools/sandbox-git.mjs'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const AS_THE_WORKER = asAgent('hostile-worker')

const made = mkdtempSync(join(tmpdir(), 'hostile-repository-'))
const home = join(made, 'home')
const markers = join(made, 'markers')
const programs = join(made, 'programs')
const repo = join(made, 'repo')
const decoy = join(made, 'decoy')
const sourceA = join(made, 'source-a')
const sourceB = join(made, 'source-b')
const COMMITTED = 'a, as the run committed it\n'

/** Git for making the fixtures, before the repository is armed: no config of the machine's, and nothing it names. */
function setup(dir: string, args: string[], extra: string[] = []): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...extra, '-C', dir, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '', HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Synthetic hostile fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Synthetic hostile fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  }).trim()
}

/** A program that leaves the marker `name` when it runs, then does `then`. */
function aProgram(name: string, then: string): string {
  const file = join(programs, name)
  writeFileSync(file, `#!/bin/sh\ntouch '${join(markers, name)}'\n${then}\n`)
  chmodSync(file, 0o755)
  return file
}

/** The programs the repository named that ran, by their markers. Reading them clears them. */
function whatRan(): string[] {
  const ran = readdirSync(markers).sort()
  for (const one of ran) rmSync(join(markers, one))
  return ran
}

let t: TestDb
let app: FastifyInstance
let readGit: typeof import('../src/server/lib/resources.ts').readGit
let theChangedPathsBeforeATerritoryWrite: typeof import('../src/server/lib/claims.ts').theChangedPathsBeforeATerritoryWrite
let base = ''
let tip = ''
/** The run's commit as a patch, made before the repository is armed, for `patch-id` to read. */
let patch = ''
let sealedRun = ''

/** A source repository with one commit. */
function aSource(dir: string, file: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: { PATH: process.env['PATH'] ?? '', HOME: home, GIT_CONFIG_NOSYSTEM: '1' } })
  writeFileSync(join(dir, file), `${file}\n`)
  setup(dir, ['add', '.'])
  setup(dir, ['commit', '-qm', 'Synthetic source'])
}

/** The run's repository: main, then the run's signed commit on its branch, then everything a sandbox could arm. */
function theHostileRepository(): void {
  for (const folder of [home, markers, programs, decoy, join(programs, 'hooks')]) mkdirSync(folder, { recursive: true })
  aSource(sourceA, 'from-a.txt')
  aSource(sourceB, 'from-b.txt')
  execFileSync('git', ['init', '-q', '-b', 'main', repo], { env: { PATH: process.env['PATH'] ?? '', HOME: home, GIT_CONFIG_NOSYSTEM: '1' } })
  mkdirSync(join(repo, 'work'))
  writeFileSync(join(repo, 'work', 'a.txt'), 'a before\n')
  writeFileSync(join(repo, 'work', 'b.txt'), 'b\n')
  setup(repo, ['add', '.'])
  setup(repo, ['commit', '-qm', 'Synthetic baseline'])
  base = setup(repo, ['rev-parse', 'HEAD'])
  setup(repo, ['switch', '-q', '-c', 'work'])
  writeFileSync(join(repo, 'work', 'a.txt'), COMMITTED)
  setup(repo, ['add', '.'])
  // A SIGNED COMMIT, so log.showSignature below has a signature to check. The signer only writes what git expects.
  const signer = join(made, 'sign')
  writeFileSync(signer, "#!/bin/sh\ncat >/dev/null\nprintf '\\n[GNUPG:] SIG_CREATED D 1 8 00 1 X\\n' >&2\nprintf -- '-----BEGIN PGP SIGNATURE-----\\n\\nZmFrZQ==\\n-----END PGP SIGNATURE-----\\n'\n")
  chmodSync(signer, 0o755)
  setup(repo, ['commit', '-q', '-S', '-m', 'Synthetic run, signed'], ['-c', `gpg.program=${signer}`, '-c', 'user.signingKey=synthetic'])
  tip = setup(repo, ['rev-parse', 'HEAD'])
  patch = setup(repo, ['diff', '-p', base, tip])

  // ARMED. From here on only the readers under test run git in this repository.
  const set = (key: string, value: string): string => setup(repo, ['config', key, value])
  for (const hook of ['pre-commit', 'post-commit', 'post-checkout', 'post-merge', 'post-rewrite', 'post-index-change', 'reference-transaction', 'pre-auto-gc', 'fsmonitor-watchman']) {
    writeFileSync(join(programs, 'hooks', hook), `#!/bin/sh\ntouch '${join(markers, `hook-${hook}`)}'\nexit 0\n`)
    chmodSync(join(programs, 'hooks', hook), 0o755)
  }
  set('core.fsmonitor', aProgram('fsmonitor', 'exit 1'))
  set('core.hooksPath', join(programs, 'hooks'))
  set('core.pager', aProgram('pager', 'exec cat'))
  set('core.sshCommand', aProgram('ssh-command', 'exit 1'))
  set('core.worktree', decoy)
  set('core.alternateRefsCommand', aProgram('alternate-refs-command', 'exit 0'))
  set('filter.x.clean', aProgram('clean-filter', 'exec cat'))
  set('filter.x.smudge', aProgram('smudge-filter', 'exec cat'))
  set('filter.x.process', aProgram('process-filter', 'exit 1'))
  set('diff.x.textconv', aProgram('textconv', 'exec cat "$1"'))
  set('diff.external', aProgram('external-diff', 'exit 0'))
  set('log.showSignature', 'true')
  set('gpg.program', aProgram('gpg-program', 'exit 1'))
  set('remote.elsewhere.url', sourceB)
  set('remote.elsewhere.fetch', '+refs/heads/*:refs/remotes/elsewhere/*')
  set('remote.elsewhere.uploadpack', aProgram('upload-pack', 'exit 1'))
  set('url.ssh://example.invalid/synthetic.insteadOf', sourceA)
  mkdirSync(join(repo, '.git', 'info'), { recursive: true })
  writeFileSync(join(repo, '.git', 'info', 'attributes'), '* filter=x diff=x\n')
  writeFileSync(join(repo, '.git', 'objects', 'info', 'alternates'), `${join(sourceB, '.git', 'objects')}\n`)
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function finish(run: string): Promise<{ code: number; body: string }> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: AS_THE_WORKER, payload: { dataPatch: { state: 'finished' } } })
  return { code: reply.statusCode, body: reply.body }
}

beforeAll(async () => {
  theHostileRepository()
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  readGit = (await import('../src/server/lib/resources.ts')).readGit
  theChangedPathsBeforeATerritoryWrite = (await import('../src/server/lib/claims.ts')).theChangedPathsBeforeATerritoryWrite
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'hostile-worker', name: 'Hostile worker', role: 'worker', workArea: ['work'] })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  rmSync(made, { recursive: true, force: true })
})

// A CASE IS JUDGED BY WHAT RAN DURING IT. A marker an earlier case left when it failed is that case's, and is cleared.
beforeEach(() => { whatRan() })

describe('no git read runs a program the repository chose', () => {
  it('the reads of the office and of the host tools run nothing the repository named', () => {
    const reads: { args: string[]; input?: string; workTree?: string; office: boolean }[] = [
      { args: ['rev-parse', '--git-common-dir'], office: true },
      { args: ['rev-parse', '--verify', 'HEAD^{commit}'], office: true },
      { args: ['symbolic-ref', '--quiet', '--short', 'HEAD'], office: true },
      { args: ['for-each-ref', '--contains', tip, '--format=%(refname)', 'refs/heads/'], office: true },
      { args: ['merge-base', tip, 'main'], office: true },
      { args: ['merge-base', '--is-ancestor', base, tip], office: true },
      { args: ['rev-list', '--count', tip], office: true },
      { args: ['cat-file', '-p', tip], office: true },
      { args: ['ls-tree', '-r', '-l', '-z', '--full-tree', tip], office: true },
      { args: ['diff', '--no-renames', '--name-only', '-z', base, tip, '--'], office: true },
      { args: ['diff', '-U0', '--no-color', '--no-renames', base, tip], office: true },
      { args: ['diff-tree', '-r', '-p', base, tip], office: true },
      { args: ['log', '-1', '--format=%H %s', tip], office: true },
      { args: ['log', '-p', '-1', tip], office: true },
      { args: ['show', tip], office: false },
      { args: ['patch-id', '--stable'], input: patch, office: true },
      { args: ['check-attr', '--cached', '-a', '--', 'work/a.txt'], office: true },
      { args: ['ls-files', '-z', '-t', '--cached', '--others', '--exclude-standard'], workTree: repo, office: true },
      { args: ['ls-files', '-z', '--stage'], workTree: repo, office: true },
    ]
    const ran: string[] = []
    // WORK OUTSIDE THE COMMIT, so an fsmonitor or a filter has a file to look at.
    writeFileSync(join(repo, 'work', 'a.txt'), 'a, changed after the commit\n')
    writeFileSync(join(repo, 'work', 'new.txt'), 'new\n')
    try {
      for (const read of reads) {
        const options = { ...(read.input === undefined ? {} : { input: read.input }), ...(read.workTree === undefined ? {} : { workTree: read.workTree }) }
        const readers: [string, () => unknown][] = [['a host tool', () => guardedGitBytes(repo, read.args, options)]]
        if (read.office) readers.push(['the office', () => readGit(repo, read.args, options)])
        const said = `git ${read.args.join(' ').replaceAll(tip, 'TIP').replaceAll(base, 'BASE')}`
        for (const [who, reader] of readers) {
          try { reader() } catch (error) {
            ran.push(`${who}: ${said} failed: ${String((error as { stderr?: unknown }).stderr ?? error).trim().split('\n').at(-1) ?? ''}`)
          }
          for (const one of whatRan()) ran.push(`${who}: ${said} ran ${one}`)
        }
      }
      // THE RULES WRITER asks git whether the checkout tracks the rules file it would write (src/worker/rules.ts).
      try {
        theStartIsRefusedOverATrackedRulesFile(repo, 'AGENTS.md', 'Rules made up for this reading.\n')
      } catch (error) {
        ran.push(`the rules writer: git ls-files -z -- AGENTS.md failed: ${String((error as { stderr?: unknown }).stderr ?? error).trim().split('\n').at(-1) ?? ''}`)
      }
      for (const one of whatRan()) ran.push(`the rules writer: git ls-files -z -- AGENTS.md ran ${one}`)
    } finally {
      writeFileSync(join(repo, 'work', 'a.txt'), COMMITTED)
      rmSync(join(repo, 'work', 'new.txt'), { force: true })
    }
    expect(ran, ran.join('; ')).toEqual([])
  })

  it('a fetch from a folder runs no transport, upload-pack, hook or alternate-refs command the repository named', () => {
    const named = guardedGitRun(repo, ['fetch', '--quiet', '--no-tags', 'elsewhere'], { fromAFolder: true })
    expect(whatRan()).toEqual([])
    expect(named.status, named.stderr).toBe(0)
    expect(guardedGit(repo, ['rev-parse', 'refs/remotes/elsewhere/main'])).toBe(setup(sourceB, ['rev-parse', 'HEAD']))
    // THE FOLDER IS REWRITTEN TO AN SSH ADDRESS, and ssh is not a folder: refused, and the ssh command never starts.
    const rewritten = guardedGitRun(repo, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', sourceA, 'main'], { fromAFolder: true })
    expect(whatRan()).toEqual([])
    expect(rewritten.status).not.toBe(0)
    expect(rewritten.stderr).toContain("transport 'ssh' not allowed")
  })

  it('the seal still refuses a changed file, an untracked file and a file it could not compare, seals the clean tip, and runs nothing', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/records', headers: AS_THE_WORKER,
      payload: { kind: 'session', title: 'Synthetic run in a hostile repository', data: { state: 'running', servingAgent: 'hostile-worker', workingDirectory: repo, cutFrom: 'main' } },
    })
    expect(created.statusCode, created.body).toBe(201)
    const run = (created.json() as { record: { id: string } }).record.id

    try {
      writeFileSync(join(repo, 'work', 'a.txt'), 'a, changed after the commit\n')
      const changed = await finish(run)
      expect(whatRan()).toEqual([])
      expect(changed.code, changed.body).toBe(409)
      expect(changed.body).toContain('work/a.txt')

      writeFileSync(join(repo, 'work', 'a.txt'), COMMITTED)
      // UNTRACKED IN THE RUN'S OWN FOLDER, though core.worktree names an empty one.
      writeFileSync(join(repo, 'work', 'new.txt'), 'new\n')
      const untracked = await finish(run)
      expect(whatRan()).toEqual([])
      expect(untracked.code, untracked.body).toBe(409)
      expect(untracked.body).toContain('work/new.txt')

      rmSync(join(repo, 'work', 'new.txt'))
      // OTHER BYTES IN A FILE THE COMMIT DID NOT CHANGE, AND EVERY FILE HERE HAS A FILTER. The office does not run the
      // filter, so it cannot tell whether those bytes are work, and it refuses.
      writeFileSync(join(repo, 'work', 'b.txt'), 'b, changed after the commit\n')
      const notCompared = await finish(run)
      expect(whatRan()).toEqual([])
      expect(notCompared.code, notCompared.body).toBe(409)
      expect(notCompared.body).toContain('could not be compared with its commit: work/b.txt.')
    } finally {
      writeFileSync(join(repo, 'work', 'a.txt'), COMMITTED)
      writeFileSync(join(repo, 'work', 'b.txt'), 'b\n')
      rmSync(join(repo, 'work', 'new.txt'), { force: true })
    }

    const sealed = await finish(run)
    expect(whatRan()).toEqual([])
    expect(sealed.code, sealed.body).toBe(200)
    sealedRun = run
  })

  it('the check and the confirm read the sealed run again, and run nothing', async () => {
    expect(sealedRun, 'the seal above did not seal the run').not.toBe('')
    const seal = String(t.api.getRecord(sealedRun)!.data['sealedTip'])
    const sealData = t.api.getRecord(seal)!.data['seal'] as { hash: string; git: { commit: string } }
    expect(sealData.git.commit).toBe(tip)
    const check = await app.inject({ method: 'GET', url: `/api/checks/${sealedRun}`, headers: AS_THE_WORKER })
    expect(whatRan()).toEqual([])
    expect(check.statusCode, check.body).toBe(200)
    writeAVerdictAsItsDoorWould(t, sealedRun, {
      released: {
        by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
        at: '2026-10-15 09:00:00',
        how: 'an inspector',
        read: { sealId: seal, sealHash: sealData.hash, worktree: repo, tip, ofItsOwn: true, says: 'Synthetic: read the sealed tree.' },
      },
    })
    const confirmed = await app.inject({ method: 'POST', url: `/api/checks/${sealedRun}/confirm`, headers: AS_THE_PERSON, payload: { because: 'The report is sound.' } })
    expect(whatRan()).toEqual([])
    expect(confirmed.statusCode, confirmed.body).toBe(201)
  })

  it("the inspector's reading names a changed file, a file it could not compare and an untracked file, and runs nothing", () => {
    expect(guardedGit(repo, ['rev-parse', 'HEAD'])).toBe(tip)
    // A CHANGED EXECUTABLE BIT, and other bytes in a file. Every file here has a filter, so a file with other bytes
    // could not be compared, and this reading shows it as changed.
    chmodSync(join(repo, 'work', 'a.txt'), 0o755)
    writeFileSync(join(repo, 'work', 'b.txt'), 'b, changed after the commit\n')
    writeFileSync(join(repo, 'work', 'new.txt'), 'new\n')
    try {
      const lines = outsideTheCommitInLines(repo, tip)
      expect(whatRan()).toEqual([])
      expect(lines).toBe(' M work/a.txt\n M work/b.txt\n?? work/new.txt')
    } finally {
      chmodSync(join(repo, 'work', 'a.txt'), 0o644)
      writeFileSync(join(repo, 'work', 'b.txt'), 'b\n')
      rmSync(join(repo, 'work', 'new.txt'), { force: true })
    }
  })

  it("the territory comparison reads a run's changed paths itself and runs nothing the repository named", async () => {
    // THE RECORD NAMES THE WORKTREE. This repository redirects git to another folder with core.worktree, so leaving the
    // redirect in place would hide the filter: git would compare the empty folder instead of this one. Remove it for this
    // case, so a reader that asked git to compare this worktree would run the filter, and the run's own folder is read.
    setup(repo, ['config', '--unset', 'core.worktree'])
    writeFileSync(join(repo, 'work', 'a.txt'), 'a, changed after the commit\n')
    try {
      const changed = await theChangedPathsBeforeATerritoryWrite({
        workspaceId: WORKSPACE,
        data: { workingDirectory: repo, cutFrom: 'main', territory: ['work'] },
      })
      expect(whatRan()).toEqual([])
      // ONE RUN IS READ, WHERE ITS WORK TREE AND CUT ARE, AND ITS CHANGED PATH IS FOUND WITHOUT GIT COMPARING THE FILE.
      expect([...changed.values()]).toEqual([{ paths: ['work/a.txt'] }])
    } finally {
      writeFileSync(join(repo, 'work', 'a.txt'), COMMITTED)
      setup(repo, ['config', 'core.worktree', decoy])
    }
  })
})
