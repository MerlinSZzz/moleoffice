// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING A CONVERSATION BETWEEN TWO AGENTS AS NEITHER OF THEM: BOTH SIDES IN ONE VIEW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M72 of design/messages/ACCEPTANCE.md section 40:
 *
 * *Today you can only switch to one agent's viewpoint; there is no neutral view of both sides
 * writing.* Four things:
 *
 *   1. THE DOOR TAKES NO SIDE AT ALL. `GET /api/messages/between/:pair` with no `?as=` answers, and
 *      says the side is nobody's rather than picking one. A side that names an agent outside the
 *      pair is still refused, and the refusal now names the third way as well.
 *   2. THE READ IS STILL RECORDED, on the same durable table, marked as a read from neither side:
 *      after it, the newest read of the pair is from neither side, at the second of this read. The
 *      mark cannot collide with an agent's id: a tilde is not a character a handle may hold.
 *   3. THE PANEL OPENS A ROW IN THAT VIEW, with three presses across the top and the neutral one
 *      chosen, and neither agent's messages drawn as the reader's own.
 *   4. AND THE SWITCH STILL WORKS FOR TAKING A VIEWPOINT, which M72 says may stay.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   require ?as= again                              → cases 1 and 3
 *   record the neutral read as one of the two       → case 2
 *   open a row on a side, as it did before          → case 3
 *   draw one agent's messages as the reader's own   → case 3
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CHAT_WORDS, NEITHER_SIDE } from '../src/shared/messages.ts'
import { nowStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const PAIR = 'builder-n~checker-m'

/**
 * THE REGISTRY ID OF AN AGENT, asked of the participant door by its handle. Since the mint (criterion
 * I1) a new agent's id is not its handle, and what the office stores and answers about an agent is its id.
 */
async function idOf(handle: string): Promise<string> {
  const res = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: AS_THE_OWNER })
  return ((await res.json()) as { participant: { id: string } }).participant.id
}

/** The pair as the office stores it: the two registry ids, sorted, with a tilde between them. */
async function storedPair(): Promise<string> {
  return [await idOf('builder-n'), await idOf('checker-m')].sort().join('~')
}

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function say(from: string, body: string, to: string, expected: number): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(from),
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'agent', id: to }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(expected)
}

/** Every durable read of one pair, oldest first, straight out of the table. */
async function readsOf(pair: string): Promise<{ asSide: string; at: string }[]> {
  const { default: Database } = await import('better-sqlite3')
  const held = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    return held
      .prepare('SELECT as_side AS asSide, at FROM conversation_reads WHERE pair = ? ORDER BY at, rowid')
      .all(pair) as { asSide: string; at: string }[]
  } finally {
    held.close()
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'read-as-neither', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['builder-n', 'Builder N'],
    ['checker-m', 'Checker M'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }
  // NOTHING HOLDS EITHER AGENT IN THIS TEST OFFICE, so the office stores each message, routes it and
  // answers 409 rather than 201; both messages are stored all the same, and the cases below read them.
  await say('builder-n', 'The gate is measured and it refuses on the wrong project.', 'checker-m', 409)
  await say('checker-m', 'Then the waiter cannot mark it. Take it to the owner.', 'builder-n', 409)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

// ---------------------------------------------------------------------------- the door

describe('the door takes no side at all', () => {
  it('answers with no ?as=, and says the side is nobody rather than picking one', async () => {
    // THE CONTROL: the same door with a side answers too, so "it answered" is not proof on its own.
    const asOne = await fetch(`${app.api}/api/messages/between/${PAIR}?as=builder-n`, { headers: AS_THE_OWNER })
    expect(asOne.status, await asOne.clone().text()).toBe(200)
    expect(((await asOne.json()) as { asSide: { id: string } | null }).asSide?.id).toBe(await idOf('builder-n'))

    const neutral = await fetch(`${app.api}/api/messages/between/${PAIR}`, { headers: AS_THE_OWNER })
    expect(neutral.status, await neutral.clone().text()).toBe(200)
    const said = (await neutral.json()) as {
      asSide: { id: string } | null
      between: { id: string }[]
      messages: { body: string }[]
      says: string
    }
    expect(said.asSide, 'a neutral read names no side, rather than quietly taking the first').toBe(null)
    expect(said.between.map((one) => one.id).sort()).toEqual([await idOf('builder-n'), await idOf('checker-m')].sort())
    // BOTH SIDES ARE IN THE ONE ANSWER, which is what the criterion is for.
    expect(said.messages.length).toBe(2)
    expect(said.says).toBe(CHAT_WORDS.readingBothSides)
  })

  it('still refuses a side that is not one of the two, and names the third way', async () => {
    const wrong = await fetch(`${app.api}/api/messages/between/${PAIR}?as=somebody-else`, { headers: AS_THE_OWNER })
    expect(wrong.status).toBe(400)
    const why = ((await wrong.json()) as { error: string }).error
    expect(why).toContain('somebody-else')
    expect(why).toContain('builder-n')
    expect(why).toContain('checker-m')
    expect(why, 'the refusal says a neutral read is possible').toContain('neither')
  })

  it('records the neutral read on the table, marked as a read from neither side', async () => {
    // THE NEWEST READ, NOT A COUNT OF ROWS. A read at the same point as the reader's newest one, from
    // the same side in the same second, writes no second row (wave 13y round 14), and the reads above
    // were made in the same second as this one.
    const from = nowStamp()
    const read = await fetch(`${app.api}/api/messages/between/${PAIR}`, { headers: AS_THE_OWNER })
    expect(read.status).toBe(200)
    const to = nowStamp()
    const newest = (await readsOf(await storedPair())).at(-1)
    expect(newest?.asSide, 'a neutral read is still a read and is still kept').toBe(NEITHER_SIDE)
    expect(newest !== undefined && newest.at >= from && newest.at <= to, `the newest read is at ${newest?.at}, not between ${from} and ${to}`).toBe(true)
    // AND THE MARK CAN NEVER BE MISTAKEN FOR AN AGENT, because a handle may not hold a tilde.
    expect(NEITHER_SIDE).toContain('~')
  })
})

// ---------------------------------------------------------------------------- the panel

describe('the panel reads one as neither of them', () => {
  it('opens a row in the neutral view, with both sides drawn as somebody else’s', async () => {
    await app.page.goto(`${app.site}/#/`)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
    await app.page.click('.px-chat-tab[data-tab="between"]')
    await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"]', { timeout: 20_000 })
    await app.page.waitForFunction(
      () =>
        [...document.querySelectorAll('.px-chat-contact .px-chat-name')].some(
          (one) => one.textContent?.includes('·') === true,
        ),
      undefined,
      { timeout: 20_000 },
    )
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-side', { timeout: 20_000 })

    // THREE PRESSES, THE NEUTRAL ONE FIRST AND CHOSEN, without anybody having pressed it.
    const sides = await app.page.$$eval('.px-chat-side', (all) =>
      all.map((one) => ({ words: one.textContent ?? '', chosen: one.getAttribute('data-chosen') })),
    )
    // THE TWO AGENTS' PRESSES ARE IN THE ORDER OF THE STORED PAIR, which is sorted by registry id; since
    // the mint (criterion I1) that order is not the order of their names, so it is not asserted here.
    expect(sides[0]?.words).toBe(CHAT_WORDS.bothSides)
    expect(sides.slice(1).map((one) => one.words).sort()).toEqual(['As Builder N', 'As Checker M'])
    expect(sides.map((one) => one.chosen)).toEqual(['yes', 'no', 'no'])
    expect(await app.page.textContent('.px-chat-watching')).toBe(CHAT_WORDS.readingBothSides)

    // BOTH SIDES ARE IN THE VIEW AND NEITHER IS THE READER'S OWN.
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-one').length >= 2, undefined, {
      timeout: 20_000,
    })
    const drawn = await app.page.$$eval('.px-chat-one', (all) =>
      all.map((one) => ({
        mine: one.getAttribute('data-mine'),
        who: one.querySelector('.px-chat-who')?.textContent ?? null,
      })),
    )
    expect(drawn.length).toBe(2)
    expect(drawn.every((one) => one.mine === 'no'), 'neither agent is drawn as the person').toBe(true)
    // AND EACH BUBBLE SAYS WHO WROTE IT, because both are on the same side of the view now.
    expect(drawn.map((one) => one.who)).toEqual(['Builder N', 'Checker M'])
  }, 120_000)

  it('still takes a viewpoint when the person presses one, and gives it back', async () => {
    await app.page.click('.px-chat-side:has-text("As Builder N")')
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat-one[data-mine="yes"]') !== null,
      undefined,
      { timeout: 20_000 },
    )
    const asOne = await app.page.$$eval('.px-chat-one', (all) => all.map((one) => one.getAttribute('data-mine')))
    expect(asOne).toEqual(['yes', 'no'])
    // THE NAME ON THE BUBBLE IS ONLY FOR THE NEUTRAL VIEW: with a side taken, the sides say it.
    expect(await app.page.$('.px-chat-who')).toBe(null)
    expect(await app.page.textContent('.px-chat-watching')).toBe(CHAT_WORDS.readingSomebodyElses)

    await app.page.click('.px-chat-side:nth-child(1)')
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat-one[data-mine="yes"]') === null,
      undefined,
      { timeout: 20_000 },
    )
    expect(await app.page.textContent('.px-chat-watching')).toBe(CHAT_WORDS.readingBothSides)
  }, 120_000)
})
