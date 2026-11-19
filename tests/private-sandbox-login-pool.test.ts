// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it } from 'vitest'
import { chmodSync, existsSync, lstatSync, readFileSync, readdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { privatePool } from '../src/server/lib/sandbox-login-addition/pool.mjs'
import { privatePoolFixture as fixture, runPoolStandIn, clearPrivatePoolFixtures, fingerprint, newValue } from './private-sandbox-login-pool-stand.ts'
const helper = new URL('./private-sandbox-login-stand-in.py', import.meta.url).pathname
afterEach(clearPrivatePoolFixtures)
it('does not inspect any pool or start any helper during import or capability checks', () => {
  expect(privatePool().available()).toBe(false)
  const f = fixture(); expect(f.pool.available()).toBe(true); expect(f.tool.execute).not.toHaveBeenCalled()
})
it('uses only fixed add-stdin arguments; adds E and preserves each entry and active bytes', async () => {
  const f = fixture(); const active = readFileSync(f.active); const old = ['A','B','C','D'].map(letter => readFileSync(join(f.root, letter + '.token')))
  expect(await f.pool.add(Buffer.from(newValue))).toEqual({ letter: 'E', sha12: fingerprint(newValue) })
  expect(f.runs[0]).toMatchObject({ executable: '/usr/bin/python3', args: [helper, 'add-stdin', 'invented-owner'] })
  expect(readFileSync(f.active)).toEqual(active)
  expect(old).toEqual(['A','B','C','D'].map(letter => readFileSync(join(f.root, letter + '.token'))))
  const metadata = readFileSync(join(f.root, 'index.json'), 'utf8'); expect(metadata).not.toContain(newValue)
  expect(JSON.parse(metadata).logins.E).toEqual({ sha12: fingerprint(newValue), added: '2026-01-01 12:00', by: 'invented-owner' })
  for (const file of readdirSync(f.root)) expect(lstatSync(join(f.root, file)).mode & 0o777).toBe(0o600)
})
it('does not fill holes and refuses duplicates, exhaustion, unsafe modes and symlinks', async () => {
  const holes = fixture(['A','D']); expect((await holes.pool.add(Buffer.from(newValue))).letter).toBe('E')
  await expect(holes.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ reason: 'PoolDuplicate' })
  const full = fixture(['Z']); await expect(full.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ reason: 'PoolFull' })
  const unsafe = fixture(); chmodSync(join(unsafe.root, 'A.token'), 0o644); await expect(unsafe.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ reason: 'PoolUnsafe' })
  const link = fixture(); symlinkSync(link.active, join(link.root, 'E.token')); const before = readFileSync(link.active)
  await expect(link.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ reason: 'PoolUnsafe' }); expect(readFileSync(link.active)).toEqual(before)
})
it('serializes independent writers with flock and preserves an independent 99 percent switch', async () => {
  const f = fixture(); const first = privatePool({ tool: f.tool }); const second = privatePool({ tool: f.tool })
  const additions = Promise.all([first.add(Buffer.from(newValue)), second.add(Buffer.from('invented-another-value'))])
  const watch = runPoolStandIn(f.root, { executable: '/usr/bin/python3', args: [helper, 'invented-watch-99', 'invented-owner'], input: Buffer.alloc(0) }, '')
  const active = Buffer.from('# invented unrelated line\nCLAUDE_CODE_OAUTH_TOKEN=invented-watch-switch-at-99\n')
  expect((await additions).map(x => x.letter).sort()).toEqual(['E','F']); await watch; expect(readFileSync(f.active)).toEqual(active)
  const index = JSON.parse(readFileSync(join(f.root, 'index.json'), 'utf8')); expect(Object.keys(index.logins)).toEqual(['A','B','C','D','E','F'])
})
it('distinguishes failures before publication from an unknown cross-file commit and never retries', async () => {
  for (const fault of ['create','write','flush','before-rename','after-value','after-index','reply']) {
    const f = fixture(); const active = readFileSync(f.active)
    f.tool.execute.mockImplementation(request => runPoolStandIn(f.root, request, fault))
    await expect(f.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ reason: ['after-value','after-index','reply'].includes(fault) ? 'PoolUnknown' : 'PoolUnsaved' })
    expect(f.tool.execute).toHaveBeenCalledTimes(1); expect(readFileSync(f.active)).toEqual(active)
    expect(readdirSync(f.root).some(file => file.startsWith('.invented-temp-'))).toBe(false)
    if (existsSync(join(f.root, 'E.token'))) expect(readFileSync(join(f.root, 'E.token'), 'utf8')).toBe(newValue + '\n')
  }
})
it('requires verified recovery and rejects misleading success metadata and raw exceptions', async () => {
  const f = fixture(); f.tool.verified.recovery = false
  expect(f.pool.available()).toBe(false)
  await expect(f.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ reason: 'Unavailable' }); expect(f.tool.execute).not.toHaveBeenCalled()
  f.tool.verified.recovery = true
  f.tool.execute.mockResolvedValue({ outcome: 'added', letter: 'E', sha12: '000000000000', confirmed: true })
  await expect(f.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ reason: 'PoolUnknown' })
  f.tool.execute.mockRejectedValue(new Error('invented-raw-private-error'))
  await expect(f.pool.add(Buffer.from(newValue))).rejects.toMatchObject({ message: expect.not.stringContaining('invented-'), reason: 'PoolUnknown' })
})
it('refuses expired, invalid and pre-aborted handoffs before any helper call', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort()
  for (const options of [{signal:controller.signal},{deadline:Date.now()-1},{deadline:NaN},{deadline:Infinity},{deadline:Date.now()+700000}]) {
    await expect(f.pool.add(Buffer.from(newValue), options)).rejects.toMatchObject({reason:'Expired'})
    expect(f.tool.execute).not.toHaveBeenCalled(); expect(f.tool.reconcile).not.toHaveBeenCalled()
  }
})
it('refuses duplicate index keys, index symlinks and unsafe directory protection', async () => {
  const {writeFileSync,rmSync}=await import('node:fs')
  const f=fixture();writeFileSync(join(f.root,'index.json'),'{"version":1,"logins":{},"logins":{}}',{mode:0o600})
  await expect(f.pool.add(Buffer.from(newValue))).rejects.toMatchObject({reason:'PoolUnsafe'})
  const link=fixture();rmSync(join(link.root,'index.json'));symlinkSync(link.active,join(link.root,'index.json'))
  await expect(link.pool.add(Buffer.from(newValue))).rejects.toMatchObject({reason:'PoolUnsafe'})
  const directory=fixture();chmodSync(directory.root,0o755)
  await expect(directory.pool.add(Buffer.from(newValue))).rejects.toMatchObject({reason:'PoolUnsafe'})
})
