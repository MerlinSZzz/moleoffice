// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY NAMES ITS SENDER BY THE AGENT'S RECORD OR HANDLE, AND NEVER DRAWS AN ID AS A NAME (wave 13y round 85,
 * item 15c).
 *
 * The dialogue an emergency message is drawn in (`Forced` in src/web/components/Forced.tsx) said who sent it with a
 * `nameOf` that matched the stored sender by registry id only, and fell back to the id it was given. A sender stored as
 * an agent's handle was drawn as the handle, and one nobody answers to was drawn as its id. A message that stored no
 * sender had an empty line. Now the dialogue reads the stored sender the way every stored sender is read
 * (`theAgentAStoredSenderNames` in src/shared/messages.ts): the registry id, then the agent's own record, then the one
 * agent with that handle. When nobody answers, or no sender was stored, the dialogue says so in words.
 *
 * THE WORDS ARE EVERY PAGE'S (wave 13y round 88, item 15e). The dialogue had two sentences of its own for those two
 * cases. Now it asks `theWritersName` in src/shared/messages.ts, as every page does, and says what they say: "An agent
 * this page has no name for" for a stored agent nobody answers to, and "A writer that left no name" for a message that
 * stored no sender.
 *
 * MADE-UP RECORDS, filed by the test office's person: four agents, each with a name, a handle and a record of its own,
 * and one emergency from each of them to the person in each case.
 *
 * THE STORED SENDER IS GIVEN ITS SHAPE IN THE DATABASE, after the message is written through the door. The door stores
 * the writer's registry id (criterion I1) and refuses a writer nobody registered (criterion M59). A sender stored as a
 * handle, as an id nobody has or as nothing is in rows written before those rules, and the only way to have one now is
 * to write a message and then give it that shape, as tests/a-message-from-an-unregistered-writer-opens-where-it-is-read
 * .test.ts does. No door is known to store an agent's record id as a sender. That shape is made too, because the
 * dialogue reads every stored sender through the one reader. Each case first checks that the door stored the registry
 * id, so it proves the shape it then makes.
 *
 * MUTATIONS, after a control run, each of `nameOf` in src/web/components/Forced.tsx:
 *   1. It compares the registry id only, as before round 85: the handle and record cases fail.
 *   2. It draws the stored id when nobody answers, as before round 85: the case of an id nobody has fails.
 *   3. It draws nothing for a message that stored no sender, as before round 85: the case with no sender fails.
 *   4. It says the dialogue's own two sentences of round 85 again, in place of every page's words: the case of an id
 *      nobody has and the case with no sender fail (round 88).
 *
 * With W13Y_FORCED_NAME_SHOTS set to a folder, it photographs the dialogue at 1440, 990, 660 and 390 in both themes,
 * once with a sender stored as a handle and once with an id nobody has, under the made-up label.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'

/** The four agents, each a name, a handle and a record, every one a different string. */
const AGENTS = {
  handle: { name: 'Fire Warden', handle: 'fire-warden' },
  record: { name: 'Flood Watch', handle: 'flood-watch' },
  nobody: { name: 'Smoke Alarm', handle: 'smoke-alarm' },
  none: { name: 'Gas Meter', handle: 'gas-meter' },
} as const
type Shape = keyof typeof AGENTS
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
const SHOTS = process.env.W13Y_FORCED_NAME_SHOTS
const LABEL = 'Made-up data — a test office with four agents and their emergency messages, not real office data'
/**
 * What every page says where it has no name for a stored agent, in English, read from the list the page reads. NOT
 * TYPED AS THE LIST, so the file runs the same before the sentence was in it, and fails there on what the dialogue draws.
 */
const NO_NAME = (enWave13y as Record<string, unknown>)['chat.anAgentThisPageHasNoNameFor']
/** What every page says for a message that stored no sender and typed no line. */
const NO_SENDER = CHAT_WORDS.unregisteredWithNoName

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

describe('the emergency dialogue', () => {
  let app: LiveApp
  /** Each agent's registry id and its own record's id, as the office gave them. */
  const ids: Record<Shape, { registry: string; record: string }> = {
    handle: { registry: '', record: '' },
    record: { registry: '', record: '' },
    nobody: { registry: '', record: '' },
    none: { registry: '', record: '' },
  }
  let written = 0

  beforeAll(async () => {
    app = await liveApp({ name: 'emergency-names', viewport: { width: 1440, height: 1000 } })
    for (const shape of Object.keys(AGENTS) as Shape[]) {
      const { name, handle } = AGENTS[shape]
      const reply = await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers: AS_THE_PERSON,
        body: JSON.stringify({ kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } }),
      })
      const text = await reply.text()
      expect(reply.status, text).toBe(201)
      ids[shape].record = (JSON.parse(text) as { record: { id: string } }).record.id
    }
    const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
      agents: { id: string; handle: string; name: string; record?: string | null }[]
    }
    for (const shape of Object.keys(AGENTS) as Shape[]) {
      const row = listed.agents.find((one) => one.handle === AGENTS[shape].handle)
      ids[shape].registry = row?.id ?? ''
      // THE NAME, THE HANDLE, THE REGISTRY ID AND THE RECORD ARE DIFFERENT STRINGS, or a case would prove nothing.
      expect([row?.name, row?.record], JSON.stringify(row)).toEqual([AGENTS[shape].name, ids[shape].record])
      expect(new Set([AGENTS[shape].name, AGENTS[shape].handle, ids[shape].registry, ids[shape].record]).size).toBe(4)
    }
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** What the stored sender of one shape is made into: an agent's handle, its record, an id nobody has, or nothing. */
  const storedAs = (shape: Shape): string | null =>
    shape === 'handle' ? AGENTS.handle.handle : shape === 'record' ? ids.record.record : shape === 'nobody' ? NOBODYS : null

  /** Writes one emergency from the agent of `shape` to the person, and gives its stored sender that shape. */
  async function anEmergencyStoredAs(shape: Shape): Promise<{ id: string; body: string }> {
    written += 1
    const body = `Emergency ${String(written)}, its sender stored as ${shape}.`
    const reply = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[shape].handle },
      body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }], urgent: true } }),
    })
    const text = await reply.text()
    expect(reply.status, text).toBe(201)
    const id = (JSON.parse(text) as { record: { id: string } }).record.id
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(id) as { sentBy: string }
      // THE CONTROL: the door stored the registry id, so the shape below is made here and not found.
      expect(JSON.parse(stored.sentBy), 'what the door stored').toEqual({ kind: 'agent', id: ids[shape].registry })
      const as = storedAs(shape)
      if (as === null) db.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(id)
      else db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(as, id)
    } finally {
      db.close()
    }
    return { id, body }
  }

  /** Marks one emergency seen as the person, through the door, so the next case's is the only one waiting. */
  async function seen(id: string): Promise<void> {
    const reply = await fetch(`${app.api}/api/messages/${id}/mark`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ mark: 'seen' }) })
    expect(reply.ok, `marking ${id} seen: ${await reply.text()}`).toBe(true)
  }

  /** A window of its own on the records page, in one theme and at one width, with the dialogue drawn. */
  async function withTheDialogue(theme: 'light' | 'dark', width: number) {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.px-forced').waitFor({ timeout: 30_000 })
    return { context, page }
  }

  /** The body and the sender line of the dialogue on screen. */
  const theOneOnScreen = async (page: Page) => ({
    body: ((await page.locator('.px-forced-body').textContent()) ?? '').trim(),
    who: ((await page.locator('.px-forced-who').textContent()) ?? '').trim(),
  })

  /** Every id a case made, which the dialogue must never draw as a name. */
  const everyId = (): string[] => [NOBODYS, ...Object.values(ids).flatMap((one) => [one.registry, one.record]), ...Object.values(AGENTS).map((one) => one.handle)]

  for (const [shape, called, says] of [
    ['handle', "the agent's handle", () => AGENTS.handle.name],
    ['record', "the agent's own record", () => AGENTS.record.name],
    ['nobody', 'an id nobody has', () => NO_NAME as string],
    ['none', 'nothing', () => NO_SENDER as string],
  ] as const) {
    it(`with its sender stored as ${called}, says ${shape === 'nobody' || shape === 'none' ? 'so in words' : 'the agent by its name'}`, async () => {
      const { id, body } = await anEmergencyStoredAs(shape)
      try {
        const { context, page } = await withTheDialogue('light', 1440)
        try {
          const drawn = await theOneOnScreen(page)
          expect(drawn.body, 'the dialogue on screen is the one this case wrote').toBe(body)
          expect(everyId().filter((one) => drawn.who.includes(one)), 'an id is drawn as the sender').toEqual([])
          expect(drawn.who, 'the sender line is empty').not.toBe('')
          expect(drawn.who).toBe(says())
        } finally {
          await context.close()
        }
      } finally {
        await seen(id)
      }
    }, 120_000)
  }

  it.runIf(SHOTS)('photographs the dialogue at the four widths in both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        // ONE AT A TIME, so the picture's name says which sender is drawn.
        for (const shape of ['handle', 'nobody'] as const) {
          const { id, body } = await anEmergencyStoredAs(shape)
          try {
            const { context, page } = await withTheDialogue(theme, width)
            try {
              expect((await theOneOnScreen(page)).body).toBe(body)
              await putTheMadeUpLabelIn(page, LABEL, page.locator('.px-forced-mark'), `the dialogue, ${shape}, ${theme} at ${width}`)
              await page.screenshot({ path: `${SHOTS}/${shape}-${theme}-${width}.png` })
            } finally {
              await context.close()
            }
          } finally {
            await seen(id)
          }
        }
      }
    }
  }, 900_000)
})
