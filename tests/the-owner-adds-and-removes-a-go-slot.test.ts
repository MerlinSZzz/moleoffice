// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER ADDS OR REMOVES A KEY SLOT WITH A PRESS, AND THE KEY IS SHOWN NOWHERE AFTER. Item 12 of the key layer.
 * The owner's decision says the owner adds or removes a key with a press. The doors are in
 * src/server/api/provider-router.ts, the file handling in src/server/lib/keyrouter/key-slots.ts, and the reader and writer
 * the router shares in src/config/provider-router.mjs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   · The reading names the key slots file, the routed providers a new slot may name, and every slot by provider, id,
 *     label and the start of the key's sha256, and never a key. Before the file exists it lists none and writes nothing.
 *   · Adding one writes it into the key slots file at mode 600, in a folder of mode 700, under the first of
 *     <provider>-1, <provider>-2, … the file does not hold, and keeps every other slot as it was. OpenCode Go keeps its
 *     shorter go-1 prefix. The router's own reader reads it back.
 *   · A slot of any routed provider, not only OpenCode Go, can be added and removed, so the OpenRouter and OpenAI keys
 *     reach the router by the owner's press and not by a command in a terminal.
 *   · Removing one takes only that slot out. An id the file does not hold is refused.
 *   · A key the file already holds is refused by the label of the slot that holds it, and the key is not said.
 *   · A provider the router does not route is refused by name, and the key is not said.
 *   · Only the owner adds or removes one. An agent and a secretary are refused, and the file stays as it was.
 *   · A key with a space, an empty label and a field the door does not take are refused, and no refusal holds a key.
 *   · A folder others may open is refused by name, and nothing is written into it.
 *   · The add row starts on OpenCode Go whenever the reading holds it, and on the first provider otherwise, so an
 *     owner who pastes a Go key without choosing does not file it as another provider.
 *   · While the router is off, every door refuses and nothing is written.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOME FOLDER IS THIS TEST'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * The key slots file is under `~`, so HOME is pointed at a scratch folder before anything is asked, and the file this
 * test reads is checked to be inside that folder. Every key here is made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. src/server/api/provider-router.ts: drop the owner-only check from the add door. The agent case goes red.
 *   2. src/server/lib/keyrouter/key-slots.ts, addAKeySlot: write only the new slot. The kept-slots case goes red.
 *   3. src/config/provider-router.mjs, writeTheKeySlots: create the new file at 0644. The add case goes red on its mode.
 *   4. src/server/lib/keyrouter/key-slots.ts, theKeySlots: answer each slot's key in place of its mark. The add case
 *      goes red on the reply.
 *   5. src/server/lib/keyrouter/key-slots.ts, addAKeySlot: leave out the check for a key the file holds. The duplicate
 *      case goes red.
 *   6. src/server/lib/keyrouter/key-slots.ts, addAKeySlot: leave out the provider check. The unrouted-provider case goes
 *      red.
 *   7. src/server/lib/keyrouter/key-slots.ts, removeAKeySlot: refuse a slot of another provider. The OpenRouter remove
 *      case goes red.
 *   8. src/web/components/GoSlotsPanel.tsx, AddASlot: start the drawn row on providers[0] instead of
 *      theProviderTheAddRowStartsOn. The drawn-add-row case goes red.
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { aSecretsMark, readTheKeySlots, THE_ROUTED_PROVIDERS, theKeySlotsFile } from '../src/config/provider-router.mjs'
import { theProviderTheAddRowStartsOn } from '../src/shared/go-slots.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const made = randomBytes(6).toString('hex')
const KEY_ONE = `not-a-real-go-key-one-${made}`
const KEY_TWO = `not-a-real-go-key-two-${made}`
const KEY_THREE = `not-a-real-go-key-three-${made}`
const A_DEEPSEEK_KEY = `not-a-real-deepseek-key-${made}`
const AN_OPENROUTER_KEY = `not-a-real-openrouter-key-${made}`
const EVERY_KEY = [KEY_ONE, KEY_TWO, KEY_THREE, A_DEEPSEEK_KEY, AN_OPENROUTER_KEY]

/** WHAT WAS ON `globalThis` BEFORE THIS FILE INSTALLED ITS FAKE WINDOW, so the last case can prove it is back. */
const hadAWindowBeforeTheFake = Object.hasOwn(globalThis, 'window')
const theWindowBeforeTheFake = (globalThis as unknown as { window?: unknown }).window

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

interface Reading {
  file: string
  providers: { id: string; named: string }[]
  slots: { id: string; provider: string; providerName: string; label: string; mark: string }[]
  says: string
}

let t: TestDb
let app: FastifyInstance
let home = ''
let file = ''
const before: Record<string, string | undefined> = {}

async function ask(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<{ code: number; said: Reading; text: string }> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as object }) })
  return { code: reply.statusCode, said: reply.json() as Reading, text: reply.body }
}

/** THE KEY SLOTS FILE, which must be inside this test's home before anything reads or writes it. */
function theFileHere(): string {
  expect(file.startsWith(home + sep), `${file} is not inside this test's home ${home}`).toBe(true)
  return file
}

function holdsNoKey(text: string): void {
  for (const key of EVERY_KEY) expect(text).not.toContain(key)
}

beforeAll(async () => {
  for (const name of ['HOME', 'MOLE_OFFICE_PROVIDER_ROUTER']) before[name] = process.env[name]
  home = mkdtempSync(join(tmpdir(), 'mole-office-key-slots-'))
  process.env['HOME'] = home
  process.env['MOLE_OFFICE_PROVIDER_ROUTER'] = 'on'
  file = theKeySlotsFile(home)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [['key-slot-secretary', 'secretary'], ['key-slot-worker', 'worker']] as const) {
    const registered = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
    expect(registered.code, registered.text.slice(0, 300)).toBe(201)
  }
})

afterAll(async () => {
  await app.close()
  t.close()
  for (const [name, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (home !== '') rmSync(home, { recursive: true, force: true })
})

describe('the reading', () => {
  it('names the key slots file, every provider a slot may name, and lists no slot before the file exists, and writes nothing', async () => {
    expect(existsSync(theFileHere())).toBe(false)
    const read = await ask('GET', '/api/provider-router/key-slots', AS_THE_PERSON)
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said.file).toBe('~/.config/mole-office/key-slots.json')
    expect(read.said.slots).toEqual([])
    expect(read.said.providers.map((one) => one.id)).toEqual(expect.arrayContaining(['opencode-go', 'openrouter']))
    expect(read.said.says).toContain('does not exist yet')
    expect(existsSync(theFileHere())).toBe(false)
  })
})

describe('adding and removing', () => {
  it('adds a Go slot at mode 600 in a folder of mode 700, which the router reads back, and answers only its mark', async () => {
    const added = await ask('POST', '/api/provider-router/key-slots/add', AS_THE_PERSON, { label: 'Made-up Go one', key: KEY_ONE })
    expect(added.code, added.text.slice(0, 300)).toBe(200)
    holdsNoKey(added.text)
    expect(added.said.slots).toEqual([{ id: 'go-1', provider: 'opencode-go', providerName: 'OpenCode Go', label: 'Made-up Go one', mark: aSecretsMark(KEY_ONE) }])
    expect(statSync(theFileHere()).mode & 0o777).toBe(0o600)
    expect(statSync(dirname(theFileHere())).mode & 0o777).toBe(0o700)
    expect(readTheKeySlots(theFileHere())).toEqual([{ id: 'go-1', provider: 'opencode-go', label: 'Made-up Go one', key: KEY_ONE }])
  })

  it('keeps every other slot as it was, and refuses a key the file already holds by the slot that holds it', async () => {
    // THE FILE AS THE OWNER LEFT IT: a DeepSeek slot of their own before the Go slot, kept where it is.
    writeFileSync(theFileHere(), `${JSON.stringify({ version: 1, slots: [
      { id: 'deepseek-1', provider: 'deepseek', label: 'Made-up DeepSeek', key: A_DEEPSEEK_KEY },
      { id: 'go-1', provider: 'opencode-go', label: 'Made-up Go one', key: KEY_ONE },
    ] }, null, 2)}\n`, { mode: 0o600 })
    const added = await ask('POST', '/api/provider-router/key-slots/add', AS_THE_PERSON, { label: 'Made-up Go two', key: KEY_TWO })
    expect(added.code, added.text.slice(0, 300)).toBe(200)
    holdsNoKey(added.text)
    expect(added.said.slots.map((one) => one.id)).toEqual(['deepseek-1', 'go-1', 'go-2'])
    expect(readTheKeySlots(theFileHere())).toEqual([
      { id: 'deepseek-1', provider: 'deepseek', label: 'Made-up DeepSeek', key: A_DEEPSEEK_KEY },
      { id: 'go-1', provider: 'opencode-go', label: 'Made-up Go one', key: KEY_ONE },
      { id: 'go-2', provider: 'opencode-go', label: 'Made-up Go two', key: KEY_TWO },
    ])

    const kept = readFileSync(theFileHere(), 'utf8')
    const again = await ask('POST', '/api/provider-router/key-slots/add', AS_THE_PERSON, { label: 'Made-up Go again', key: KEY_ONE })
    expect(again.code, again.text.slice(0, 300)).toBe(409)
    expect(again.text).toContain('Made-up Go one')
    holdsNoKey(again.text)
    expect(readFileSync(theFileHere(), 'utf8')).toBe(kept)
  })

  it('adds and removes an OpenRouter slot by its provider, and answers no key', async () => {
    const added = await ask('POST', '/api/provider-router/key-slots/add', AS_THE_PERSON, { provider: 'openrouter', label: 'Made-up OpenRouter', key: AN_OPENROUTER_KEY })
    expect(added.code, added.text.slice(0, 300)).toBe(200)
    holdsNoKey(added.text)
    expect(added.said.slots).toContainEqual({ id: 'openrouter-1', provider: 'openrouter', providerName: 'OpenRouter', label: 'Made-up OpenRouter', mark: aSecretsMark(AN_OPENROUTER_KEY) })
    expect(readTheKeySlots(theFileHere())).toContainEqual({ id: 'openrouter-1', provider: 'openrouter', label: 'Made-up OpenRouter', key: AN_OPENROUTER_KEY })

    const read = await ask('GET', '/api/provider-router/key-slots', asAgent('key-slot-worker'))
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said.slots).toContainEqual({ id: 'openrouter-1', provider: 'openrouter', providerName: 'OpenRouter', label: 'Made-up OpenRouter', mark: aSecretsMark(AN_OPENROUTER_KEY) })
    holdsNoKey(read.text)

    const removed = await ask('POST', '/api/provider-router/key-slots/remove', AS_THE_PERSON, { id: 'openrouter-1' })
    expect(removed.code, removed.text.slice(0, 300)).toBe(200)
    expect(removed.said.slots.map((one) => one.id)).not.toContain('openrouter-1')
    expect(readTheKeySlots(theFileHere()).map((one) => one.id)).not.toContain('openrouter-1')
  })

  it('removes only the slot named, gives its number to the next one added, and refuses an id it does not hold', async () => {
    const removed = await ask('POST', '/api/provider-router/key-slots/remove', AS_THE_PERSON, { id: 'go-1' })
    expect(removed.code, removed.text.slice(0, 300)).toBe(200)
    expect(removed.said.slots.map((one) => one.id)).toEqual(['deepseek-1', 'go-2'])
    expect(readTheKeySlots(theFileHere()).map((one) => one.id)).toEqual(['deepseek-1', 'go-2'])

    const kept = readFileSync(theFileHere(), 'utf8')
    const refused = await ask('POST', '/api/provider-router/key-slots/remove', AS_THE_PERSON, { id: 'go-9' })
    expect(refused.code, `${refused.text.slice(0, 300)}`).toBe(404)
    expect(refused.text).toContain('go-9')
    expect(readFileSync(theFileHere(), 'utf8')).toBe(kept)

    const added = await ask('POST', '/api/provider-router/key-slots/add', AS_THE_PERSON, { label: 'Made-up Go three', key: KEY_THREE })
    expect(added.code, added.text.slice(0, 300)).toBe(200)
    expect(added.said.slots).toEqual([
      { id: 'deepseek-1', provider: 'deepseek', providerName: 'DeepSeek', label: 'Made-up DeepSeek', mark: aSecretsMark(A_DEEPSEEK_KEY) },
      { id: 'go-2', provider: 'opencode-go', providerName: 'OpenCode Go', label: 'Made-up Go two', mark: aSecretsMark(KEY_TWO) },
      { id: 'go-1', provider: 'opencode-go', providerName: 'OpenCode Go', label: 'Made-up Go three', mark: aSecretsMark(KEY_THREE) },
    ])
  })
})

describe('only the owner', () => {
  it('refuses an agent and a secretary, and the file stays as it was', async () => {
    const kept = readFileSync(theFileHere(), 'utf8')
    for (const who of ['key-slot-worker', 'key-slot-secretary']) {
      for (const [path, body] of [
        ['/api/provider-router/key-slots/add', { provider: 'openrouter', label: 'Made-up OpenRouter two', key: `not-a-real-openrouter-key-two-${made}` }],
        ['/api/provider-router/key-slots/remove', { id: 'go-2' }],
      ] as const) {
        const refused = await ask('POST', path, asAgent(who), body)
        expect(refused.code, `${who} ${path}: ${refused.text.slice(0, 300)}`).toBe(403)
        expect(refused.text).toContain("the owner's own act")
        expect(refused.text).not.toContain(`not-a-real-openrouter-key-two-${made}`)
      }
    }
    expect(readFileSync(theFileHere(), 'utf8')).toBe(kept)
  })
})

describe('what is refused', () => {
  it('refuses a key with a space, an empty label and a provider the router does not route, and no refusal holds the key', async () => {
    const kept = readFileSync(theFileHere(), 'utf8')
    const spaced = `not-a-real go-key-${made}`
    for (const body of [
      { label: 'Made-up Go four', key: spaced },
      { label: '   ', key: `not-a-real-go-key-four-${made}` },
      { provider: 'a-provider-it-does-not-route', label: 'Made-up four', key: `not-a-real-key-four-${made}` },
    ]) {
      const refused = await ask('POST', '/api/provider-router/key-slots/add', AS_THE_PERSON, body)
      expect(refused.code, refused.text.slice(0, 300)).toBe(400)
      expect(refused.text).not.toContain(body.key)
      expect(refused.text).not.toContain('go-key-')
    }
    expect(readFileSync(theFileHere(), 'utf8')).toBe(kept)
  })

  it('refuses a folder others may open, by name, and writes nothing into it', async () => {
    const kept = readFileSync(theFileHere(), 'utf8')
    chmodSync(dirname(theFileHere()), 0o755)
    try {
      const refused = await ask('POST', '/api/provider-router/key-slots/add', AS_THE_PERSON, { label: 'Made-up Go four', key: `not-a-real-go-key-four-${made}` })
      expect(refused.code, refused.text.slice(0, 300)).toBe(409)
      expect(refused.text).toContain('0700')
      expect(readFileSync(theFileHere(), 'utf8')).toBe(kept)
      expect(statSync(dirname(theFileHere())).mode & 0o777).toBe(0o755)
    } finally {
      chmodSync(dirname(theFileHere()), 0o700)
    }
  })

  it('refuses every door while the router is off, and writes nothing', async () => {
    const kept = readFileSync(theFileHere(), 'utf8')
    process.env['MOLE_OFFICE_PROVIDER_ROUTER'] = 'off'
    try {
      for (const [method, path, body] of [
        ['GET', '/api/provider-router/key-slots', undefined],
        ['POST', '/api/provider-router/key-slots/add', { label: 'Made-up Go four', key: `not-a-real-go-key-four-${made}` }],
        ['POST', '/api/provider-router/key-slots/remove', { id: 'go-2' }],
      ] as const) {
        const refused = await ask(method, path, AS_THE_PERSON, body)
        expect(refused.code, `${path}: ${refused.text.slice(0, 300)}`).toBe(409)
        expect(refused.text).toContain('MOLE_OFFICE_PROVIDER_ROUTER is off')
      }
    } finally {
      process.env['MOLE_OFFICE_PROVIDER_ROUTER'] = 'on'
    }
    expect(readFileSync(theFileHere(), 'utf8')).toBe(kept)
  })
})

describe('the provider the add row starts on', () => {
  it('starts on OpenCode Go when the reading holds it, and on the first provider or OpenCode Go otherwise', () => {
    const routed = Object.entries(THE_ROUTED_PROVIDERS).map(([id, one]) => ({ id, named: one.named }))
    expect(theProviderTheAddRowStartsOn(routed)).toBe('opencode-go')
    expect(theProviderTheAddRowStartsOn([{ id: 'deepseek', named: 'DeepSeek' }, { id: 'openai', named: 'OpenAI' }])).toBe('deepseek')
    expect(theProviderTheAddRowStartsOn([])).toBe('opencode-go')
  })

  it('draws the add row starting on OpenCode Go, not the first provider, when the reading holds it', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    try {
      ;(globalThis as unknown as { window: unknown }).window = {
        localStorage: storage,
        sessionStorage: storage,
        location: { hash: '', search: '', protocol: '' },
        addEventListener: () => {},
        removeEventListener: () => {},
      }
      const { AddASlot } = await import('../src/web/components/GoSlotsPanel.tsx')
      const providers = Object.entries(THE_ROUTED_PROVIDERS).map(([id, one]) => ({ id, named: one.named }))
      expect(providers[0]?.id).not.toBe('opencode-go')

      const markup = renderToStaticMarkup(h(AddASlot, { providers, onChanged: () => {} }))
      const select = /<select[^>]*>([\s\S]*?)<\/select>/.exec(markup)?.[1] ?? ''
      const chosen = [...select.matchAll(/<option([^>]*)>/g)].find((one) => /\bselected\b/.test(one[1] ?? ''))
      const selected = /value="([^"]*)"/.exec(chosen?.[1] ?? '')?.[1]

      expect(selected).toBe('opencode-go')
      expect(selected).not.toBe(providers[0]?.id)
    } finally {
      if (hadAWindowBeforeTheFake) (globalThis as unknown as { window: unknown }).window = theWindowBeforeTheFake
      else delete (globalThis as unknown as { window?: unknown }).window
    }
  })

  it('leaves no fake window behind', () => {
    if (hadAWindowBeforeTheFake) expect((globalThis as unknown as { window?: unknown }).window).toBe(theWindowBeforeTheFake)
    else expect(Object.hasOwn(globalThis, 'window')).toBe(false)
  })
})
