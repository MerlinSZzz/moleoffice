// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY FILE CAN GAIN ONE PROVIDER ENTRY, AND NOTHING CAN READ A PROVIDER'S VALUE OUT OF IT.
 *
 * Criterion D1 stands on a decision and a second decision made with it. It says:
 * each provider's own key lives in the office's one file beside the database, never in the
 * database and never in `.env`. The file already held the person's key and the office's key, so the
 * provider section is NESTED under `providers`: a provider can never collide with `person` or
 * `office`, and the section is present and empty from the first run rather than created the first
 * time somebody sets one.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HALVES OF THIS FILE, AND THE MUTATION EACH IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The write half drives a made-up value through `setProviderSecret` and reads the target file back.
 * Its mutation is direct: write straight to the target instead of to a temporary file and a rename,
 * and the "a write that throws leaves the target byte-identical" case goes red, because making the
 * rename fail no longer stops the write.
 *
 * The read half READS THE MODULE'S OWN SOURCE, in the shape
 * `tests/the-published-refusal-is-the-one-enforced.test.ts` uses, because "nothing exported returns
 * a provider's value" is a claim about the shape of the module that no single call can prove. Its
 * mutation is to change `aProviderSecretIsSet` to return the entry instead of a boolean.
 *
 * NO REAL KEY IS EVER USED OR PRINTED HERE. Every value below is a made-up string.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

const KEYS_SOURCE = fileURLToPath(new URL('../src/server/lib/keys.ts', import.meta.url))
const A_PROVIDER_SECRET_SOURCE = fileURLToPath(new URL('../src/server/lib/a-provider-secret-is-set.ts', import.meta.url))

/**
 * THE RENAME IS MADE TO FAIL ON DEMAND. The write is supposed to reach the target through a
 * temporary file and a rename, so that a failure leaves the target exactly as it was. A test can only
 * see that if it can fail the rename; `vi.hoisted` puts the switch where the mock's factory can read
 * it. In the source-reading test further down, a temporary file that is never renamed is the shape.
 */
const failRename = vi.hoisted(() => ({ on: false }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      if (failRename.on) throw new Error('this rename was made to fail by the test')
      return actual.renameSync(from, to)
    },
  }
})

let t: TestDb
let keys: typeof import('../src/server/lib/keys.ts')
const scratchDirectories: string[] = []

beforeAll(async () => {
  // A throwaway database first: importing lib/keys.ts opens whatever MOLE_OFFICE_DB names.
  t = await freshDb()
  keys = await import('../src/server/lib/keys.ts')
})

afterEach(() => {
  failRename.on = false
  process.env.MOLE_OFFICE_DB = t.file
})

afterAll(() => {
  t.close()
  for (const directory of scratchDirectories) rmSync(directory, { recursive: true, force: true })
})

/** A fresh directory for one key file, and the path the file is expected at. */
function aFreshKeyFile(): { directory: string; file: string } {
  const directory = mkdtempSync(join(tmpdir(), 'p83-providers-'))
  scratchDirectories.push(directory)
  process.env.MOLE_OFFICE_DB = join(directory, 'panelx.db')
  keys.forgetTheKeysThisProcessRead()
  return { directory, file: join(directory, 'keys.json') }
}

/** The file as JSON, for a test that has to look at the bytes rather than at a function. */
function theFileAt(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

const A_MADE_UP_KEY = 'a-made-up-provider-key-used-only-by-this-test'
const ANOTHER_MADE_UP_KEY = 'another-made-up-provider-key-used-only-by-this-test'

describe('a fresh key file carries a providers section, present and empty', () => {
  it('makes one on the first read and leaves the two secrets in it', () => {
    const { file } = aFreshKeyFile()
    keys.ensureKeysExist()
    expect(existsSync(file)).toBe(true)
    const held = theFileAt(file)
    expect(held['providers']).toEqual({})
    expect(String(held['person'])).toMatch(/^[0-9a-f]{64}$/)
    expect(String(held['office'])).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('adding one provider entry, replacing it, and leaving the others alone', () => {
  it('adds a provider that is not there', () => {
    const { file } = aFreshKeyFile()
    keys.setProviderSecret('deepseek', A_MADE_UP_KEY)
    expect((theFileAt(file)['providers'] as Record<string, string>)['deepseek']).toBe(A_MADE_UP_KEY)
    expect(keys.aProviderSecretIsSet('deepseek')).toBe(true)
  })

  it('replaces the entry when the same provider is set again', () => {
    const { file } = aFreshKeyFile()
    keys.setProviderSecret('deepseek', A_MADE_UP_KEY)
    keys.setProviderSecret('deepseek', ANOTHER_MADE_UP_KEY)
    expect((theFileAt(file)['providers'] as Record<string, string>)['deepseek']).toBe(ANOTHER_MADE_UP_KEY)
  })

  it('leaves the first provider alone when a second is set', () => {
    const { file } = aFreshKeyFile()
    keys.setProviderSecret('deepseek', A_MADE_UP_KEY)
    keys.setProviderSecret('openai', ANOTHER_MADE_UP_KEY)
    const providers = theFileAt(file)['providers'] as Record<string, string>
    expect(providers['deepseek']).toBe(A_MADE_UP_KEY)
    expect(providers['openai']).toBe(ANOTHER_MADE_UP_KEY)
  })

  it('keeps the person and the office secrets exactly as they were', () => {
    const { file } = aFreshKeyFile()
    keys.ensureKeysExist()
    const before = theFileAt(file)
    keys.setProviderSecret('deepseek', A_MADE_UP_KEY)
    const after = theFileAt(file)
    expect(after['person']).toBe(before['person'])
    expect(after['office']).toBe(before['office'])
  })

  it('refuses an empty provider name rather than writing a nameless entry', () => {
    const { file } = aFreshKeyFile()
    keys.ensureKeysExist()
    expect(() => keys.setProviderSecret('   ', A_MADE_UP_KEY)).toThrow(/provider name/)
    expect(theFileAt(file)['providers']).toEqual({})
  })
})

describe('the validator accepts the nested shape and refuses the old flat one loudly', () => {
  it('refuses a file with no providers section, naming what is missing, and changes nothing', () => {
    const { file } = aFreshKeyFile()
    const flat = `${JSON.stringify({ person: 'a'.repeat(64), office: 'b'.repeat(64) }, null, 2)}\n`
    writeFileSync(file, flat)
    keys.forgetTheKeysThisProcessRead()
    expect(() => keys.ensureKeysExist()).toThrow(/"providers"/)
    expect(readFileSync(file, 'utf8')).toBe(flat)
  })

  it('refuses a providers section that is not an object, naming what it found', () => {
    const { file } = aFreshKeyFile()
    writeFileSync(file, `${JSON.stringify({ person: 'a'.repeat(64), office: 'b'.repeat(64), providers: [] })}\n`)
    keys.forgetTheKeysThisProcessRead()
    expect(() => keys.ensureKeysExist()).toThrow(/"providers" section is a list/)
  })

  it('refuses a provider value that is not text, naming the provider and what it found', () => {
    const { file } = aFreshKeyFile()
    writeFileSync(
      file,
      `${JSON.stringify({ person: 'a'.repeat(64), office: 'b'.repeat(64), providers: { deepseek: 5 } })}\n`,
    )
    keys.forgetTheKeysThisProcessRead()
    expect(() => keys.ensureKeysExist()).toThrow(/deepseek/)
    expect(() => keys.ensureKeysExist()).toThrow(/number/)
  })
})

describe('a write that throws leaves the target byte-identical and no temporary file behind', () => {
  it('fails at the rename and keeps the file it started with', () => {
    const { directory, file } = aFreshKeyFile()
    keys.setProviderSecret('deepseek', A_MADE_UP_KEY)
    const before = readFileSync(file)
    failRename.on = true
    expect(() => keys.setProviderSecret('openai', ANOTHER_MADE_UP_KEY)).toThrow(/made to fail/)
    const after = readFileSync(file)
    expect(after.equals(before)).toBe(true)
    expect(readdirSync(directory).filter((one) => one.endsWith('.tmp'))).toEqual([])
  })
})

describe('the cache does not answer with the file as it was before a write', () => {
  it('answers true straight after a set, in the same process', () => {
    aFreshKeyFile()
    keys.ensureKeysExist()
    // The empty section is read and cached first. A write that did not clear the cache would leave
    // this answering false, and the next reader in this process would act on the old file.
    expect(keys.aProviderSecretIsSet('deepseek')).toBe(false)
    keys.setProviderSecret('deepseek', A_MADE_UP_KEY)
    expect(keys.aProviderSecretIsSet('deepseek')).toBe(true)
  })
})

describe('nothing exported returns a provider value', () => {
  it('reads the module source: the only provider readers return void or a boolean', () => {
    const keyFileSource = readFileSync(KEYS_SOURCE, 'utf8')
    const providerReaderSource = readFileSync(A_PROVIDER_SECRET_SOURCE, 'utf8')
    expect(keyFileSource).toContain('export function setProviderSecret(provider: string, value: string): void {')
    expect(providerReaderSource).toContain('export function aProviderSecretIsSet(provider: string): boolean {')
    // AND NOTHING HANDS AN ENTRY BACK. A `return ...providers[...]` is the shape the rule forbids.
    expect(keyFileSource).not.toMatch(/providers\s*\[/)
    expect(providerReaderSource).not.toMatch(/providers\s*\[/)
    // AND NOTHING PRINTS IT. The value never reaches a log.
    expect(keyFileSource).not.toMatch(/console\.(log|error|warn|info)/)
    expect(providerReaderSource).not.toMatch(/console\.(log|error|warn|info)/)
  })

  it('drives the two exports and gets no value from either', () => {
    aFreshKeyFile()
    expect(keys.setProviderSecret('deepseek', A_MADE_UP_KEY)).toBeUndefined()
    const answer = keys.aProviderSecretIsSet('deepseek')
    expect(typeof answer).toBe('boolean')
    expect(answer).toBe(true)
    expect(keys.aProviderSecretIsSet('a-provider-nobody-set')).toBe(false)
  })
})
