// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ENTRY PRESS GIVES THIS COMPUTER'S CODING-TOOL SESSIONS AN AGENT OF THEIR OWN, WITH A KEY OF ITS OWN.
 *
 * The press that puts the entry in place on the Settings page writes the hook's lines, and then, on the person's own
 * proved press, finds or makes one agent for this computer's sessions and keeps its key in `entry-agent-key`, with the
 * agent's registry id in `entry-agent`, beside the office's key file (src/server/lib/an-agents-key-file.ts, with the
 * paths named in src/config/the-entrys-agent.mjs). The cases:
 *
 *   1. The first press makes the agent and its key: both files private, a live key row of that agent, the state held.
 *   2. A second press keeps a sound key: the same bytes, the same agent, no new key row.
 *   3. A revoked key, a missing key file and another agent's key are each replaced for the same agent, and that
 *      agent's other live keys are revoked, so it holds one live key and it is the one in the file.
 *   4. A retired agent, and a missing `entry-agent` file, each make a new agent, and the answer names it.
 *   5. An agent's press, and a press under the person's grant, make no agent, no key and no file, and say why.
 *   6. The state door answers none-yet, then held, then refused once the agent is retired, and never what a file holds.
 *   7. The three state words are in the English and the Chinese word lists.
 *
 * WHAT IS REAL. The press's key step is called as the entry door calls it, after freshDb, on this file's own database;
 * the files are in that database's own folder. Every key here is one this test office made. No assertion prints one.
 *
 * RED BEFORE THE CODE. src/server/lib/an-agents-key-file.ts, src/config/the-entrys-agent.mjs, the state door and the
 * three words did not exist, so every case fails at its import, at the door's 404, or at a word that is not there.
 */
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import type { Actor } from '../src/server/lib/records.ts'
import { NARROWED_BY_PERMISSION } from '../src/shared/disclosure.ts'
import type { TheEntrysKeyState } from '../src/shared/entry.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The person's own press, proved by their key, as the entry door hands it to the key step. */
const THE_PERSONS_PRESS: Actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' }

/** The two entry files of this file's office, beside its key file. */
async function theFiles(): Promise<{ folder: string; key: string; agent: string }> {
  const { theEntrysFilesBeside } = await import('../src/config/the-entrys-agent.mjs')
  return theEntrysFilesBeside(join(dirname(t.file), 'keys.json'))
}

/** Take both entry files away. */
async function noEntryFiles(): Promise<void> {
  const files = await theFiles()
  rmSync(files.key, { force: true })
  rmSync(files.agent, { force: true })
}

/** The registry id the entry agent file holds. */
async function theEntryAgent(): Promise<string> {
  return readFileSync((await theFiles()).agent, 'utf8').trim()
}

/** The hash of the key the entry key file holds, so a case compares keys without holding one in a message. */
async function theKeyFilesHash(): Promise<string> {
  const { keyHash } = await import('../src/server/lib/keys.ts')
  return keyHash(readFileSync((await theFiles()).key, 'utf8').trim())
}

/** The live key rows of an agent, by hash. */
function theLiveKeysOf(agentId: string): { hash: string; mint: string | null }[] {
  return t.client.sqlite
    .prepare("SELECT key_hash AS hash, mint_proved_by AS mint FROM held_keys WHERE whose_kind = 'agent' AND whose_id = ? AND revoked_at IS NULL")
    .all(agentId) as { hash: string; mint: string | null }[]
}

/** One agent row, or undefined. */
function theAgentRow(id: string): { handle: string; retired: number } | undefined {
  return t.client.sqlite.prepare('SELECT handle, retired FROM agents WHERE id = ?').get(id) as { handle: string; retired: number } | undefined
}

/** How many agent rows there are. */
const theAgentRows = (): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM agents').get() as { n: number }).n

/** Press, as the entry door does after its lines are written. */
async function aPress(actor: Actor = THE_PERSONS_PRESS): Promise<{ thisComputersKey: string; says: string }> {
  const { giveTheEntrysAgentItsKey } = await import('../src/server/lib/an-agents-key-file.ts')
  return giveTheEntrysAgentItsKey(actor, 'default')
}

/** What the state door answers, as the person asks it. */
async function theStateDoor(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/office/install-the-entry/this-computers-key',
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader() },
  })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/**
 * The whole answer the state door gives for a state, so a case compares with it and the answer names nothing else.
 * The door answers the state alone (src/server/api/entry.ts). The office adds the narrowing note, as null, to every
 * object answer below 400 (sayWhetherPermissionNarrowedIt in src/server/lib/http.ts).
 */
function theDoorsAnswerFor(state: TheEntrysKeyState): Record<string, unknown> {
  return { thisComputersKey: state, [NARROWED_BY_PERMISSION]: null }
}

/** Retire an agent as the person, as every way of retiring one does. */
async function retire(agentId: string): Promise<void> {
  const { retireThisAgent } = await import('../src/server/lib/participants.ts')
  retireThisAgent(agentId, { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, 'A test retires the entry agent.')
}

describe('the entry press’s key step', () => {
  it('the state door answers none-yet before any press, and the answer names no file content', async () => {
    await noEntryFiles()
    const door = await theStateDoor()
    expect(door.status, JSON.stringify(door.body)).toBe(200)
    expect(door.body).toEqual(theDoorsAnswerFor('none-yet'))
  }, 60_000)

  it('the first press makes the entry agent and its key: two private files, one live key row, held', async () => {
    await noEntryFiles()
    const { THE_ENTRYS_AGENT_TITLE, THE_ENTRYS_HANDLE } = await import('../src/server/lib/an-agents-key-file.ts')
    const before = theAgentRows()
    const pressed = await aPress()
    expect(pressed.thisComputersKey, pressed.says).toBe('held')
    expect(theAgentRows(), 'the press made no agent, or more than one').toBe(before + 1)
    const files = await theFiles()
    if (process.platform !== 'win32') {
      expect(statSync(files.key).mode & 0o777, 'the key file is not private').toBe(0o600)
      expect(statSync(files.agent).mode & 0o777, 'the entry agent file is not private').toBe(0o600)
    }
    const agent = await theEntryAgent()
    const row = theAgentRow(agent)
    expect(row, 'the entry agent file names no agent').toBeDefined()
    expect(row!.retired).toBe(0)
    expect(row!.handle.startsWith(THE_ENTRYS_HANDLE)).toBe(true)
    const title = t.client.sqlite
      .prepare("SELECT title FROM records WHERE kind = 'agent' AND deleted_at IS NULL AND json_extract(data, '$.handle') = ?")
      .get(row!.handle) as { title: string } | undefined
    expect(title?.title).toBe(THE_ENTRYS_AGENT_TITLE)
    const live = theLiveKeysOf(agent)
    expect(live.length, 'the entry agent holds no live key, or more than one').toBe(1)
    expect(live[0]!.hash === (await theKeyFilesHash()), 'the live key is not the one in the file').toBe(true)
    expect(live[0]!.mint, "the key's mint is not the person's press").toBe('the-persons-press')
    expect(pressed.says).toContain(row!.handle)
    expect(pressed.says).toContain(files.key)
    expect((await theStateDoor()).body).toEqual(theDoorsAnswerFor('held'))
  }, 60_000)

  it('a second press keeps a sound key and writes nothing: the same bytes, the same agent, no new key row', async () => {
    await noEntryFiles()
    await aPress()
    const files = await theFiles()
    const agent = await theEntryAgent()
    const keyBytes = readFileSync(files.key)
    const keyChanged = statSync(files.key).mtimeMs
    const agentChanged = statSync(files.agent).mtimeMs
    const rows = (t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n
    const agents = theAgentRows()
    const again = await aPress()
    expect(again.thisComputersKey, again.says).toBe('held')
    expect(readFileSync(files.key).equals(keyBytes), 'the second press changed the key file').toBe(true)
    expect(statSync(files.key).mtimeMs, 'the second press wrote the key file').toBe(keyChanged)
    expect(statSync(files.agent).mtimeMs, 'the second press wrote the entry agent file').toBe(agentChanged)
    expect(await theEntryAgent()).toBe(agent)
    expect((t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n, 'the second press made a key').toBe(rows)
    expect(theAgentRows(), 'the second press made an agent').toBe(agents)
  }, 60_000)

  it('a revoked key is replaced for the same agent, which then holds the one live key in the file', async () => {
    await noEntryFiles()
    await aPress()
    const agent = await theEntryAgent()
    const { revokeEveryLiveKeyHeldBy } = await import('../src/server/lib/keys.ts')
    revokeEveryLiveKeyHeldBy('agent', agent, 'A test revokes the entry key.')
    expect((await theStateDoor()).body).toEqual(theDoorsAnswerFor('refused'))
    const old = await theKeyFilesHash()
    const pressed = await aPress()
    expect(pressed.thisComputersKey, pressed.says).toBe('held')
    expect(await theEntryAgent(), 'a revoked key made a new agent').toBe(agent)
    expect((await theKeyFilesHash()) === old, 'the revoked key was kept').toBe(false)
    const live = theLiveKeysOf(agent)
    expect(live.length).toBe(1)
    expect(live[0]!.hash === (await theKeyFilesHash()), 'the live key is not the one in the file').toBe(true)
  }, 60_000)

  it('a missing key file is made again for the same agent, and the key it held before is revoked', async () => {
    await noEntryFiles()
    await aPress()
    const agent = await theEntryAgent()
    const old = await theKeyFilesHash()
    rmSync((await theFiles()).key)
    const pressed = await aPress()
    expect(pressed.thisComputersKey, pressed.says).toBe('held')
    expect(await theEntryAgent(), 'a missing key file made a new agent').toBe(agent)
    const live = theLiveKeysOf(agent)
    expect(live.length, 'the agent holds more than the one key in the file').toBe(1)
    expect(live[0]!.hash === (await theKeyFilesHash()), 'the live key is not the one in the file').toBe(true)
    expect(live.some((one) => one.hash === old), 'the key the lost file held is still live').toBe(false)
  }, 60_000)

  it('another agent’s key in the file is replaced for the entry agent, whose other live keys are revoked', async () => {
    // TWO ENTRY AGENTS, made by two presses with the entry agent file taken away between them, so the first one's key is
    // a live key of another agent.
    await noEntryFiles()
    await aPress()
    const first = await theEntryAgent()
    const firstsKey = readFileSync((await theFiles()).key)
    rmSync((await theFiles()).agent)
    await aPress()
    const second = await theEntryAgent()
    expect(second, 'the second press found the first agent though its file was gone').not.toBe(first)
    const secondsKey = await theKeyFilesHash()
    writeFileSync((await theFiles()).key, firstsKey, { mode: 0o600 })
    expect((await theStateDoor()).body).toEqual(theDoorsAnswerFor('refused'))
    const pressed = await aPress()
    expect(pressed.thisComputersKey, pressed.says).toBe('held')
    expect(await theEntryAgent()).toBe(second)
    const live = theLiveKeysOf(second)
    expect(live.length, 'the entry agent holds more than the one key in the file').toBe(1)
    expect(live[0]!.hash === (await theKeyFilesHash()), 'the live key is not the one in the file').toBe(true)
    expect(live.some((one) => one.hash === secondsKey), "the entry agent's earlier key is still live").toBe(false)
  }, 60_000)

  it('a retired entry agent makes a new agent, and the answer names it; the state door says refused before the press', async () => {
    await noEntryFiles()
    await aPress()
    const old = await theEntryAgent()
    await retire(old)
    expect((await theStateDoor()).body).toEqual(theDoorsAnswerFor('refused'))
    const pressed = await aPress()
    expect(pressed.thisComputersKey, pressed.says).toBe('held')
    const made = await theEntryAgent()
    expect(made, 'a retired agent was kept as the entry agent').not.toBe(old)
    expect(theAgentRow(made)?.retired).toBe(0)
    expect(pressed.says).toContain(theAgentRow(made)!.handle)
    expect(pressed.says, 'the answer does not name the file that named the retired agent').toContain((await theFiles()).agent)
    expect(theLiveKeysOf(made).length).toBe(1)
  }, 60_000)

  it('a missing entry agent file beside a key file makes a new agent, and the answer names the missing file', async () => {
    await noEntryFiles()
    await aPress()
    const old = await theEntryAgent()
    rmSync((await theFiles()).agent)
    const pressed = await aPress()
    expect(pressed.thisComputersKey, pressed.says).toBe('held')
    const made = await theEntryAgent()
    expect(made).not.toBe(old)
    expect(pressed.says).toContain(theAgentRow(made)!.handle)
    expect(pressed.says, 'the answer does not name the missing entry agent file').toContain((await theFiles()).agent)
  }, 60_000)

  const NO_KEY: readonly { name: string; actor: Actor }[] = [
    { name: 'an agent’s press, proved by no key of the person’s', actor: { type: 'agent', id: 'made-up-agent-that-pressed', provedBy: 'an-agent-key' } },
    {
      name: 'a press under the person’s grant',
      actor: {
        type: 'human',
        id: THE_TEST_OFFICES_OWNER.id,
        provedBy: 'the-person-key',
        press: { operation: 'office.install-entry', aRead: false, reason: null, underTheGrant: 'made-up-grant' },
      } as Actor,
    },
  ]

  for (const one of NO_KEY) {
    it(`${one.name} makes no agent, no key and no file, and says why`, async () => {
      await noEntryFiles()
      const { theKeyThisPressMayMake } = await import('../src/server/lib/an-agents-key-file.ts')
      const may = theKeyThisPressMayMake(one.actor)
      expect(may.proof, 'the case is a press that may make a key').toBeNull()
      const agents = theAgentRows()
      const rows = (t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n
      const pressed = await aPress(one.actor)
      expect(pressed.thisComputersKey).toBe('none-yet')
      expect(pressed.says).toBe(may.why)
      expect(theAgentRows(), 'the press made an agent').toBe(agents)
      expect((t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n, 'the press made a key').toBe(rows)
      const files = await theFiles()
      expect(() => statSync(files.key), 'the press wrote a key file').toThrow()
      expect(() => statSync(files.agent), 'the press wrote an entry agent file').toThrow()
    }, 60_000)
  }
})

describe('the three state words', () => {
  it('are in the English and the Chinese word lists, each its own', async () => {
    const { THE_ENTRYS_KEY_WORDS } = await import('../src/shared/entry.ts')
    const { createI18n } = await import('../src/shared/i18n.ts')
    for (const language of ['en', 'zh'] as const) {
      const words = createI18n(language)
      const said = Object.values(THE_ENTRYS_KEY_WORDS).map((key) => words.t(key))
      for (const [n, word] of said.entries()) {
        expect(word, `${language}: ${Object.values(THE_ENTRYS_KEY_WORDS)[n]!} is not in the list`).not.toMatch(/^⟦/u)
        expect(word.trim()).not.toBe('')
      }
      expect(new Set(said).size, `${language}: two states read the same`).toBe(said.length)
      expect(words.check().fallbacks, `${language}: a state word fell back to English`).toEqual([])
    }
  })
})
