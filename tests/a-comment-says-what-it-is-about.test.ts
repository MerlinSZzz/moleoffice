// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT'S OWN PAGE: WHAT IT SAYS, WHAT IT WAS LEFT ON, AND WHAT A PERSON MAY CHANGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, IN CHROMIUM AT 1440, ON 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * A comment opened as a record — `#/r/<id>` — drew its title, one collapsed fold headed "Body",
 * and NOTHING about the thing it was left on. The report it sat in was not named, the block was
 * not named, the quoted words were not on the page, and there was no press that went anywhere. The
 * server had all four the whole time: `GET /api/annotations/:id` answers with which record or plan,
 * which block, which words, and the same key an element on screen carries as `data-target`.
 *
 * AND THE ONE BOX THE PAGE DID OFFER WROTE THE WRONG THING. A comment has no title field: the title
 * is the first words of the body, cut by `annotationTitle` and finished with an ellipsis, and every
 * write of the body writes the title through it. The page put that shortened string in a box
 * labelled "title". So a person changing their own comment changed a machine's shortening of their
 * sentence, believed they had changed what they said, and the next write of the body undid it.
 * Measured: the box held `Which of the two was measured …`, and the comment itself was 119
 * characters long and reached no box anywhere on the page.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Two of the three claims are about what happens after a press. "It takes you to the source and
 * lights the exact words" is a navigation followed by a highlight drawn by a layer mounted by
 * another file; "editing it changes the words" is a box, a press, and a row in the database
 * afterwards. Static markup can show neither. The third — that no box offers the title — is only
 * worth asserting on the page a person actually opens.
 *
 * The servers come from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and
 * the ports proved free again at the end. Nothing here touches ./data/panelx.db.
 *
 * Each test below was proved by reverting the behaviour and watching it go red, after a control run
 * of this same file with nothing reverted.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePersonsKeyHeader, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { annotationTitle } from '../src/web/components/agent/context.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The paragraph the comment is left on, and the words inside it that it quotes. */
const PARAGRAPH = 'The mount holds calibration through a full handover.'
const QUOTE = 'holds calibration'
const REPORT_TITLE = 'Round eight, what the review found'

/** What somebody wrote. Long enough that its title is a shortening of it and not the whole of it. */
const WRITTEN =
  'Which of the two was measured? This does not match the run log, and I want to know before the supplier is told anything.'
/** What they change it to. */
const REWRITTEN =
  'Which of the two was measured? The run log says 1.9 and this page says 0.4, and nobody should tell the supplier either number yet.'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string
let queuedId: string
let sentId: string

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'comment-page', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const post = async (path: string, body: unknown): Promise<{ record: { id: string } }> => {
    const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return (await res.json()) as { record: { id: string } }
  }

  reportId = (
    await post('/api/records', {
      kind: 'report',
      title: REPORT_TITLE,
      data: {
        for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
        date: '2026-08-18',
        blocks: [
          { id: 'b-1', type: 'text', heading: 'What I found', text: PARAGRAPH },
          { id: 'b-2', type: 'text', heading: 'What I did not', text: 'A different paragraph, about the supplier.' },
        ],
      },
    })
  ).record.id

  const anchor = {
    target: { kind: 'reportBlock', recordId: reportId, blockId: 'b-1' },
    span: {
      quote: QUOTE,
      from: PARAGRAPH.indexOf(QUOTE),
      to: PARAGRAPH.indexOf(QUOTE) + QUOTE.length,
      field: 'data.blocks[#b-1].text',
    },
  }

  // THE TITLE IS WRITTEN THROUGH THE ONE DERIVATION, exactly as the browser writes it, so the test
  // starts from the state a comment written in the product is really in.
  queuedId = (
    await post('/api/records', {
      kind: 'annotation',
      title: annotationTitle(WRITTEN),
      data: { body: WRITTEN, context: anchor },
    })
  ).record.id

  sentId = (
    await post('/api/records', {
      kind: 'annotation',
      title: annotationTitle('The supplier was never asked about this, and somebody should before the next order.'),
      data: {
        body: 'The supplier was never asked about this, and somebody should before the next order.',
        context: anchor,
      },
    })
  ).record.id

  // AND IT IS REALLY SENT, which used to be a word written on the record.
  //
  // The fixture wrote `data.state: 'sent'` until window B took that field off the annotation kind.
  // Nothing has decided anything from it since wave 4 anyway: the page asks whether a message
  // carrying these words has left `queued`, so the fixture has to do the thing rather than say it.
  const raw = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...thePersonsKeyHeader(app.dir + '/keys.json'),
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return (await res.json()) as Record<string, unknown>
  }
  const thread = (await raw('/api/agent/threads', { title: 'About the supplier', mode: 'direct' })) as {
    thread: { id: string }
  }
  await raw(`/api/agent/threads/${thread.thread.id}/messages`, {
    intent: 'ask',
    body: 'The supplier was never asked about this, and somebody should before the next order.',
    fromAnnotationId: sentId,
    recipient: { kind: 'new' },
  })
  await raw(`/api/agent/threads/${thread.thread.id}/dispatch`, {})
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open one address and hand back everything on the screen as one run of words. */
async function open(address: string): Promise<string> {
  await page.goto(`http://127.0.0.1:${webPort}/#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
}

/** The record as the database holds it now. */
async function stored(id: string): Promise<{ title: string; data: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/records/${id}`)
  if (!res.ok) throw new Error(`GET answered ${String(res.status)}: ${await res.text()}`)
  const body = (await res.json()) as { record: { title: string; data: Record<string, unknown> } }
  return body.record
}

// ============================================================================ 1

describe("a comment's own page says what the comment is about", () => {
  let read: string

  beforeAll(async () => {
    read = await open(`/r/${queuedId}`)
  }, 90_000)

  it('names the thing it was left on, and quotes the words it was left on', () => {
    // WHICH RECORD, BY NAME. The id would not do: a person cannot tell one nanoid from another, and
    // docs/UX-CONTRACT.md puts ids in Developer detail.
    expect(read, 'the page does not name the report the comment sits in').toContain(REPORT_TITLE)
    expect(read, 'the page does not quote the words the comment was left on').toContain(QUOTE)
  })

  it('draws what somebody wrote, whole, rather than the shortened name of it', () => {
    expect(read).toContain(WRITTEN)
    // THE POINT OF "WHOLE". The title is a cut of the same sentence, so a page drawing only the
    // title would still contain its first words.
    expect(WRITTEN.length, 'this test needs a comment longer than its own title').toBeGreaterThan(
      annotationTitle(WRITTEN).length,
    )
  })

  it('takes somebody to the source and lights the exact words there', async () => {
    await page.getByRole('button', { name: 'Go to it' }).click()
    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 10_000 }).toContain(reportId)
    await expect
      .poll(() => page.evaluate(() => (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.has('mole-office-showing') ?? false), { timeout: 10_000 })
      .toBe(true)

    const hash = await page.evaluate(() => window.location.hash)
    expect(hash, 'the press did not go to the record the comment is about').toContain(reportId)

    // LIT, MEASURED FROM THE BROWSER'S OWN HIGHLIGHT REGISTRY rather than from a class name. The
    // words are washed with the CSS Custom Highlight API, so a range in that registry is the thing
    // a person sees and a stylesheet naming a colour is not.
    const lit = await page.evaluate(() => {
      const registry = (CSS as unknown as { highlights?: Map<string, { size?: number }> }).highlights
      const one = registry?.get('mole-office-showing')
      return one === undefined ? null : (one.size ?? 0)
    })
    expect(lit, 'nothing was lit on the page the press opened').toBeGreaterThan(0)

    const words = await page.evaluate(() => {
      const registry = (CSS as unknown as { highlights?: Map<string, Iterable<Range>> }).highlights
      const one = registry?.get('mole-office-showing')
      if (one === undefined) return null
      return [...one].map((range) => range.toString()).join('')
    })
    expect(words, 'something was lit, and it was not the words the comment quoted').toBe(QUOTE)
  })
})

// ============================================================================ 2

describe('editing a comment from its own page changes what was written, not a shortening of it', () => {
  it('offers no box holding the title, because a comment has no title anybody typed', async () => {
    await open(`/r/${queuedId}/edit`)
    const values = await page.locator('input.px-input').evaluateAll((boxes) =>
      boxes.map((box) => (box as HTMLInputElement).value),
    )
    const name = annotationTitle(WRITTEN)
    expect(values, 'the page still offers the derived title as a box').not.toContain(name)
    // AND THE NAME IS STILL ON THE SCREEN. Taking the box away must not take the record's name away
    // with it — a page whose title vanishes the moment you press Edit is the defect this fixes,
    // arriving from the other side.
    const heading = await page.locator('h1.rp-title').first().innerText()
    expect(heading).toBe(name)
  })

  it('offers the whole of what was written, and writing it writes the name from it', async () => {
    await open(`/r/${queuedId}/edit`)
    await page.getByRole('button', { name: 'Change what you wrote' }).click()
    await sleep(400)

    const box = page.locator('textarea.px-textarea').first()
    // THE BOX HOLDS THE SENTENCE AND NOT ITS FIRST WORDS. This is the whole of the third finding.
    expect(await box.inputValue()).toBe(WRITTEN)

    await box.fill(REWRITTEN)
    await page.getByRole('button', { name: 'Save these words' }).click()
    await expect.poll(async () => (await stored(queuedId)).data['body'], { timeout: 10_000 }).toBe(REWRITTEN)

    const after = await stored(queuedId)
    expect(after.data['body'], 'the words were not written').toBe(REWRITTEN)
    // THE NAME FOLLOWS THE WORDS, through the one derivation. A page that wrote the body alone
    // would leave a comment whose name said one thing and whose words said another.
    expect(after.title, 'the name did not follow the words').toBe(annotationTitle(REWRITTEN))
  })

  it('offers no box at all once the comment has gone to somebody', async () => {
    const read = await open(`/r/${sentId}/edit`)
    expect(
      await page.getByRole('button', { name: 'Change what you wrote' }).count(),
      'a sent comment offers a box the server would refuse',
    ).toBe(0)
    // AND SAYS WHY, as a state rather than as an instruction.
    expect(read).toContain('gone to somebody')
  })
})
