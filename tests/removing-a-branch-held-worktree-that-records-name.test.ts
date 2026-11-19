// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REMOVAL TOOL REMOVES A WORKTREE THAT RECORDS NAME ONLY WHEN A BRANCH HOLDS ITS COMMIT (wave 13s round 115, item 25).
 *
 * The owner's rule, as they changed it in point 1 of a decision: a worktree whose branch or keep ref holds every
 * tracked file may be removed even when a record names it, and a record naming an untracked or ignored file inside
 * still keeps it. The answers in round 115's brief: a keep ref is a
 * branch or a ref under refs/keep/ that contains HEAD, with the tracked files clean; a readable record naming an
 * untracked or ignored file keeps it as a hidden one does; a record naming only the folder does not keep it; a record
 * naming a path that is no longer there does not keep it, and the tool says which. A tightening
 * (Q-F7VhosndpR and 8yiywJNWF1Fw): with no such ref, every named worktree is kept, with --even-so too. The office here
 * is a stand-in that gives the door's answer with the classes in it;
 * tests/named-inside-says-what-each-record-names-inside-a-worktree.test.ts asks the real door.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13s round 115. Before the code, at this file's criterion commit, 10 cases were red at their own assertions. One
 * case was green: the old answer without the classes still passes isTheNamedInsideAnswer, which it did before the code
 * and must do after it, as was asked (Q-F7VhosndpR, srq3K2eAAYyf). With the code, after a control run with all 11
 * cases green, each mutation run alone and put back before the next:
 *   M1.  the tool lets a record naming an untracked or ignored path go (src/shared/what-a-record-names-inside.ts):
 *        the untracked-or-ignored case red;
 *   M2.  the tool lets a record naming a path it could not compare go: the could-not-compare case red;
 *   M3.  the tool keeps a worktree whose record names a path no longer there: the missing-path case and the keep-ref
 *        half of the no-branch case red;
 *   M4.  the tool takes any HEAD as held (tools/remove-a-worktree.mjs): the no-branch case red;
 *   M5.  the tool reads only refs under refs/keep/: the folder-only, new-branch, missing-path, modified-file and guard
 *        cases red;
 *   M6.  the tool does not compare comparedWith with HEAD: the other-commit case red;
 *   M7.  the tool removes a branch-held named worktree without --even-so: the folder-only case red;
 *   M8.  the tool names no record that names a missing path: the missing-path case red;
 *   M9.  the tool skips the check of work outside the commit for a named worktree: the modified-file case red;
 *   M10. the shape check asks for comparedWith (tools/what-names-files-inside.mjs): the old-answer and other-commit
 *        cases red;
 *   M11. the shape check takes any object as hiddenCiters: the not-the-door's-classes case red;
 *   M12. the branch check runs git without the guard: the guard case red.
 */
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { GUARDED_GIT_OPTIONS } from '../src/config/guarded-git.mjs'

const tool = fileURLToPath(new URL('../tools/remove-a-worktree.mjs', import.meta.url))
let root: string
let repository: string
let tree: string
let env: NodeJS.ProcessEnv
let office: Server
let api: string
let body: unknown
let asked: number

type Classes = 'theFolderOnly' | 'trackedFilesOnly' | 'aPathNotThere' | 'anotherPath' | 'notCompared'
const noHiddenRecord = { theFolderOnly: 0, trackedFilesOnly: 0, aPathNotThere: 0, anotherPath: 0, notCompared: 0 }

function git(...args: string[]) {
  const result = spawnSync('git', args, { env, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

/** The worktree's HEAD as git gives it now, so an answer is compared with the commit the worktree has. */
function head() { return git('-C', tree, 'rev-parse', 'HEAD') }

/** A commit made in the detached worktree, which no branch, keep ref or tag contains. */
function aCommitOnNoBranch() {
  writeFileSync(join(tree, 'later.txt'), 'Synthetic later work, committed.\n')
  git('-C', tree, 'add', '--', 'later.txt')
  git('-C', tree, 'commit', '-q', '-m', 'Synthetic commit on no branch')
  return head()
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'branch-held-worktree-test-'))
  const home = join(root, 'home')
  mkdirSync(home)
  env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Test builder', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test builder', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    MOLE_OFFICE_AGENT: 'test-worktree-remover', MOLE_OFFICE_SESSION: 'test-removal-run',
    MOLE_OFFICE_WORKSPACE: 'test-project' }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'MOLE_OFFICE_PORT', 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[key]
  // A MADE-UP KEY, because the tool asks the office only with one (wave 13s round 118). The stand-in office does not read it.
  // With the tool refusing every run that gives no --answer, key or not, 10 of these 11 cases went red.
  env.MOLE_AGENT_KEY = 'made-up-test-key'
  repository = join(root, 'repository')
  tree = join(root, 'tree with spaces')
  git('init', '-q', repository)
  writeFileSync(join(repository, 'tracked.txt'), 'Synthetic tracked file.\n')
  git('-C', repository, 'add', '--', 'tracked.txt')
  git('-C', repository, 'commit', '-q', '-m', 'Synthetic root')
  // Detached at the commit the repository's first branch holds: a branch contains HEAD until a case commits on it.
  git('-C', repository, 'worktree', 'add', '-q', '--detach', tree)
  asked = 0
  body = null
  office = createServer((req, reply) => {
    req.resume()
    asked += 1
    reply.writeHead(200, { 'content-type': 'application/json' })
    reply.end(JSON.stringify(body))
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterEach(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(root, { recursive: true, force: true })
})

/** One listed readable record, put in `names` by the door. */
function readable(names: Classes | undefined, id = 'test-readable-record') {
  return { id, kind: 'report', title: `Synthetic record ${id}`,
    paths: [{ where: 'data.blocks[#synthetic].path', path: join(tree, 'tracked.txt') }],
    ...(names === undefined ? {} : { names }) }
}

/** The door's answer, compared with `comparedWith`, with `hidden` counting the records the caller may not read. */
function compared(records: unknown[], hidden: Partial<typeof noHiddenRecord> = {}, comparedWith = head()) {
  const hiddenCiters = { ...noHiddenRecord, ...hidden }
  return { folder: tree, records, hiddenCount: Object.values(hiddenCiters).reduce((sum, one) => sum + one, 0), hiddenCiters,
    comparedWith, notComparedBecause: null, leftOut: [], scope: 'Synthetic scope of a stand-in office.', says: 'Synthetic words of a stand-in office.' }
}

function remove(args: string[] = [], more: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; output: string }> {
  return new Promise((done, bad) => {
    const child = spawn(process.execPath, [tool, tree, ...args], {
      cwd: root, env: { ...env, MOLE_OFFICE_API: api, ...more }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (bytes) => { output += String(bytes) })
    child.stderr.on('data', (bytes) => { output += String(bytes) })
    child.on('error', bad)
    child.on('close', (code) => done({ code, output }))
  })
}

const evenSo = ['--even-so', 'Synthetic: a branch holds every tracked file.']

it('removes a branch-held worktree that records name only by its folder or its tracked files, with --even-so, and not without it', async () => {
  for (const answer of [
    compared([], { theFolderOnly: 1, trackedFilesOnly: 1 }),
    compared([readable('theFolderOnly'), readable('trackedFilesOnly', 'test-second-record')]),
  ]) {
    body = answer
    const kept = await remove()
    expect(kept.code, kept.output).toBe(2)
    expect(kept.output).toContain('Nothing was removed: 2 records name files inside')
    expect(kept.output).toContain('To proceed, give --even-so')
    expect(existsSync(tree)).toBe(true)
  }
  body = compared([readable('theFolderOnly')], { theFolderOnly: 1, trackedFilesOnly: 1 })
  const out = await remove(evenSo)
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(git('-C', repository, 'worktree', 'list', '--porcelain')).not.toContain(tree)
  // Each class is said with the door's name for it, beside the record it is about and in the count of the hidden ones.
  expect(out.output).toMatch(/test-readable-record \(report\)[^\n]*\n[^\n]*\n[^\n]*\(theFolderOnly\)/)
  const hiddenLine = out.output.split('\n').find((line) => line.includes('2 records you may not read')) ?? ''
  for (const key of ['(theFolderOnly)', '(trackedFilesOnly)']) expect(hiddenLine).toContain(key)
  expect(out.output).toContain(`Removed worktree ${tree}`)
})

it('keeps a named worktree whose HEAD no branch or keep ref holds, with --even-so, and a tag does not hold it', async () => {
  const later = aCommitOnNoBranch()
  const answers = [
    compared([], { theFolderOnly: 1 }),
    compared([], { trackedFilesOnly: 2 }),
    compared([readable('theFolderOnly')]),
    compared([readable('aPathNotThere')]),
  ]
  for (const answer of answers) {
    body = answer
    const out = await remove(evenSo)
    expect(out.code, out.output).toBe(2)
    expect(out.output).toContain(`Its HEAD ${later.slice(0, 12)} is on no branch, keep ref or main; put a branch on it first.`)
    expect(existsSync(tree)).toBe(true)
  }
  git('-C', repository, 'tag', 'synthetic-tag', later)
  git('-C', repository, 'update-ref', 'refs/remotes/synthetic/later', later)
  body = answers[0]
  const tagged = await remove(evenSo)
  expect(tagged.code, tagged.output).toBe(2)
  expect(tagged.output).toContain('is on no branch, keep ref or main')
  expect(existsSync(tree)).toBe(true)
  git('-C', repository, 'update-ref', 'refs/keep/synthetic-later', later)
  const held = await remove(evenSo)
  expect(held.code, held.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
})

it('removes a named worktree whose HEAD a new branch holds', async () => {
  const later = aCommitOnNoBranch()
  git('-C', repository, 'branch', 'synthetic-branch', later)
  body = compared([readable('trackedFilesOnly')], { theFolderOnly: 1 })
  const out = await remove(evenSo)
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(git('-C', repository, 'rev-parse', 'synthetic-branch')).toBe(later)
})

it('keeps a branch-held worktree, with --even-so, when a readable or a hidden record names an untracked or ignored path', async () => {
  for (const [answer, words] of [
    [compared([readable('trackedFilesOnly'), readable('anotherPath', 'test-untracked-record')]), 'test-untracked-record'],
    [compared([], { theFolderOnly: 1, anotherPath: 1 }), '(anotherPath)'],
  ] as const) {
    body = answer
    const out = await remove(evenSo)
    expect(out.code, out.output).toBe(2)
    expect(out.output).toContain('Nothing was removed:')
    expect(out.output.slice(out.output.indexOf('Nothing was removed:'))).toContain(words)
    expect(existsSync(tree)).toBe(true)
  }
})

it('keeps a branch-held worktree when a record names a path the office could not compare', async () => {
  for (const [answer, words] of [
    [compared([readable('notCompared', 'test-uncompared-record')]), 'test-uncompared-record'],
    [compared([], { notCompared: 1 }), '(notCompared)'],
  ] as const) {
    body = answer
    const out = await remove(evenSo)
    expect(out.code, out.output).toBe(2)
    expect(out.output.slice(out.output.indexOf('Nothing was removed:'))).toContain(words)
    expect(existsSync(tree)).toBe(true)
  }
})

it('removes a branch-held worktree whose records name a path that is no longer there, and names those records', async () => {
  body = compared([readable('aPathNotThere', 'test-missing-record'), readable('theFolderOnly', 'test-folder-record')], { aPathNotThere: 1 })
  const out = await remove(evenSo)
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  const afterRemoval = out.output.slice(out.output.indexOf(`Removed worktree ${tree}`))
  expect(afterRemoval).toContain('test-missing-record')
  expect(afterRemoval).toContain('1 you may not read')
  expect(afterRemoval).not.toContain('test-folder-record')
})

it('keeps a branch-held worktree when the answer was compared with another commit, not compared, or does not class every record', async () => {
  const before = head()
  const later = aCommitOnNoBranch()
  git('-C', repository, 'update-ref', 'refs/keep/synthetic-later', later)
  body = compared([readable('theFolderOnly')], {}, before)
  const stale = await remove(evenSo)
  expect(stale.code, stale.output).toBe(2)
  expect(stale.output).toContain(before.slice(0, 12))
  expect(stale.output).toContain(later.slice(0, 12))
  expect(existsSync(tree)).toBe(true)
  const notCompared = { ...compared([readable(undefined)]), comparedWith: null, hiddenCiters: null, notComparedBecause: 'Synthetic: git did not answer.' }
  const oldDoor: Record<string, unknown> = { ...compared([readable(undefined)]) }
  for (const key of ['comparedWith', 'hiddenCiters', 'notComparedBecause']) delete oldDoor[key]
  const tooFew = { ...compared([], { theFolderOnly: 1 }), hiddenCount: 2 }
  for (const [answer, words] of [
    [notCompared, 'Synthetic: git did not answer.'],
    [oldDoor, 'Nothing was removed: 1 record names files inside'],
    [{ ...oldDoor, records: [], hiddenCount: 1 }, 'Nothing was removed: 1 record names files inside'],
    [tooFew, 'Nothing was removed: 2 records name files inside'],
  ] as const) {
    body = answer
    const out = await remove(evenSo)
    expect(out.code, out.output).toBe(2)
    expect(out.output).toContain(words)
    expect(existsSync(tree)).toBe(true)
  }
})

it('refuses a branch-held worktree with a modified tracked file after the records allow it, exit 1', async () => {
  writeFileSync(join(tree, 'tracked.txt'), 'Synthetic work not committed.\n')
  body = compared([], { theFolderOnly: 1 })
  const out = await remove(evenSo)
  expect(out.code, out.output).toBe(1)
  expect(out.output).toContain('contains modified or untracked files')
  expect(out.output).toContain('M tracked.txt')
  expect(existsSync(tree)).toBe(true)
})

it('refuses an answer whose classes are not the door\'s, before it reads git', async () => {
  const good = compared([readable('theFolderOnly')], { theFolderOnly: 1 })
  for (const answer of [
    { ...good, records: [readable('everything' as Classes)] },
    { ...good, hiddenCiters: { ...good.hiddenCiters, anotherPath: -1 } },
    { ...good, hiddenCiters: { theFolderOnly: 1 } },
    { ...good, hiddenCiters: { ...good.hiddenCiters, aSixthClass: 0 } },
    { ...good, comparedWith: 'HEAD' },
    { ...good, notComparedBecause: 5 },
  ]) {
    body = answer
    const out = await remove(evenSo)
    expect(out.code, out.output).toBe(1)
    expect(out.output).toContain('did not give the named-inside answer')
    expect(existsSync(tree)).toBe(true)
  }
  expect(asked).toBe(6)
})

it('still reads an answer without the classes as the named-inside answer, so the scratch sweep reads as it did', async () => {
  const { isTheNamedInsideAnswer, whatNamesFilesInside } = await import('../tools/what-names-files-inside.mjs')
  const before115 = { folder: tree, records: [readable(undefined)], hiddenCount: 1, leftOut: [], scope: 'Synthetic scope.', says: 'Synthetic words.' }
  expect(isTheNamedInsideAnswer(before115, tree)).toBe(true)
  expect(isTheNamedInsideAnswer({ ...before115, comparedWith: null, hiddenCiters: null, notComparedBecause: null }, tree)).toBe(true)
  expect(whatNamesFilesInside(before115)).toBe(`2 records name files inside ${tree}, 1 you can read and 1 you may not.`)
})

it('runs every git call guarded, the branch check too, with no global or system config', async () => {
  const bin = join(root, 'bin')
  const calls = join(root, 'git-calls.log')
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { env, encoding: 'utf8' }).stdout.trim()
  mkdirSync(bin)
  // A stand-in git first on PATH writes down each call, with the two config variables git was given, and runs git.
  writeFileSync(join(bin, 'git'), '#!/bin/sh\n' +
    `{ printf 'GIT_CONFIG_GLOBAL=%s\\tGIT_CONFIG_NOSYSTEM=%s\\t' "$GIT_CONFIG_GLOBAL" "$GIT_CONFIG_NOSYSTEM"; for word in "$@"; do printf '%s\\t' "$word"; done; printf '\\n'; } >> '${calls}'\n` +
    `exec '${realGit}' "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  writeFileSync(join(root, 'global-config'), '[core]\n\thooksPath = /nowhere-synthetic\n')
  body = compared([], { theFolderOnly: 1 })
  const out = await remove(evenSo, { PATH: `${bin}:${String(process.env.PATH)}`, GIT_CONFIG_GLOBAL: join(root, 'global-config'), GIT_CONFIG_NOSYSTEM: '' })
  expect(out.code, out.output).toBe(0)
  const made = readFileSync(calls, 'utf8').trimEnd().split('\n').map((line) => line.split('\t').slice(0, -1))
  expect(made.some((call) => call.includes('for-each-ref') && call.includes('--contains'))).toBe(true)
  expect(made.some((call) => call.includes('worktree') && call.includes('remove'))).toBe(true)
  for (const call of made) {
    expect(call.slice(0, 2), call.join(' ')).toEqual(['GIT_CONFIG_GLOBAL=/dev/null', 'GIT_CONFIG_NOSYSTEM=1'])
    expect(call.slice(2, 2 + GUARDED_GIT_OPTIONS.length), call.join(' ')).toEqual([...GUARDED_GIT_OPTIONS])
  }
})
