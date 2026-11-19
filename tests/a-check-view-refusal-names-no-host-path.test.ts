// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A check-view refusal names a login seed in words, never by its host path.
 * The launcher is inspectorViewStandIn's labelled protocol stand-in, as in the existing
 * answer-mask tests; it starts no model, container or office, and holds no real key.
 * P1 puts seed.host back into the Claude sentence; P2 removes the existence guard before
 * lstatSync in theCodexLogin. Each mutation exposes its path in the refusal again.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { runInside } from '../tools/inspector-sandbox.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'

type View = ReturnType<typeof inspectorViewStandIn>
let view: View | undefined
afterEach(() => { view?.close(); view = undefined })

async function refusal(v: View, runtime: 'claude-code' | 'codex') {
  const argv = runtime === 'codex' ? ['codex', ...FULL_PERMISSIONS.codex!.args, 'exec', '--', 'synthetic task'] : ['synthetic-model']
  const ran = await runInside(v.sandbox, { runtime, label: runtime, cwd: v.work, argv, limitMs: 1000, launcher: v.launcher })
  expect(ran.code).toBeNull()
  expect(v.calls).toHaveLength(0)
  expect(ran.out).toBe('')
  expect(ran.err).toBe('')
  return ran.why
}

describe('a login seed refusal names no host path', () => {
  it('names the Claude seed in words when it holds no access token', async () => {
    view = inspectorViewStandIn()
    const folder = join(view.sandbox.checkDir, 'login-seeds')
    const seed = join(folder, 'claude.json')
    mkdirSync(folder)
    writeFileSync(seed, JSON.stringify({ claudeAiOauth: {} }), { mode: 0o600 })
    Object.assign(view.sandbox, { loginSeeds: [{ host: seed, container: '/login/claude.json', target: '.claude/.credentials.json' }] })
    const why = await refusal(view, 'claude-code')
    expect.soft(why).not.toContain(seed)
    expect.soft(why).not.toContain(view.root)
    expect.soft(why).not.toContain('ENOENT')
    expect(why).toBe("The check's Claude login seed holds no access token this tool can read, " +
      'so what the view answers could not be masked. Nothing was started.')
  })
  it.each(['file', 'folder'] as const)('names the missing Codex seed %s in words before lstatSync can expose its path', async (missing) => {
    view = inspectorViewStandIn()
    const folder = join(view.sandbox.checkDir, 'login-seeds')
    const seed = join(folder, 'codex.json')
    if (missing === 'file') mkdirSync(folder)
    Object.assign(view.sandbox, { loginSeeds: [{ host: seed, container: '/login/codex.json', target: '.codex/auth.json' }] })
    const why = await refusal(view, 'codex')
    expect.soft(why).not.toContain(seed)
    expect.soft(why).not.toContain(view.root)
    expect.soft(why).not.toContain('ENOENT')
    expect(why).toBe(`${missing === 'folder' ? "The folder of the check's login seed" : "The check's login seed"} is missing, ` +
      'so what the view answers could not be masked. Nothing was started.')
  })
})
