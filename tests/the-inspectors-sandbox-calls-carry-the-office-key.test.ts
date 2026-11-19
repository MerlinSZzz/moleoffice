// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The controller owns cleanup; runInside passes host authority only to its launcher. */
import { expect, it } from 'vitest'
import { runInside } from '../tools/inspector-sandbox.mjs'
import { inspectorFixture } from './inspector-tool-fixture.ts'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'

it.each([true, false])('passes only the supplied host key to its check-view launcher (key present: %s)', async supplied => {
  const f = inspectorViewStandIn()
  const office = await inspectorFixture()
  const synthetic = 'synthetic-key-never-a-real-credential'
  const asked = { ...f.sandbox.asked, api: office.api, ...(supplied ? { officeKey: () => synthetic } : {}) }
  try {
    const ran = await runInside({ ...f.sandbox, asked }, { label: 'probe', cwd: f.work, argv: ['true'], limitMs: 1000, launcher: f.launcher })
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(f.calls).toHaveLength(1)
    const given = f.calls[0]!
    expect(given.asked).toBe(asked)
    expect(typeof given.asked.officeKey === 'function' ? given.asked.officeKey() === synthetic : false).toBe(supplied)
    expect(JSON.stringify([given.words, given.command, given.spec])).not.toContain(synthetic)
    expect(given.words).toContain('--check-view')
    expect(given.words).toContain('--no-office-variables')
    expect(given.words).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    expect(office.state.requests.filter(request => request.path.startsWith('/api/resources'))).toEqual([])
    expect(ran.why).toBeNull()
  } finally { f.close(); await office.close() }
})
