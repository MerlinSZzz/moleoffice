// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { history, logRoots, readLogs } from '../tools/queue-history.mjs'
import { DATA_ROOT } from '../src/config/settings.mjs'
import { ownLinesOn, linesMeetOn } from '../tools/merge-tool/lines.mjs'

// These excerpts are copied, not reconstructed, from the three named said.txt logs.
// Only headers, the bus declaration, cleanup, complete fast-forward lines and merged replies were selected.
// The readable logs contain no receipt for the withdrawal stated in the round 8 brief.
const realLogs = ['sJe2qm8iIHXL', 'uCaaoAjLgxoq', 'Gfy9L9DSD6OJ'].map((run) => ({
  path: `captured/${run}/said.txt`, text: readFileSync(new URL(`./fixtures/queue-history/${run}.txt`, import.meta.url), 'utf8'),
}))
const from = '2026-10-08 01:07:00'
it('reports each real rider from its own log evidence, never from the leader fast-forward', () => {
  const early = history(realLogs, from, '2026-10-08 02:13:00').buses[0]!.outcomes
  expect(early.map((one: { outcome: string }) => one.outcome)).toEqual(['landed', 'not known from the logs', 'not known from the logs'])
  const out = history(realLogs, from, '2026-10-08 02:17:00').buses[0]!.outcomes
  expect(out[0]).toMatchObject({ entry: 'hWTDEGrJQLBM', outcome: 'landed', at: '2026-10-08 02:12:50', mainHash: '13c7308e4a72bd175e656ceb3d8cccd3c71e9b85' })
  expect(out[1]).toMatchObject({ entry: 'be6wb4AnQNGn', outcome: 'not known from the logs', at: null, observedAt: '2026-10-08 02:15:23', history: [{ outcome: 'back to judged', at: null, observedAt: '2026-10-08 02:13:17' }, { outcome: 'not known from the logs' }] })
  expect(out[1]).not.toHaveProperty('mainHash')
  expect(out[2]).toMatchObject({ entry: '26z3ZMJAfjEz', outcome: 'landed', at: '2026-10-08 02:15:56', mainHash: '056e65c7946d58b6e151e5865ae0747ee537a582' })
  // Synthetic extension exercises the server's withdrawal sentence; it is not evidence about the real bus.
  const synthetic = { path: 'synthetic-withdrawal', text: `2026-10-08 02:14:01 Merge entry be6wb4AnQNGn was withdrawn by the agent quill (synthetic test), so its merge tool had nothing left to do and the office stopped it by its process group.
` }
  expect(history([...realLogs, synthetic], from, '2026-10-08 02:17:00').buses[0]!.outcomes[1]).toMatchObject({ outcome: 'withdrawn', by: 'the agent quill', at: null, observedAt: '2026-10-08 02:14:01', history: [{ outcome: 'back to judged' }, { outcome: 'withdrawn' }] })
})

it('keeps the known landing receipt and withdrawal actor when cleanup repeats their final states', () => {
  // Synthetic cleanup observations exercise later notices, not additional evidence about the real bus.
  const synthetic = { path: 'synthetic-final-observations', text: `2026-10-08 02:14:01 Merge entry be6wb4AnQNGn was withdrawn by the agent quill (synthetic test), so its merge tool had nothing left to do and the office stopped it by its process group.
2026-10-08 02:16:01 sandbox of merge entry hWTDEGrJQLBM, which is merged
2026-10-08 02:16:02 sandbox of merge entry be6wb4AnQNGn, which is withdrawn
` }
  const out = history([...realLogs, synthetic], from, '2026-10-08 02:17:00').buses[0]!.outcomes
  expect(out[0]).toMatchObject({ outcome: 'landed', at: '2026-10-08 02:12:50', mainHash: '13c7308e4a72bd175e656ceb3d8cccd3c71e9b85' })
  expect(out[1]).toMatchObject({ outcome: 'withdrawn', observedAt: '2026-10-08 02:14:01', by: 'the agent quill' })
})

it('keeps two identical occurrences inside one log and matches their ordinal occurrences in a copy', () => {
  const text = `2026-10-08 01:08:00 merge entry synthetic (git) is testing; lane synthetic
2026-10-08 01:09:00 the bus passes over merge entry other: the commits of other do not go onto this entry's result without a conflict.
2026-10-08 01:09:00 the bus passes over merge entry other: the commits of other do not go onto this entry's result without a conflict.
2026-10-08 01:09:01 tested alone: synthetic
`
  const out = history([{ path: 'original', text }, { path: 'copy', text }], from, '2026-10-08 01:30:00')
  expect(out.buses[0]!.passedOver).toHaveLength(2)
  expect(out.totals.passOvers).toEqual({ 'git conflict': 2 })
  expect(out.buses[0]!.passedOver.map((one: { sources: string[] }) => one.sources)).toEqual([['original', 'copy'], ['original', 'copy']])
})

it('takes the run-log default from DATA_ROOT, keeps explicit choices and reports missing folders', () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-history-roots-'))
  try {
    const roots = logRoots({}, root)
    expect(roots).toEqual({ queueRoot: join(root, '.cache/mole-office/merge-queue'), runsRoot: join(DATA_ROOT, '.logs', 'runs') })
    expect(logRoots({ '--queue-root': join(root, 'queue') }).runsRoot).toBe(join(DATA_ROOT, '.logs', 'runs'))
    expect(logRoots({ '--runs-root': join(root, 'explicit') }, root).runsRoot).toBe(join(root, 'explicit'))
    const missingRuns = join(root, 'missing-runs')
    const result = spawnSync(process.execPath, ['tools/queue-history.mjs', '--from', from, '--to', '2026-10-08 01:30:00', '--runs-root', missingRuns], { encoding: 'utf8', env: { ...process.env, HOME: root } })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`Cannot read ${missingRuns}`)
    expect(JSON.parse(result.stdout).logRoots).toEqual({ ...roots, runsRoot: missingRuns })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('names empty log folders without calling them unreadable', () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-history-empty-'))
  try {
    const queueRoot = join(root, 'queue'), runsRoot = join(root, 'runs')
    mkdirSync(queueRoot); mkdirSync(runsRoot)
    expect(readLogs(queueRoot, runsRoot)).toEqual({ logs: [], unreadable: [], empty: [{ path: queueRoot, name: 'the-merger.log' }, { path: runsRoot, name: 'said.txt' }] })
    const result = spawnSync(process.execPath, ['tools/queue-history.mjs', '--from', from, '--to', '2026-10-08 01:30:00', '--queue-root', queueRoot, '--runs-root', runsRoot], { encoding: 'utf8', env: { ...process.env, HOME: root } })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`No said.txt logs in ${runsRoot}`)
    expect(JSON.parse(result.stdout).emptyLogFolders).toEqual([{ path: queueRoot, name: 'the-merger.log' }, { path: runsRoot, name: 'said.txt' }])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('judges parts.ts by file when any compared version contains a code line', () => {
  const repo = mkdtempSync(join(tmpdir(), 'mole-joining-file-'))
  const path = 'src/shared/words/parts.ts'
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY']) delete env[key]
    const git = (...args: string[]) => execFileSync('git', ['-c', 'gc.auto=0', '-C', repo, ...args], { env, encoding: 'utf8' }).trim()
    git('init', '-q'); git('config', 'user.name', 'Temporary test'); git('config', 'user.email', 'test@example.invalid')
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    const commit = (text: string) => { writeFileSync(join(repo, path), text); git('add', '.'); git('commit', '-qm', 'Synthetic joining-file test'); return git('rev-parse', 'HEAD') }
    const base = commit("export * from './a'\n\n// gap\n\nexport * from './z'\n")
    const own = commit("export * from './a'\nexport * from './b'; runCode()\n\n// gap\n\nexport * from './z'\n")
    git('checkout', '-q', '--detach', base)
    const onto = commit("export * from './a'\n\n// gap\n\nexport * from './y'\nexport * from './z'\n")
    git('cherry-pick', own)
    const joined = git('rev-parse', 'HEAD')
    expect(ownLinesOn(repo, { base, commit: own, path, onto, joined })).toEqual({ held: false, why: `${path} is not a plain joining file; judge it by file` })
    expect(linesMeetOn(repo, path, base, { base, commit: own }, { base, commit: onto })).toEqual({ meet: true, why: `${path} is not a plain joining file; judge it by file` })
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
