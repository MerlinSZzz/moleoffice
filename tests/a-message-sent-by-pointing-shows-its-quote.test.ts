// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE SENT BY POINTING SHOWS, ABOVE ITS WORDS, A QUOTE OF WHAT IT POINTS AT.
 *
 * A message sent from a right-click carries what it points at, and the chat
 * draws that above the message's own words the way a chat app draws a reply quote: the pointed words,
 * and the name of the thing pointed at as a link. Agents may send the same way, and their messages
 * are drawn the same way. A long pointed quote keeps the same short opening as the comment composer,
 * with an ellipsis that says it continues. A message pointing at a whole thing, with no words, draws
 * the block with the name only.
 * For such a message the block replaces the line that used to say which record it was about, and
 * keeps its link.
 *
 * WHAT THIS FILE DOES. It files, in a test office, one agent and one record to point at, then four
 * messages in the conversation between the person and that agent: the person's, pointing at words;
 * the agent's, pointing at words; the person's, pointing at the whole record; and the person's,
 * pointing at a long run of words. It opens the conversation in the corner panel and reads each
 * bubble. The first case also checks that an agent's message carrying a target is stored with it,
 * because the drawing is worth nothing if the door drops the target.
 *
 * The people, the agent and the record are made up.
 *
 * Set POINTED_QUOTE_SHOTS to a folder to photograph the conversation at 1440 and 390 in both looks,
 * at 1440 in Chinese and at 1440 in the test language. The ordinary run takes no picture.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { shortenToWords } from '../src/shared/shortening.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}
const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'quote-agent',
}

const RECORD_TITLE = 'Gripper trial notes'
const PERSON_POINTED = 'the third trial held for eleven seconds'
const PERSON_SAYS = 'Which clock measured this?'
const AGENT_POINTED = 'the force reading drifted after that'
const AGENT_SAYS = 'I think this drift is the sensor warming up.'
const WHOLE_SAYS = 'Is this whole note still true?'
const LONG_SAYS = 'This paragraph is too long to read in the chat.'
const SEVERAL_SAYS = 'Two points about the same note.'
const FIRST_OF_TWO = 'the third trial'
const SECOND_OF_TWO = 'eleven seconds'
const LONG_POINTED = Array.from(
  { length: 30 },
  (_, n) => `Trial ${String(n + 1)} closed on the part and the reading stayed flat for a while.`,
).join(' ')

let recordId = ''
const ids: Record<string, string> = {}

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** A target on the record, with the pointed words when there are any. */
function pointingAt(words: string | null): unknown {
  if (words === null) {
    return {
      target: { kind: 'record', recordId, workspaceId: 'default' },
      place: { at: 'surface' },
    }
  }
  const shown = shortenToWords(words)
  return {
    target: { kind: 'record', recordId, workspaceId: 'default' },
    place: {
      at: 'quote',
      words: shown.words,
      ...(shown.shortened ? { cut: true } : {}),
    },
  }
}

/** The bubble whose own words hold this sentence. */
function bubbleSaying(words: string): string {
  return `.px-chat-bubble:has(.px-chat-words:has-text("${words}"))`
}

/** What one bubble's quote block draws. */
async function quoteIn(words: string): Promise<{
  blocks: number
  quoted: string[]
  names: string[]
  links: string[]
  aboutLines: number
  quoteAboveWords: boolean
  numbers: string[]
}> {
  return await app.page.$eval(bubbleSaying(words), (bubble) => {
    const blocks = [...bubble.querySelectorAll('.px-chat-quote')]
    const first = bubble.querySelector('.px-chat-quote')
    const said = bubble.querySelector('.px-chat-words')
    return {
      blocks: blocks.length,
      quoted: blocks.map((one) => (one.querySelector('.px-chat-quote-words')?.textContent ?? '').trim()),
      names: blocks.map((one) => (one.querySelector('.px-chat-quote-name')?.textContent ?? '').trim()),
      links: blocks.map((one) => one.querySelector('a')?.getAttribute('href') ?? ''),
      aboutLines: bubble.querySelectorAll('.px-chat-about').length,
      quoteAboveWords:
        first !== null && said !== null && (first.compareDocumentPosition(said) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      numbers: blocks.map((one) => (one.querySelector('.px-chat-quote-number')?.textContent ?? '').trim()),
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'pointed-quote', viewport: { width: 1440, height: 1000 } })
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Quote Agent',
    data: { handle: 'quote-agent', runtime: 'claude-code', state: 'active' },
  })
  recordId = await file(AS_THE_OWNER, {
    kind: 'note',
    title: RECORD_TITLE,
    data: { body: 'The third trial held for eleven seconds, and the force reading drifted after that.' },
  })
  const toTheAgent = [{ kind: 'agent', id: 'quote-agent' }]
  const toThePerson = [{ kind: 'person', id: THE_PERSON }]
  ids['person'] = await file(AS_THE_OWNER, {
    kind: 'message',
    title: PERSON_SAYS,
    data: { body: PERSON_SAYS, to: toTheAgent, target: pointingAt(PERSON_POINTED) },
  })
  ids['agent'] = await file(AS_THE_AGENT, {
    kind: 'message',
    title: AGENT_SAYS,
    data: { body: AGENT_SAYS, to: toThePerson, target: pointingAt(AGENT_POINTED) },
  })
  ids['whole'] = await file(AS_THE_OWNER, {
    kind: 'message',
    title: WHOLE_SAYS,
    data: { body: WHOLE_SAYS, to: toTheAgent, target: pointingAt(null) },
  })
  // SEVERAL QUOTES IN ONE MESSAGE, in the message's own `quotes`.
  ids['several'] = await file(AS_THE_OWNER, {
    kind: 'message',
    title: SEVERAL_SAYS,
    data: { body: SEVERAL_SAYS, to: toTheAgent, quotes: [pointingAt(FIRST_OF_TWO), pointingAt(SECOND_OF_TWO)] },
  })
  ids['long'] = await file(AS_THE_OWNER, {
    kind: 'message',
    title: LONG_SAYS,
    data: { body: LONG_SAYS, to: toTheAgent, target: pointingAt(LONG_POINTED) },
  })

  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
  await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Quote Agent"))')
  await app.page.waitForSelector(bubbleSaying(LONG_SAYS), { timeout: 20_000 })
  // THE RECORD'S TITLE IS READ AFTER THE CONVERSATION, so the name is waited for rather than raced.
  await app.page.waitForFunction(
    (title: string) => document.querySelector('.px-chat-quote-name')?.textContent?.includes(title) === true,
    RECORD_TITLE,
    { timeout: 20_000 },
  )
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('an agent message that points at something is stored with what it points at', () => {
  it('keeps the target the agent sent', async () => {
    const read = await fetch(`${app.api}/api/records/${ids['agent'] ?? ''}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    const record = ((await read.json()) as { record: { data: { target?: { target?: { recordId?: string } } } } }).record
    expect(record.data.target?.target?.recordId, 'the message door dropped the target an agent sent').toBe(recordId)
  }, 60_000)
})

describe('the quote above a pointed message', () => {
  it('draws the pointed words and the record, as a link, above a person’s message', async () => {
    const seen = await quoteIn(PERSON_SAYS)
    expect(seen.blocks, 'no quote block above the person’s pointed message').toBe(1)
    expect(seen.quoted).toEqual([PERSON_POINTED])
    expect(seen.names).toEqual([RECORD_TITLE])
    expect(seen.links).toEqual([`#/r/${recordId}`])
    expect(seen.quoteAboveWords, 'the quote is not above the message’s own words').toBe(true)
    expect(seen.aboutLines, 'the old line about the place is still drawn beside the quote').toBe(0)
  }, 60_000)

  it('draws an agent’s pointed message the same way', async () => {
    const seen = await quoteIn(AGENT_SAYS)
    expect(seen.blocks, 'no quote block above the agent’s pointed message').toBe(1)
    expect(seen.quoted).toEqual([AGENT_POINTED])
    expect(seen.names).toEqual([RECORD_TITLE])
    expect(seen.links).toEqual([`#/r/${recordId}`])
    expect(seen.quoteAboveWords, 'the quote is not above the agent’s own words').toBe(true)
  }, 60_000)

  it('draws the name alone for a message pointing at a whole thing', async () => {
    const seen = await quoteIn(WHOLE_SAYS)
    expect(seen.blocks).toBe(1)
    expect(seen.quoted, 'a quote with no pointed words drew words anyway').toEqual([''])
    expect(seen.names).toEqual([RECORD_TITLE])
    expect(seen.links).toEqual([`#/r/${recordId}`])
  }, 60_000)

  it('draws each of several quotes as its own block, in order, with its number', async () => {
    const seen = await quoteIn(SEVERAL_SAYS)
    expect(seen.blocks, 'a message with two quotes did not draw two blocks').toBe(2)
    expect(seen.quoted).toEqual([FIRST_OF_TWO, SECOND_OF_TWO])
    expect(seen.numbers, 'several quotes are not numbered').toEqual(['1', '2'])
    expect(seen.names).toEqual([RECORD_TITLE, RECORD_TITLE])
  }, 60_000)

  it('numbers nothing when there is one quote', async () => {
    const seen = await quoteIn(PERSON_SAYS)
    expect(seen.numbers).toEqual([''])
  }, 60_000)

  it('stores and draws the opening of a long quote, marked with an ellipsis', async () => {
    const opened = shortenToWords(LONG_POINTED)
    expect(opened.shortened).toBe(true)

    const read = await fetch(`${app.api}/api/records/${ids['long'] ?? ''}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    const record = ((await read.json()) as {
      record: { data: { target?: { place?: { words?: string; cut?: true } } } }
    }).record
    expect(record.data.target?.place).toEqual({ at: 'quote', words: opened.words, cut: true })

    const seen = await quoteIn(LONG_SAYS)
    expect(seen.quoted).toEqual([`${opened.words} …`])
  }, 60_000)

  it('draws nothing above a message that points at nothing', async () => {
    await file(AS_THE_OWNER, {
      kind: 'message',
      title: 'A plain line',
      data: { body: 'A plain line that points at nothing.', to: [{ kind: 'agent', id: 'quote-agent' }] },
    })
    await app.page.waitForSelector(bubbleSaying('A plain line that points at nothing.'), { timeout: 20_000 })
    const seen = await quoteIn('A plain line that points at nothing.')
    expect(seen.blocks).toBe(0)
  }, 60_000)
})

describe('pictures, only when asked', () => {
  it('photographs the quotes in both looks, in Chinese and in the test language', async () => {
    const shots = process.env['POINTED_QUOTE_SHOTS']
    if (!shots) return
    mkdirSync(shots, { recursive: true })
    const takes: { width: number; theme: 'light' | 'dark'; lang: string | null }[] = [
      { width: 1440, theme: 'light', lang: null },
      { width: 1440, theme: 'dark', lang: null },
      { width: 990, theme: 'light', lang: null },
      { width: 990, theme: 'dark', lang: null },
      { width: 660, theme: 'light', lang: null },
      { width: 660, theme: 'dark', lang: null },
      { width: 390, theme: 'light', lang: null },
      { width: 390, theme: 'dark', lang: null },
      { width: 1440, theme: 'light', lang: 'zh' },
      { width: 1440, theme: 'light', lang: 'xx' },
    ]
    for (const take of takes) {
      await app.page.setViewportSize({ width: take.width, height: 1000 })
      // THE PANEL IS OPENED WIDE AND TALL, so a picture holds several bubbles and not one.
      await app.page.evaluate((theme) => {
        localStorage.setItem('mole-office.preset.theme', theme)
        localStorage.setItem('mole-office.chat.size', '640x880')
      }, take.theme)
      // A GOTO THAT CHANGES ONLY THE HASH DOES NOT LOAD THE PAGE AGAIN, so the reload is what makes
      // the stored look and size count.
      await app.page.goto(`${app.site}/${take.lang === null ? '' : `?lang=${take.lang}`}#/`)
      await app.page.reload()
      await waitForThePage(app.page, 30_000)
      await app.page.waitForSelector(bubbleSaying(LONG_SAYS), { timeout: 20_000 })
      await app.page.locator(bubbleSaying(LONG_SAYS)).scrollIntoViewIfNeeded()
      await app.page.waitForTimeout(400)
      const name = `quote-corner-${String(take.width)}-${take.theme}${take.lang === null ? '' : `-${take.lang}`}.png`
      await app.page.screenshot({ path: `${shots}/${name}` })
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 240_000)
})
