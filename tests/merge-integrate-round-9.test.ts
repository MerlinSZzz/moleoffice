// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real temporary git trees and real npm builds. Office and sandbox boundaries below are explicit stubs. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any>, steps: [] as { name: string; facts: Record<string, any>; detail: any }[], builds: [] as string[], sandboxes: 0, counted: [] as unknown[][] }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('./the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandbox') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (words: string) => { throw Error(words) }, log: (words: string) => boundary.logs.push(words),
  stamp: () => '2026-10-08 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { files: Object.entries(entry.machine.judged).map(([path, hash]) => ({ path, hash })) } }),
  theSandbox: async () => { boundary.sandboxes++; return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandbox') } },
  step: async (name: string, facts: Record<string, any>, detail: any) => { boundary.steps.push({ name, facts, detail }); return { step: name, facts } },
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  countAGateMet: async (...args: unknown[]) => { boundary.counted.push(args); return { counted: true } },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    // The boundary is stubbed, not the build: execute the fixture's actual npm script in its joined clone.
    boundary.builds.push(options.cwd)
    const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', timeout: options.timeoutMs })
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, 'sandbox-start: started {"synthetic":true}\n' + result.stdout + result.stderr)
    return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n'), ...(result.error ? { error: result.error.message } : {}) }
  },
}))
import { integrateGit as replayGitFixture } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })

function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function write(root: string, path: string, text: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
function commit(root: string, message: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }
function fixture() {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(root, 'package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
  write(root, 'build.cjs', "process.exit(0)\n")
  write(root, 'src/shared.txt', 'original\n')
  const base = commit(root, 'Synthetic original main')
  return { root, base }
}
function entry(root: string, base: string, tip: string) { return { changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } } }
beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'merge-integrate-round-9-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}; boundary.builds = []; boundary.sandboxes = 0; boundary.counted = []
})
afterEach(() => {
  for (const name of [OWNER_CONTENT, INTEGRATED_BUILD]) delete process.env[name]
  rmSync(boundary.folder, { recursive: true, force: true })
})
// The two integrate guards with a row of their own (wave 13r round L). Each is set here only through the environment.
const OWNER_CONTENT = 'MOLE_OFFICE_GATE_OWNER_CONTENT'
const INTEGRATED_BUILD = 'MOLE_OFFICE_GATE_INTEGRATED_BUILD'
/** Synthetic clean git join: each side builds alone; their combined configuration has a duplicate key. */
function aJoinThatDoesNotBuild() {
  const { root, base } = fixture()
  const build = "const fs = require('fs'); const a = fs.readFileSync('src/shared.txt','utf8'); const b = fs.readFileSync('src/own.txt','utf8'); if (a.includes('main key') && b.includes('entry key')) { console.error('src/config.ts(1,1): error TS1117: duplicate key'); console.error('src/settings.ts(2,1): error TS2322: union changed'); for (let i=0;i<20;i++) console.log('later build output '+i); process.exit(1) }\n"
  write(root, 'src/own.txt', 'no key\n'); write(root, 'build.cjs', build); const sealedBase = commit(root, 'Synthetic joining build')
  git(root, 'switch', '-qc', 'entry'); write(root, 'src/own.txt', 'entry key\n'); const tip = commit(root, 'Synthetic entry key')
  expect(spawnSync('npm', ['run', 'build'], { cwd: root }).status).toBe(0)
  git(root, 'switch', '-q', 'main'); write(root, 'src/shared.txt', 'main key\n'); const main = commit(root, 'Synthetic main key')
  expect(spawnSync('npm', ['run', 'build'], { cwd: root }).status).toBe(0)
  return { root, base, sealedBase, tip, main }
}
/** An entry that adds a made-up address to a file that ships, which the owner-content guard refuses at block. */
function anEntryWithOwnerContent() {
  const { root, base } = fixture()
  const address = ['tern', 'corvidmail.net'].join('@')
  git(root, 'switch', '-qc', 'entry'); write(root, 'src/x.mjs', `// Asked of ${address}.\nexport const x = 1\n`); const tip = commit(root, 'Synthetic owner content')
  git(root, 'switch', '-q', 'main')
  return { root, base, tip }
}

it('rebases only the entry commits when a newer main is already in its tip but the seal has an old base', async () => {
  const { root, base } = fixture()
  git(root, 'switch', '-qc', 'entry'); write(root, 'src/own.txt', 'entry alone\n'); commit(root, 'Synthetic entry commit')
  git(root, 'switch', '-q', 'main'); write(root, 'src/shared.txt', 'first newer main\n'); const newer = commit(root, 'Synthetic newer main already in the entry')
  git(root, 'switch', '-q', 'entry'); git(root, 'rebase', 'main'); const tip = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main'); write(root, 'src/shared.txt', 'main changed again\n'); const main = commit(root, 'Synthetic latest main')
  const submitted = entry(root, base, tip)
  const result = await integrateGit(submitted)
  expect(result.step).toBe('integrated')
  const clone = boundary.state.integrated.clone
  expect(git(clone, 'log', '--format=%s', `${main}..HEAD`)).toBe('Synthetic entry commit')
  expect(readFileSync(join(clone, 'src/shared.txt'), 'utf8')).toBe('main changed again\n')
  expect(readFileSync(join(clone, 'src/own.txt'), 'utf8')).toBe('entry alone\n')
  expect(boundary.logs.join('\n')).toContain(`rebase upstream ${newer}: the sealed fork base ${base} is its ancestor`)
  expect(boundary.state.integrated.base).toBe(base)
  expect(submitted.changeset.base).toBe(base)
})

it('keeps the sealed fork base as upstream for an entry that has not rebased onto newer main', async () => {
  const { root, base } = fixture()
  git(root, 'switch', '-qc', 'entry'); write(root, 'src/own.txt', 'entry alone\n'); const tip = commit(root, 'Synthetic unre-based entry')
  git(root, 'switch', '-q', 'main'); write(root, 'src/shared.txt', 'main alone\n'); const main = commit(root, 'Synthetic independent main')
  expect((await integrateGit(entry(root, base, tip))).step).toBe('integrated')
  const clone = boundary.state.integrated.clone
  expect(git(clone, 'log', '--format=%s', `${main}..HEAD`)).toBe('Synthetic unre-based entry')
  expect(readFileSync(join(clone, 'src/shared.txt'), 'utf8')).toBe('main alone\n')
  expect(boundary.logs.join('\n')).toContain(`rebase upstream ${base}: it is the sealed fork base`)
})

it('refuses a sealed fork base that is not an ancestor of the merge-base before creating the sandbox', async () => {
  const { root, base } = fixture()
  git(root, 'switch', '-qc', 'entry'); write(root, 'src/own.txt', 'first\n'); const falseBase = commit(root, 'Synthetic branch-only base')
  write(root, 'src/own.txt', 'second\n'); const tip = commit(root, 'Synthetic branch tip')
  git(root, 'switch', '-q', 'main')
  await expect(integrateGit(entry(root, falseBase, tip))).rejects.toThrow(`The sealed fork base ${falseBase} is not an ancestor of merge-base ${base}`)
  expect(boundary.sandboxes).toBe(0); expect(boundary.steps).toEqual([])
  expect(git(root, 'rev-parse', 'HEAD')).toBe(base)
})

// At block, the build guard's default, the guard sends the entry back and counts the encounter at block (wave 13r round L).
it('reports the build guard immediately with its first errors instead of sending a broken joined tree to reinspection', async () => {
  const { root, base, sealedBase, tip, main } = aJoinThatDoesNotBuild()
  const result = await integrateGit(entry(root, sealedBase, tip))
  expect(result.step).toBe('guard-failed')
  expect(result.facts).toMatchObject({ guard: 'build', files: ['src/own.txt'], detail: expect.stringContaining('error TS1117: duplicate key') })
  expect(result.facts.detail).toContain('error TS2322: union changed')
  expect(theMoveAStepMakes('integrating', { step: result.step })).toEqual({ move: 'bounce', reason: 'guard' })
  expect(boundary.steps.map(one => one.name)).toEqual(['guard-failed'])
  expect(boundary.state.integrated).toBeUndefined()
  expect(boundary.builds).toEqual([join(boundary.folder, 'sandbox', 'work', 'clone')])
  expect(git(root, 'rev-parse', 'HEAD')).toBe(main)
  expect(base).not.toBe(sealedBase)
  expect(boundary.counted).toEqual([['integrated-tree-builds', 'block']])
})

// THE BUILD GUARD AT OFF (wave 13r round L): the entry is not sent back here. It is reported integrated, its state keeps
// the failed build for the test step, which reports it red, and the encounter is counted at off.
// Mutation: ignore the position, or keep no build in the state, and this turns red.
it('lets an integrated tree that does not build go on at off, keeps its failed build in the state, and counts it at off', async () => {
  const { root, sealedBase, tip } = aJoinThatDoesNotBuild()
  process.env[INTEGRATED_BUILD] = 'off'
  const result = await integrateGit(entry(root, sealedBase, tip))
  expect(result.step).toBe('integrated')
  expect(boundary.steps.map(one => one.name)).toEqual(['integrated'])
  const log = join(boundary.folder, 'logs', 'integrate-build.log')
  expect(boundary.state.integrated.build).toEqual({ passed: false, exit: 1, log })
  expect(readFileSync(log, 'utf8')).toContain('error TS1117: duplicate key')
  expect(boundary.counted).toEqual([['integrated-tree-builds', 'off']])
  expect(boundary.logs.some(line => line.includes('integrated-tree-builds') && line.includes(log))).toBe(true)
})

// A position the build guard's row does not allow stops the tool and names the setting; nothing is sent or counted.
it('stops on a build guard position its row does not allow, and sends and counts nothing', async () => {
  const { root, sealedBase, tip } = aJoinThatDoesNotBuild()
  process.env[INTEGRATED_BUILD] = 'remind'
  await expect(integrateGit(entry(root, sealedBase, tip))).rejects.toThrow(new RegExp(`${INTEGRATED_BUILD} is "remind"`))
  expect(boundary.steps).toEqual([])
  expect(boundary.counted).toEqual([])
  expect(boundary.state.integrated).toBeUndefined()
})

// THE OWNER-CONTENT GUARD (wave 13r round L). At block, its default, it refuses the entry, as it did before its row; at
// off it lets the entry go on and names each hit it let through, in the state the tested step reads. The integrated
// step's own facts are the reminders alone, at both positions.
// Mutation: ignore the position, or leave the hits out of the state, and this turns red.
it('refuses owner content at block, lets it go on at off naming each hit, and counts each position', async () => {
  const { root, base, tip } = anEntryWithOwnerContent()
  const refused = await integrateGit(entry(root, base, tip))
  expect(refused.step).toBe('guard-failed')
  expect(refused.facts).toMatchObject({ guard: 'owner-content', files: ['src/x.mjs'] })
  expect(boundary.state.integrated).toBeUndefined()
  expect(boundary.counted).toEqual([['owner-content-in-what-ships', 'block']])
  boundary.steps = []; boundary.counted = []
  process.env[OWNER_CONTENT] = 'off'
  const through = await integrateGit(entry(root, base, tip))
  expect(through.step).toBe('integrated')
  expect(boundary.counted).toEqual([['owner-content-in-what-ships', 'off']])
  const said = boundary.state.integrated.ownerContent
  expect(said).toContain('owner-content-in-what-ships')
  expect(said).toContain('src/x.mjs line 1')
  expect(boundary.logs).toContain(said)
  const facts = boundary.steps.find(one => one.name === 'integrated')!.facts
  expect(facts.ownerContent).toEqual({ reminded: 0, byPattern: {}, log: join(boundary.folder, 'logs', 'checks', 'owner-content.json') })
})

it('stops on an owner-content position its row does not allow, and sends and counts nothing', async () => {
  const { root, base, tip } = anEntryWithOwnerContent()
  process.env[OWNER_CONTENT] = 'remind'
  await expect(integrateGit(entry(root, base, tip))).rejects.toThrow(new RegExp(`${OWNER_CONTENT} is "remind"`))
  expect(boundary.steps).toEqual([])
  expect(boundary.counted).toEqual([])
})
