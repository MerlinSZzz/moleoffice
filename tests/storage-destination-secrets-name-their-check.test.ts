// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE DESTINATION CREDENTIALS ARE KEPT, AND WHICH CHECK REFUSED A SECRETS FILE. No server is started here; the
 * config module is imported afresh in each case so a mock of the file system or of the platform rule reaches it.
 *
 * WHAT THIS HOLDS.
 *   1. An office with no sandbox templates keeps its credentials in the per-user data folder, one template keeps
 *      them in the file it names and reads `~` as the home, and two templates cannot say which file to use.
 *   2. On Windows a mode says nothing about who may read a file, so a 0o666 file is read there; the same file on
 *      Linux is refused as `othersMayRead`, and its mode `666` is named.
 *   3. The mode rule is the one exported by src/config/the-paths-of-a-system.mjs: when that function says the mode
 *      does not say who may read, the file is read without a platform being named.
 *   4. A file that changes between the first look and the open is refused as `changedWhileRead`.
 *   5. A path with no folder above it is refused as `noParent`.
 *
 * MUTATIONS. Each must fail the case it guards: answering `data-folder` when a template names one; always refusing
 * or always allowing the mode; deleting the second fstat check; and replacing the no-parent refusal with the old
 * sentence.
 */
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const folder = aTestDatabaseFolder('secrets-checks')
const home = join(folder, 'home')

/** A template folder holding one `sandbox.json` for each entry, as the sandbox launcher writes them. */
function templatesIn(where: string, entries: { name: string; hostFile: string }[]): string {
  for (const entry of entries) {
    const folder = join(where, entry.name)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'sandbox.json'), JSON.stringify({ secrets: { hostFile: entry.hostFile, names: [] } }))
  }
  return where
}

/** A file at the mode a case asks for, with made-up bytes, owned by this user. */
function aSecretsFile(name: string, mode: number, bytes = 'MADE_UP_LOGIN=made-up-value\n'): string {
  const path = join(folder, name)
  writeFileSync(path, bytes, { mode: 0o600 })
  chmodSync(path, mode)
  return path
}

/** The sentence with the values a refusal carries written into its places. */
function filled(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? `{${name}}`)
}

afterEach(() => {
  vi.doUnmock('node:fs')
  vi.doUnmock('../src/config/the-paths-of-a-system.mjs')
  vi.resetModules()
})

afterAll(() => rmSync(folder, { recursive: true, force: true }))

it('says where destination credentials are kept', async () => {
  mkdirSync(home, { recursive: true })
  const xdg = join(folder, 'xdg')

  vi.resetModules()
  const { whereDestinationCredentialsAreKept } = await import('../src/config/storage/destination-secrets.ts')
  expect(
    whereDestinationCredentialsAreKept(join(folder, 'no-templates'), { HOME: home, XDG_CONFIG_HOME: xdg }, 'linux'),
  ).toEqual({ from: 'data-folder', file: join(xdg, 'mole-office', 'storage-destination-secrets.env') })

  const one = templatesIn(join(folder, 'one-template'), [{ name: 'only', hostFile: '~/made-up/one.env' }])
  const oldHome = process.env['HOME']
  process.env['HOME'] = home
  try {
    expect(whereDestinationCredentialsAreKept(one, { HOME: home }, 'linux')).toEqual({
      from: 'templates',
      file: join(home, 'made-up', 'one.env'),
    })
  } finally {
    if (oldHome === undefined) delete process.env['HOME']
    else process.env['HOME'] = oldHome
  }

  const two = templatesIn(join(folder, 'two-templates'), [
    { name: 'one', hostFile: '~/one.env' },
    { name: 'two', hostFile: '~/two.env' },
  ])
  expect(whereDestinationCredentialsAreKept(two, { HOME: home }, 'linux')).toEqual({ from: 'many-templates', file: null })
})

it('reads a file whose mode is 666 on Windows and refuses it on Linux', async () => {
  const path = aSecretsFile('mode-666.env', 0o666)
  vi.resetModules()
  const { HOST_SECRETS_SENTENCES, HostSecretsRefusal, readHostSecrets } = await import(
    '../src/config/storage/destination-secrets.ts'
  )
  expect(readHostSecrets(path, 'win32')).toEqual(Buffer.from('MADE_UP_LOGIN=made-up-value\n'))
  let refusal: unknown
  try {
    readHostSecrets(path, 'linux')
  } catch (error) {
    refusal = error
  }
  expect(refusal).toBeInstanceOf(HostSecretsRefusal)
  const refused = refusal as InstanceType<typeof HostSecretsRefusal>
  expect(refused.check).toBe('othersMayRead')
  expect(refused.values).toEqual({ mode: '666' })
  expect(refused.message).toBe(filled(HOST_SECRETS_SENTENCES.othersMayRead, { mode: '666' }))
})

it('asks the platform rule whether a mode says who may read', async () => {
  const path = aSecretsFile('mode-666-asked.env', 0o666)
  vi.resetModules()
  vi.doMock('../src/config/the-paths-of-a-system.mjs', async (original) => ({
    ...(await original()),
    aFileModeSaysWhoMayRead: () => false,
  }))
  const { readHostSecrets } = await import('../src/config/storage/destination-secrets.ts')
  expect(readHostSecrets(path)).toEqual(Buffer.from('MADE_UP_LOGIN=made-up-value\n'))
})

it('refuses a file that changed while it was read', async () => {
  const path = aSecretsFile('changed.env', 0o600)
  vi.resetModules()
  vi.doMock('node:fs', async (original) => {
    const real = (await original()) as typeof import('node:fs')
    return {
      ...real,
      fstatSync: (fd: number) => {
        const stat = real.fstatSync(fd)
        return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ino: stat.ino + 1 })
      },
    }
  })
  const { HOST_SECRETS_SENTENCES, HostSecretsRefusal, readHostSecrets } = await import(
    '../src/config/storage/destination-secrets.ts'
  )
  let refusal: unknown
  try {
    readHostSecrets(path)
  } catch (error) {
    refusal = error
  }
  expect(refusal).toBeInstanceOf(HostSecretsRefusal)
  const refused = refusal as InstanceType<typeof HostSecretsRefusal>
  expect(refused.check).toBe('changedWhileRead')
  expect(refused.message).toBe(filled(HOST_SECRETS_SENTENCES.changedWhileRead, {}))
})

it('refuses a path with no folder above it', async () => {
  vi.resetModules()
  vi.doMock('node:fs', async (original) => {
    const real = (await original()) as typeof import('node:fs')
    return {
      ...real,
      realpathSync: () => {
        const error = new Error('A made-up missing folder.') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      },
    }
  })
  const { HOST_SECRETS_SENTENCES, HostSecretsRefusal, hostSecretsPath } = await import(
    '../src/config/storage/destination-secrets.ts'
  )
  let refusal: unknown
  try {
    hostSecretsPath('/made-up/a/b.env')
  } catch (error) {
    refusal = error
  }
  expect(refusal).toBeInstanceOf(HostSecretsRefusal)
  const refused = refusal as InstanceType<typeof HostSecretsRefusal>
  expect(refused.check).toBe('noParent')
  expect(refused.message).toBe(filled(HOST_SECRETS_SENTENCES.noParent, {}))
})
