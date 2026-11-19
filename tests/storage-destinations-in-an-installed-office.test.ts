// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * STORAGE DESTINATIONS IN AN INSTALLED OFFICE: THE SETTINGS PAGE'S OWN DOORS. A bundle has no `sandboxes/` folder,
 * so no template names a secrets file. The reading must name the data folder instead, and a refused file must be
 * answered inside a 200 reading and refused 409 on a save, with the code of the check that failed.
 *
 * THE OFFICE UNDER TEST stands in for an installed bundle: a folder whose top-level entries are links to this
 * checkout, except `sandboxes` and `.git`, so the server finds its own files and no sandbox templates. HOME and
 * XDG_CONFIG_HOME point at folders of their own, and REPO_ROOT is the bundle's folder.
 *
 * WHAT THIS HOLDS.
 *   1. GET answers the data folder's file, absent and usable, and no destinations.
 *   2. An s3 destination saves its credentials at mode 600, the reply carries neither value, the offline storage
 *      command reads them back, and a remove takes the destination's line away.
 *   3. Two templates name two files: GET answers `many-templates` with a 200 and the refusal, every destination's
 *      credentials are unknown, and a save is refused 409. Removing the templates makes the data folder usable again.
 *   4. Each check names itself: others may read, not a plain file (a link, a second name, a folder), a folder above
 *      that is a link, another owner, too large and unreadable. Both the GET and the POST carry the code and values,
 *      and the message is this wave's English sentence with its values filled.
 *   5. A folder that cannot be written refuses a save as `unwritable` and leaves the file's bytes alone.
 *
 * MUTATIONS. Each must fail its case: answering `many-templates` for no template; opening the new file at mode 644;
 * one code for every check; calling the store again for the reading; and giving every refusal the old sentence.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13u } from '../src/shared/words/en-wave-13u.ts'
import { DEFAULT_UPLOAD_POLICY } from '../src/shared/storage/destinations.ts'

const root = aTestDatabaseFolder('installed-office')
const office = join(root, 'bundle')
const home = join(root, 'home')
const config = join(home, '.config')
const theCheckout = fileURLToPath(new URL('..', import.meta.url))
const oldHome = process.env['HOME']
const oldXdg = process.env['XDG_CONFIG_HOME']
const person = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
let t: TestDb
let app: FastifyInstance
let dataFile = ''

/** The s3 target of tests/storage-destinations.test.ts line 67, on this installed office. */
const cloud = {
  name: 'made-up-cloud',
  kind: 's3' as const,
  target: { endpoint: 'https://store.invalid', bucket: 'made-up', region: 'made-up-region-1', prefix: 'office/' },
  policy: { ...DEFAULT_UPLOAD_POLICY },
  limitBytes: 100_000_000,
  enabled: true,
}

const ask = (method: 'GET' | 'POST', payload?: unknown, headers = person) =>
  app.inject({
    method,
    url: '/api/office/storage-destinations',
    headers,
    ...(payload === undefined ? {} : { payload: payload as object }),
  })
const save = (destination: unknown, credentials: unknown = { action: 'retain' }, headers = person) =>
  ask('POST', { destination, credentials, because: 'Made-up installed-office proof' }, headers)

/** A plain file at the data folder's secrets path, at mode 600, whatever was there before. */
function aPlainFile(bytes = ''): void {
  rmSync(dataFile, { recursive: true, force: true })
  mkdirSync(dirname(dataFile), { recursive: true })
  writeFileSync(dataFile, bytes, { mode: 0o600 })
  chmodSync(dataFile, 0o600)
}

/** The sentence with the values a refusal carries written into its places. */
function filled(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}

/**
 * The check named by both doors: the GET answers 200 with the refusal, and a save with retain is refused 409. Every
 * saved destination's credentials are unknown while the file is refused.
 */
async function refusedAs(code: string, values: Record<string, string | number> = {}): Promise<void> {
  const sentence = enWave13u[`server.${code}` as keyof typeof enWave13u]
  if (typeof sentence !== 'string') throw new Error(`The word for ${code} is not one English sentence.`)
  const expected = filled(sentence, values)
  const read = await ask('GET')
  expect(read.statusCode, read.body).toBe(200)
  const credentials = read.json().credentials
  expect(credentials.usable).toBe(false)
  expect(credentials.refused).toEqual({ code, values, message: expected })
  for (const destination of read.json().destinations) expect(destination.credentialsSet).toBeNull()
  const refused = await save(cloud)
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.json().code).toBe(code)
  expect(refused.json().values).toEqual(values)
  expect(refused.json().error).toBe(expected)
}

beforeAll(async () => {
  mkdirSync(office, { recursive: true })
  mkdirSync(home, { recursive: true })
  for (const name of readdirSync(theCheckout)) {
    if (name === 'sandboxes' || name === '.git') continue
    symlinkSync(join(theCheckout, name), join(office, name))
  }
  process.env['HOME'] = home
  process.env['XDG_CONFIG_HOME'] = config
  t = await freshDb()
  // AFTER `freshDb`, which empties the module cache, and before the server is built, as
  // tests/the-pictures-and-a-residents-file-are-sent-from-the-file.test.ts does it.
  vi.doMock('../src/config/settings.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/config/settings.mjs')>()),
    REPO_ROOT: `${office}/`,
  }))
  app = (await apiApp()).app
  await app.ready()
  dataFile = join(config, 'mole-office', 'storage-destination-secrets.env')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.doUnmock('../src/config/settings.mjs')
  if (oldHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = oldHome
  if (oldXdg === undefined) delete process.env['XDG_CONFIG_HOME']
  else process.env['XDG_CONFIG_HOME'] = oldXdg
  rmSync(root, { recursive: true, force: true })
})

it('reads the data folder when no sandbox template names a secrets file', async () => {
  const read = await ask('GET')
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().destinations).toEqual([])
  expect(read.json().credentials).toEqual({
    file: dataFile,
    from: 'data-folder',
    exists: false,
    usable: true,
    refused: null,
    modeSaysWhoMayRead: true,
  })
})

it('saves and removes the s3 credentials in the data folder at mode 600, and the storage command reads them', async () => {
  const values = { accessKeyId: 'made-up-key-42', secretAccessKey: 'made-up-secret-42' }
  const saved = await save(cloud, { action: 'replace', values })
  expect(saved.statusCode, saved.body).toBe(200)
  expect(saved.json().destinations.find((one: { name: string }) => one.name === cloud.name).credentialsSet).toBe(true)
  expect(saved.json().credentials.exists).toBe(true)
  expect(statSync(dataFile).mode & 0o777).toBe(0o600)
  expect(saved.body).not.toContain(values.accessKeyId)
  expect(saved.body).not.toContain(values.secretAccessKey)
  const { destinationSecretName, readCloudCredentials } = await import(
    '../src/config/storage/destination-secrets.ts'
  )
  expect(readCloudCredentials(cloud.name)).toEqual(values)
  const removed = await save(cloud, { action: 'remove' })
  expect(removed.statusCode, removed.body).toBe(200)
  expect(readFileSync(dataFile, 'utf8').split('\n').some((line) => line.startsWith(`${destinationSecretName(cloud.name)}=`))).toBe(false)
})

it('answers two templates as manyDeclared, then reads the data folder again when they are removed', async () => {
  for (const [name, hostFile] of [
    ['one', '~/one.env'],
    ['two', '~/two.env'],
  ] as const) {
    mkdirSync(join(office, 'sandboxes', name), { recursive: true })
    writeFileSync(join(office, 'sandboxes', name, 'sandbox.json'), JSON.stringify({ secrets: { hostFile, names: [] } }))
  }
  const read = await ask('GET')
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().credentials).toMatchObject({ file: null, from: 'many-templates', exists: false, usable: false })
  expect(read.json().credentials.refused.code).toBe('storageDestinationSecretsManyDeclared')
  for (const destination of read.json().destinations) expect(destination.credentialsSet).toBeNull()
  const refused = await save(cloud)
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.json().code).toBe('storageDestinationSecretsManyDeclared')
  rmSync(join(office, 'sandboxes'), { recursive: true, force: true })
  expect((await ask('GET')).json().credentials.usable).toBe(true)
})

it('names each check that refuses the file, on the reading and on the save', async () => {
  aPlainFile()
  chmodSync(dataFile, 0o644)
  await refusedAs('storageDestinationSecretsOthersMayRead', { mode: '644' })
  aPlainFile()

  const copy = join(root, 'plain-copy.env')
  writeFileSync(copy, '', { mode: 0o600 })
  chmodSync(copy, 0o600)
  rmSync(dataFile)
  symlinkSync(copy, dataFile)
  await refusedAs('storageDestinationSecretsNotAPlainFile')
  aPlainFile()

  linkSync(dataFile, join(root, 'second-name'))
  await refusedAs('storageDestinationSecretsNotAPlainFile')
  rmSync(join(root, 'second-name'))
  aPlainFile()

  rmSync(dataFile)
  mkdirSync(dataFile)
  await refusedAs('storageDestinationSecretsNotAPlainFile')
  aPlainFile()

  renameSync(join(config, 'mole-office'), join(config, 'real-mole-office'))
  symlinkSync(join(config, 'real-mole-office'), join(config, 'mole-office'))
  await refusedAs('storageDestinationSecretsParentIsALink')
  rmSync(join(config, 'mole-office'))
  renameSync(join(config, 'real-mole-office'), join(config, 'mole-office'))
  aPlainFile()

  const uid = vi.spyOn(process, 'getuid').mockReturnValue(process.getuid!() + 1)
  try {
    await refusedAs('storageDestinationSecretsAnotherOwner')
  } finally {
    uid.mockRestore()
  }
  aPlainFile()

  writeFileSync(dataFile, Buffer.alloc(1_048_577), { mode: 0o600 })
  chmodSync(dataFile, 0o600)
  await refusedAs('storageDestinationSecretsTooLarge')
  aPlainFile()

  expect(process.getuid!(), 'this case needs a user that is not root').not.toBe(0)
  chmodSync(dataFile, 0o000)
  await refusedAs('storageDestinationSecretsUnreadable', { systemError: 'EACCES' })
  aPlainFile()
})

it('refuses a save it cannot write and leaves the file alone', async () => {
  aPlainFile('MADE_UP_LOGIN=made-up-value\n')
  const before = readFileSync(dataFile)
  chmodSync(join(config, 'mole-office'), 0o500)
  try {
    const read = await ask('GET')
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().credentials.usable).toBe(true)
    const refused = await save(cloud, {
      action: 'replace',
      values: { accessKeyId: 'made-up-key-43', secretAccessKey: 'made-up-secret-43' },
    })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(refused.json()).toMatchObject({
      code: 'storageDestinationSecretsUnwritable',
      values: { systemError: 'EACCES' },
    })
    expect(refused.json().error).toBe(
      filled(enWave13u['server.storageDestinationSecretsUnwritable'], { systemError: 'EACCES' }),
    )
    expect(readFileSync(dataFile)).toEqual(before)
  } finally {
    chmodSync(join(config, 'mole-office'), 0o700)
  }
})
