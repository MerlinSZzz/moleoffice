// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The move refuses every unsafe observation before reserving or stopping anything. */
import { expect, it } from 'vitest'

const implementation = new URL('../tools/stable/data-folder-move-preflight.mjs', import.meta.url).href
const load = () => import(/* @vite-ignore */ implementation)
function facts() {
  const scope = { version: 1, action: 'stop-to-move-the-data-folder', database: '/fixture/checkout/data/invented.db', port: 29991,
    checkout: '/fixture/checkout', targetFolder: '/fixture/private-data', targetMode: '700',
    backup: { path: '/fixture/backup.db', sha256: Buffer.alloc(32, 7).toString('base64') } }
  return { scope, state: 'available', observed: structuredClone(scope), backupExists: true, backupSha256: scope.backup.sha256,
    targetEmpty: true, parentDevice: 1, sourceDevice: 1, home: '/fixture/home', sandboxRoots: ['/fixture/sandboxes'],
    checkouts: ['/fixture/checkout', '/fixture/stable'], foreignHolders: [], envDefinitions: ['data/invented.db'] }
}
const cases: Array<[string, string, (f: any) => void]> = [
  ['no act', 'moveActMissing', f => { f.scope = null }],
  ['reserved act', 'moveActUnavailable', f => { f.state = 'reserved' }],
  ['consumed act', 'moveActUnavailable', f => { f.state = 'consumed' }],
  ...['database', 'port', 'checkout', 'targetFolder', 'targetMode'].map(name => [`different ${name}`, 'moveScopeDiffers', (f: any) => { f.observed[name] = name === 'port' ? 29992 : '/different' }] as [string, string, (f: any) => void]),
  ['different backup path', 'moveScopeDiffers', f => { f.observed.backup.path = '/different.db' }],
  ['different scoped backup hash', 'moveScopeDiffers', f => { f.observed.backup.sha256 = Buffer.alloc(32, 8).toString('base64') }],
  ['missing backup', 'moveBackupMissing', f => { f.backupExists = false }],
  ['changed backup bytes', 'moveBackupHashDiffers', f => { f.backupSha256 = Buffer.alloc(32, 8).toString('base64') }],
  ['nonempty target', 'moveTargetNotEmpty', f => { f.targetEmpty = false }],
  ['different filesystem', 'moveDifferentFilesystem', f => { f.parentDevice = 2 }],
  ['target in PROJECTS', 'moveTargetForbidden', f => { f.scope.targetFolder = f.observed.targetFolder = '/fixture/home/PROJECTS/private-data' }],
  ['target in a sandbox', 'moveTargetForbidden', f => { f.scope.targetFolder = f.observed.targetFolder = '/fixture/sandboxes/a/private-data' }],
  ['target in running checkout', 'moveTargetForbidden', f => { f.scope.targetFolder = f.observed.targetFolder = '/fixture/checkout/private-data' }],
  ['target in stable checkout', 'moveTargetForbidden', f => { f.scope.targetFolder = f.observed.targetFolder = '/fixture/stable/private-data' }],
  ['foreign database holder', 'moveForeignHolder', f => { f.foreignHolders = [12345] }],
  ['missing .env definition', 'moveEnvMissing', f => { f.envDefinitions = [] }],
  ['two .env definitions', 'moveEnvRepeated', f => { f.envDefinitions.push('other.db') }],
]
it('accepts the complete safe readings without changing them', async () => {
  const f = facts(), before = structuredClone(f)
  expect((await load()).checkMoveFacts(f.scope.targetFolder, f)).toEqual(f.scope)
  expect(f).toEqual(before)
})
for (const [name, code, change] of cases) it(`refuses ${name} before any stop or move`, async () => {
  const f = facts(); change(f)
  const before = structuredClone(f)
  const m = await load()
  try { m.checkMoveFacts(f.observed.targetFolder, f); throw new Error('No refusal') } catch (error: any) { expect(error.code).toBe(code) }
  expect(f).toEqual(before)
})
// No process or filesystem writer is passed to this pure pre-stop boundary.
it('refuses a missing target instead of choosing a default', async () => {
  const m = await load()
  expect(() => m.checkMoveFacts(undefined, facts())).toThrow(/target/i)
  expect(() => m.checkMoveFacts('', facts())).toThrow(/target/i)
})
