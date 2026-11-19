// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYS THIS OFFICE HAS: ITS OWN TWO, AND EACH RUNTIME'S OWN ASKED READ-ONLY. Criterion U2.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, AND WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE OFFICE'S OWN ARE TWO. Every reply names OpenRouter and Moonshot and no fourth provider.
 *      A reply that grew Anthropic or OpenAI as an office key would go red.
 *   2. SETTING ONE WRITES THE OFFICE'S FILE, through the one writer, and the door afterwards answers
 *      only "set". A door returning the value goes red.
 *   3. NO DOOR AND NO REPLY CARRIES A VALUE. Every reply body is searched for the made-up value, at
 *      any depth. A door that echoed it goes red.
 *   4. A READER USES THE FILE FIRST AND THE ENVIRONMENT LINE ONLY WHEN NOTHING IS SET THERE, and says
 *      which. A reader that preferred the environment line goes red.
 *   5. KIMI REFUSES BY NAME WHEN NO KEY IS SET ANYWHERE, rather than starting a run that fails four
 *      layers down. Replacing the refusal with the silent omission goes red.
 *   6. THE PROTECTION IS SAID IN THE OPERATING SYSTEM'S OWN TERMS, with the words "unverified on
 *      Windows". Claiming more goes red.
 *   7. THE READ-ONLY HALF SHOWS SET, NOT SET OR NOBODY HAS LOOKED, and never a value.
 *   8. THE TEST PRESS REPORTS ANSWERED, REFUSED AND UNREACHABLE against a stubbed provider, and sends
 *      nothing to a completion endpoint. A press that fell back to a completion goes red.
 *
 * Ordinary door cases stub the read-only runtime probes; one smoke case still asks the real probe.
 * EVERY VALUE IN THIS FILE IS MADE UP. The owner's real key is never read, set or printed.
 */

import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_PROTECTION_IN_FORCE, type TheKeys } from '../src/shared/office-keys.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'

// Keep the first server import inside the hook allowance.
buildTheFirstOfficeInAHook()

const MADE_UP = 'not-a-real-key-1234'
const ANOTHER_MADE_UP = 'not-a-real-key-5678'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-office-keys',
}

let t: TestDb
let app: FastifyInstance | undefined
const scratch: string[] = []

beforeEach(async () => {
  t = await freshDb()
  app = undefined
  const { useOsProbe } = await import('../src/server/lib/resources.ts')
  useOsProbe({ platform: 'test', whatAnAgentToolSaysAboutItsKey: () => ({
    state: 'nobody-has-looked', says: 'Nobody has looked: a test.', asked: 'not asked',
  }) } as never)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await app?.close()
  t.close()
  for (const directory of scratch) rmSync(directory, { recursive: true, force: true })
  scratch.length = 0
})

/** Only door cases import the server; ordinary reads use the production readers directly. */
async function door(): Promise<FastifyInstance> {
  if (app === undefined) {
    app = (await apiApp()).app
    await app.ready()
  }
  return app
}

/** The whole reading, through the door. */
async function theKeysFromTheDoor(headers = AS_THE_OWNER): Promise<TheKeys> {
  const reply = await (await door()).inject({ method: 'GET', url: '/api/office/keys', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheKeys
}

/** One set, through the door. */
async function setAKey(
  provider: string,
  value: string,
  headers = AS_THE_OWNER,
): Promise<{ status: number; body: string }> {
  const reply = await (await door()).inject({
    method: 'POST',
    url: '/api/office/keys/set',
    headers,
    payload: { provider, value },
  })
  return { status: reply.statusCode, body: reply.body }
}

/** The office's key file beside the throwaway database, as JSON. */
function theKeyFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as Record<string, unknown>
}

describe('the office keeps its own two keys, and no more', () => {
  it('lists OpenRouter and Moonshot, both not set before anything is written', async () => {
    const { theKeys } = await import('../src/server/lib/office-keys.ts')
    const said = theKeys()
    expect(said.office.map((one) => one.provider)).toEqual(['openrouter', 'moonshot'])
    expect(said.office.every((one) => one.set === false)).toBe(true)
    // AND NOTHING ELSE IS AN OFFICE KEY. The office's own half names two providers and no third;
    // Anthropic, OpenAI and Zhipu appear only in the read-only half, because those tools find their
    // own keys and the office passes them none.
    expect(said.office.map((one) => one.provider)).not.toContain('anthropic')
    expect(said.office.map((one) => one.provider)).not.toContain('openai')
    expect(said.office.map((one) => one.provider)).not.toContain('zhipu')
  })
})

describe('setting one writes the office file and never comes back', () => {
  it('writes the made-up value into the file, and the door answers only set', async () => {
    const wrote = await setAKey('openrouter', MADE_UP)
    expect(wrote.status, wrote.body).toBe(200)
    // THE FILE GAINED IT, which is the proof the write went through the one writer beside the
    // database rather than anywhere else.
    const providers = theKeyFile()['providers'] as Record<string, string>
    expect(providers['openrouter']).toBe(MADE_UP)

    const after = await theKeysFromTheDoor()
    expect(after.office.find((one) => one.provider === 'openrouter')?.set).toBe(true)
    // AND THE REPLY CARRIES THE WORD, NOT THE VALUE.
    expect(wrote.body).not.toContain(MADE_UP)
    expect(JSON.stringify(after)).not.toContain(MADE_UP)
    expect(after.office.find((one) => one.provider === 'openrouter')?.says).toContain('is set')
  })

  it('leaves the other provider alone', async () => {
    await setAKey('openrouter', MADE_UP)
    await setAKey('moonshot', ANOTHER_MADE_UP)
    const providers = theKeyFile()['providers'] as Record<string, string>
    expect(providers['openrouter']).toBe(MADE_UP)
    expect(providers['moonshot']).toBe(ANOTHER_MADE_UP)
  })

  it('refuses an agent, and writes nothing', async () => {
    const refused = await setAKey('openrouter', MADE_UP, AS_AN_AGENT)
    expect(refused.status).toBe(403)
    expect(refused.body).toContain('owner')
    expect((theKeyFile()['providers'] as Record<string, string>)['openrouter']).toBeUndefined()
  })

  it('refuses a provider this office does not call, and writes nothing', async () => {
    const refused = await setAKey('anthropic', MADE_UP)
    expect(refused.status).toBe(400)
    expect((theKeyFile()['providers'] as Record<string, string>)['anthropic']).toBeUndefined()
  })
})

describe('a reader reads the file first and says which it used', () => {
  it('falls back to the environment line only when the file holds nothing', async () => {
    const { providerKeyFromTheFileThenTheEnvironment } = await import('../src/config/provider-keys.mjs')
    const before = providerKeyFromTheFileThenTheEnvironment('openrouter', ['OPENROUTER_API_KEY'], {
      OPENROUTER_API_KEY: 'not-a-real-key-from-the-environment',
    })
    expect(before.value).toBe('not-a-real-key-from-the-environment')
    expect(before.from).toBe('OPENROUTER_API_KEY')

    // NOW THE FILE HOLDS ONE. It wins, and the reading says which store it came from.
    const { setProviderSecret } = await import('../src/server/lib/keys.ts')
    setProviderSecret('openrouter', MADE_UP)
    const after = providerKeyFromTheFileThenTheEnvironment('openrouter', ['OPENROUTER_API_KEY'], {
      OPENROUTER_API_KEY: 'not-a-real-key-from-the-environment',
    })
    expect(after.value).toBe(MADE_UP)
    expect(after.from).toContain("office's key file")
  })

  it('tells a name set to an empty value apart from one nobody set', async () => {
    const { providerKeyFromTheFileThenTheEnvironment } = await import('../src/config/provider-keys.mjs')
    const empty = providerKeyFromTheFileThenTheEnvironment('openrouter', ['OPENROUTER_API_KEY'], {
      OPENROUTER_API_KEY: '',
    })
    expect(empty.value).toBeNull()
    expect(empty.empty).toBe(true)
    expect(empty.why).toContain('empty')
    const absent = providerKeyFromTheFileThenTheEnvironment('openrouter', ['OPENROUTER_API_KEY'], {})
    expect(absent.empty).toBe(false)
  })
})

describe('a Kimi run refuses where the cause is when no key is set anywhere', () => {
  /** A directory holding a fake `kimi`, so the adapter reaches the key check rather than the install check. */
  function aPathWithKimiOnIt(): string {
    const directory = mkdtempSync(join(tmpdir(), 'u2-kimi-'))
    scratch.push(directory)
    const fake = join(directory, 'kimi')
    writeFileSync(fake, '#!/bin/sh\nexit 0\n')
    chmodSync(fake, 0o755)
    return directory
  }

  it('throws a refusal naming the setting and the press, and starts nothing', async () => {
    const { KimiAdapter } = await import('../src/worker/runtimes/kimi.ts')
    const adapter = new KimiAdapter({ PATH: aPathWithKimiOnIt() })
    const run = {
      agent: 'builder-x',
      session: 'a-session-id',
      prompt: 'hello',
      cwd: dirname(t.file),
      outputPath: join(dirname(t.file), 'out.log'),
      api: 'http://127.0.0.1:1',
      workspace: 'default',
    }
    expect(() => adapter.start(run)).toThrow(/KIMI_API_KEY/)
    expect(() => adapter.start(run)).toThrow(/Settings page/)
    expect(() => adapter.start(run)).toThrow(/MOONSHOT_API_KEY/)
  })

  it('starts once the office file holds a Moonshot key', async () => {
    const { setProviderSecret } = await import('../src/server/lib/keys.ts')
    setProviderSecret('moonshot', MADE_UP)
    const { whatKimiIsToldAboutItsModel } = await import('../src/worker/runtimes/kimi.ts')
    const told = whatKimiIsToldAboutItsModel({ PATH: aPathWithKimiOnIt() })
    expect(told['KIMI_API_KEY']).toBe(MADE_UP)
  })
})

describe('what protects the file, said no more strongly than the system gives', () => {
  it('names the operating system protection and says unverified on Windows', async () => {
    const { theKeys } = await import('../src/server/lib/office-keys.ts')
    const said = theKeys()
    expect(said.protection).toBe(THE_PROTECTION_IN_FORCE)
    expect(said.protection).toContain('unverified on Windows')
    expect(said.protection.toLowerCase()).not.toContain('encrypt')
  })
})

describe('each runtime is asked read-only and never hands back a value', () => {
  it('maps set, not set and nobody-has-looked through the probe, and carries no value', async () => {
    const { useOsProbe, LINUX_PROBE } = await import('../src/server/lib/resources.ts')
    const { theRuntimesOwnKeys } = await import('../src/server/lib/office-keys.ts')
    useOsProbe({
      platform: 'test',
      whatAnAgentToolSaysAboutItsKey: (which: string) => {
        if (which === 'claude-code') {
          return { state: 'nobody-has-looked', says: 'Nobody has looked: a test.', asked: 'not asked' }
        }
        if (which === 'codex') return { state: 'set', says: 'Set: a test.', asked: 'codex login status' }
        return { state: 'not-set', says: 'Not set: a test.', asked: 'opencode auth list' }
      },
    } as never)
    try {
      const rows = theRuntimesOwnKeys()
      expect(rows.map((one) => one.runtime)).toEqual(['claude-code', 'codex', 'opencode'])
      expect(rows.map((one) => one.state)).toEqual(['nobody-has-looked', 'set', 'not-set'])
      // THE PROVIDER IS NAMED, and no value is anywhere in the reading.
      expect(rows.find((one) => one.runtime === 'opencode')?.provider).toContain('Zhipu')
      expect(JSON.stringify(rows)).not.toContain(MADE_UP)
    } finally {
      useOsProbe(LINUX_PROBE)
    }
  })

  it('answers nobody-has-looked rather than reaching past a probe that cannot ask', async () => {
    const { useOsProbe, LINUX_PROBE } = await import('../src/server/lib/resources.ts')
    const { theRuntimesOwnKeys } = await import('../src/server/lib/office-keys.ts')
    useOsProbe({ platform: 'test' } as never)
    try {
      expect(theRuntimesOwnKeys().every((one) => one.state === 'nobody-has-looked')).toBe(true)
    } finally {
      useOsProbe(LINUX_PROBE)
    }
  })

  it('asks the real machine and gets one of the three words for each tool', async () => {
    const { useOsProbe, LINUX_PROBE } = await import('../src/server/lib/resources.ts')
    useOsProbe(LINUX_PROBE)
    const said = await theKeysFromTheDoor()
    expect(said.runtimes.map((one) => one.runtime)).toEqual(['claude-code', 'codex', 'opencode'])
    for (const one of said.runtimes) {
      expect(['set', 'not-set', 'nobody-has-looked']).toContain(one.state)
      expect(JSON.stringify(one)).not.toContain(MADE_UP)
    }
  })
})

describe('the test press spends nothing and never sends a completion', () => {
  it('reports answered, refused and unreachable against a stubbed provider', async () => {
    const { setProviderSecret } = await import('../src/server/lib/keys.ts')
    setProviderSecret('openrouter', MADE_UP)
    const { testTheOfficeKey } = await import('../src/server/lib/office-keys.ts')

    const answered = await testTheOfficeKey('openrouter', async () => new Response('{}', { status: 200 }))
    expect(answered.outcome).toBe('answered')
    expect(answered.says).not.toContain(MADE_UP)

    const refused = await testTheOfficeKey('openrouter', async () => new Response('{}', { status: 401 }))
    expect(refused.outcome).toBe('refused')

    const unreachable = await testTheOfficeKey('openrouter', async () => {
      throw new Error('the network is not there')
    })
    expect(unreachable.outcome).toBe('unreachable')
  })

  it('sends a metadata call, not a completion', async () => {
    const { setProviderSecret } = await import('../src/server/lib/keys.ts')
    setProviderSecret('openrouter', MADE_UP)
    const { testTheOfficeKey } = await import('../src/server/lib/office-keys.ts')
    const seen: string[] = []
    await testTheOfficeKey('openrouter', (async (url: string) => {
      seen.push(String(url))
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch)
    expect(seen).toEqual(['https://openrouter.ai/api/v1/key'])
    for (const url of seen) {
      expect(url).not.toContain('chat/completions')
      expect(url).not.toContain('messages')
    }
  })

  it('says there is nothing to test when the office file holds no key, and sends nothing', async () => {
    const { testTheOfficeKey } = await import('../src/server/lib/office-keys.ts')
    let called = 0
    const result = await testTheOfficeKey('moonshot', async () => {
      called += 1
      return new Response('{}', { status: 200 })
    })
    expect(called).toBe(0)
    expect(result.outcome).toBe('refused')
    expect(result.says).toContain('No Moonshot key is set')
  })

  it('drives the door with the provider stubbed, and no reply carries the value', async () => {
    await setAKey('moonshot', ANOTHER_MADE_UP)
    const seen: string[] = []
    vi.stubGlobal('fetch', (async (url: string) => {
      seen.push(String(url))
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch)
    const reply = await (await door()).inject({
      method: 'POST',
      url: '/api/office/keys/test',
      headers: AS_THE_OWNER,
      payload: { provider: 'moonshot' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ outcome: 'answered' })
    expect(reply.body).not.toContain(ANOTHER_MADE_UP)
    expect(seen).toEqual(['https://api.moonshot.ai/v1/models'])
  })

  it('refuses an agent the test press', async () => {
    await setAKey('moonshot', ANOTHER_MADE_UP)
    const reply = await (await door()).inject({
      method: 'POST',
      url: '/api/office/keys/test',
      headers: AS_AN_AGENT,
      payload: { provider: 'moonshot' },
    })
    expect(reply.statusCode).toBe(403)
  })
})
