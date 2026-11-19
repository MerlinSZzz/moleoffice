// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE'S TIME IN THE CHAT CARRIES THE DATE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M107 of design/messages/ACCEPTANCE.md: a message time in the chat shows the date as well
 * as the hour and minute, in the form 2026/01/25 22:09.
 *
 * A message in the chat used to draw `22:09` and nothing else, so a conversation read weeks later
 * could not say what day a line was written. Every message time in the chat now reads
 * `2026/01/25 22:09`, in the reader's local time. A system line's `--时间--` is a message time too,
 * so its dashes carry the date as well.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * One message is written through the record door, which is the door the composer uses, and the
 * write's answer carries the message's own stamp. That stamp is local wall-clock time, the form
 * `src/shared/time.ts` writes. The panel is then opened on the real product in a real browser and
 * the drawn time is read off `.px-chat-when`.
 *
 * The drawn text has to match the criterion's shape, and it has to be the message's OWN local date
 * and minute — not today's, and not a moment converted to some other clock. The expected value is
 * cut from the stamp the server wrote, so the assertion does not borrow the function under test.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE IT GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   draw only the hour and minute again (the mutation this criterion names: drop the date)  → both
 *   draw the date in a different order or with a different separator                        → case 1
 *   draw the test machine's today rather than the message's own stamp                       → case 2
 *   send the seconds or milliseconds along with the minute                                  → case 1 and case 2
 *
 * The stack comes from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and the
 * ports proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-x',
}

/**
 * THE AGENT'S CONTACT ROW, as `data-contact` names it: `agent:` and the agent's registry id. The
 * office gives a new agent an id of its own, which is not its handle, so it is read after the agent
 * is filed.
 */
let theAgentRow = ''
const THE_WORDS = 'The clamp holds at 11.8 N.'

/** The message's own stamp, read from the write's answer rather than from the clock again. */
let sentAt = ''

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

beforeAll(async () => {
  app = await liveApp({ name: 'message-time-date', viewport: { width: 1440, height: 1000 } })

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder X',
      data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const roster = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(roster.status, await roster.clone().text()).toBe(200)
  const registered = ((await roster.json()) as { agents: { id: string; handle: string }[] }).agents.find(
    (one) => one.handle === 'builder-x',
  )
  if (registered === undefined) throw new Error('the registry holds no agent with the handle builder-x')
  theAgentRow = `agent:${registered.id}`

  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'message',
      title: THE_WORDS,
      data: { body: THE_WORDS, to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  const answer = (await said.json()) as { record: { createdAt: string } }
  sentAt = answer.record.createdAt
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the chat panel on the conversation with Builder X, wherever the panel opens to. */
async function openTheConversation(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  // THE PANEL REMEMBERS WHICH CONTACT WAS OPEN (M58), so a later case may come back straight into
  // the conversation and there is no contact row to press.
  if ((await app.page.$('.px-chat-said')) === null) {
    await app.page.waitForSelector(`.px-chat-contact[data-contact="${theAgentRow}"]`, { timeout: 20_000 })
    await app.page.click(`.px-chat-contact[data-contact="${theAgentRow}"]`)
  }
  await app.page.waitForSelector('.px-chat-said .px-chat-words', { timeout: 20_000 })
}

/** Every message time drawn in the open conversation. */
async function theDrawnTimes(): Promise<string[]> {
  return app.page.$$eval('.px-chat-said .px-chat-when', (all) =>
    all.map((one) => (one.textContent ?? '').trim()),
  )
}

describe("a message's time in the chat carries the date", () => {
  it('draws it as YYYY/MM/DD HH:MM', async () => {
    await openTheConversation()
    const drawn = await theDrawnTimes()
    // THE CONTROL: there is a time to measure. A panel drawing no time would pass the loop below.
    expect(drawn.length, 'the conversation draws no message time, so nothing is measured').toBeGreaterThan(0)
    for (const one of drawn) {
      expect(one, `a message time does not carry the date: ${one}`).toMatch(
        /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
      )
    }
  }, 120_000)

  it("draws the message's own local date and minute, to the minute", async () => {
    await openTheConversation()
    const drawn = await theDrawnTimes()
    expect(drawn.length, 'the conversation draws no message time, so nothing is measured').toBe(1)

    // THE MESSAGE'S OWN STAMP, as the server wrote it: local wall-clock time.
    expect(sentAt, 'the write did not answer with the message\u2019s own stamp').toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    )
    const itsDate = sentAt.slice(0, 10).replace(/-/g, '/')
    const itsMinute = sentAt.slice(11, 16)
    expect(drawn[0], 'the drawn time is not the message\u2019s own local date and minute').toBe(
      `${itsDate} ${itsMinute}`,
    )

    // AND THE FORM ITSELF, from the same stamp: two digits everywhere but the year.
    const [year, month, day] = sentAt.slice(0, 10).split('-')
    const [hour, minute] = itsMinute.split(':')
    expect(`${year}/${pad(Number(month))}/${pad(Number(day))} ${pad(Number(hour))}:${pad(Number(minute))}`).toBe(
      drawn[0],
    )
  }, 120_000)
})
