// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONTACT'S ROW SAYS THE STATE OF THE CONVERSATION, THE WAY THE OWNER'S PICTURE DOES.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE ROW COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * A message of the owner's, with the picture chat-contatct.jpg at
 * data/message-pictures/nLORfZjCIlRv.png: a picture of the contacts part of a chat program, showing a draft
 * and a new message from the other side, as the style to follow, for an agent to work out.
 * Criterion M99.
 *
 * The picture's row: a round picture; the name in bold; the time of the last message at the right
 * of the name; under them one line beginning with a pencil where a draft is waiting, then a tag in
 * colour where the contact carries one, then the first words of the last message or of the draft,
 * cut with an ellipsis; and at the right of that line a badge with the count of unread messages.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE ROW DREW BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 11 September 2026 at commit 4c77b62a: the picture, the presence dot, the name, the
 * whole body of the last message, and the count of unread messages beside the name. No time, no
 * pencil, no tag, the preview was never the draft, and the count was drawn in the text ink at the
 * top right rather than under the name.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * Each of the five things, drawn from what the office knows, on a list holding the complicated case
 * the owner's picture shows: a draft waiting on one contact and two unread messages from another. The
 * count's place is checked by geometry rather than by a class name, because a badge that is drawn
 * in the right box and laid out in the old place is the defect this is about.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { firstWordsOfAMessage, whenAContactLastSpoke } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, theOfficesOwnIdIn, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** A body long enough that the row has to cut it. */
const A_LONG_MESSAGE =
  'This is the last thing the noisy agent said, and it runs on for long enough that a row two ' +
  'hundred and eighty pixels wide has to cut it somewhere, which is the whole point of the line.'

/** The agent record this test filed, by handle, so its card can be written on it later. */
const recordOf = new Map<string, string>()

async function anAgent(title: string, handle: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const said = (await filed.json()) as { record: { id: string } }
  recordOf.set(handle, said.record.id)
}

/**
 * The registry id the office gave an agent this test filed. A stored `to` and a delivery row name an
 * agent by this id, not by its handle.
 */
async function theRegistryIdOf(handle: string): Promise<string> {
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as {
    agents?: { id: string; handle: string }[]
  }
  const found = listed.agents?.find((one) => one.handle === handle)
  expect(found, `${handle} is not in the registry`).toBeDefined()
  return found!.id
}

async function say(handle: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(handle),
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

async function openTheContact(name: string): Promise<void> {
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
  await app.page.click(`.px-chat-contact:has(.px-chat-name:text-is("${name}"))`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
  // AND UNTIL THE CONVERSATION IS DRAWN. The compose box is drawn the moment the contact is pressed,
  // before the conversation has been read. The panel marks a message read only once it has drawn it
  // (`seen` means the person was shown the words), so a case that went back as soon as the box
  // appeared could leave before anything was drawn; then nothing is marked read, the server still
  // counts the message unread, and the badge the case waits to see go is the right answer. Measured on
  // 26 September 2026: in the failing runs the back press came 8 ms after the conversation was asked
  // for, its answer was dropped because the conversation was no longer open, and no mark was written.
  await app.page.waitForSelector('.px-chat-said li', { timeout: 20_000 })
}

async function backToTheList(): Promise<void> {
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

/** Everything one row draws, read off the page rather than off the source. */
interface RowAsDrawn {
  name: string
  avatars: number
  when: string | null
  pencil: number
  tag: string | null
  preview: string
  /** The office's own mark beside the preview (M105), or null where the last line was not its own. */
  officeMark: string | null
  badge: string | null
  badgeInk: string | null
  /** The top of the badge and the top of the name, so their two lines can be told apart. */
  badgeTop: number | null
  nameTop: number | null
}

async function theRow(name: string): Promise<RowAsDrawn> {
  return app.page.$eval(
    `.px-chat-contact:has(.px-chat-name:text-is("${name}"))`,
    (row) => {
      const badge = row.querySelector('.px-chat-unread')
      const nameEl = row.querySelector('.px-chat-name')
      return {
        name: nameEl?.textContent ?? '',
        avatars: row.querySelectorAll('.px-avatar, .px-avatar-img, img').length,
        when: row.querySelector('.px-chat-contact-when')?.textContent ?? null,
        pencil: row.querySelectorAll('.px-chat-pencil').length,
        tag: row.querySelector('.px-chat-tag')?.textContent ?? null,
        preview: row.querySelector('.px-chat-last')?.textContent ?? '',
        officeMark: row.querySelector('.px-chat-last-office')?.textContent ?? null,
        badge: badge === null ? null : (badge.textContent ?? ''),
        badgeInk: badge === null ? null : window.getComputedStyle(badge).backgroundColor,
        badgeTop: badge === null ? null : badge.getBoundingClientRect().top,
        nameTop: nameEl === null ? null : nameEl.getBoundingClientRect().top,
      }
    },
  )
}

/**
 * WRITE AN OFFICE-AUTHORED LINE INTO THE PAIR CONVERSATION BETWEEN THE OWNER AND ONE AGENT, straight into
 * the stack's own database file.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS GOES ROUND THE API RATHER THAN THROUGH IT
 * ---------------------------------------------------------------------------------------
 *
 * `senderIsMoleOffice` is never reachable from a request — see its own comment in
 * src/server/lib/records.ts — on purpose, so there is no HTTP door this test could use to make the
 * office speak. Triggering a REAL one (a run that waited and nobody came, M22; a restart that cut a
 * run off, M24) needs a run in exactly the right state, which is a much bigger fixture for the same
 * row shape `writeASystemLineToTwo` in src/server/lib/groups.ts already writes. This inserts that
 * shape directly — a `records` row of kind `message` with `sentBy: {kind:'agent',id:'mole-office'}`
 * and `to` naming both the person and the agent, plus the two delivery rows every message gets — the
 * same kind of direct-SQL fixture `writeDataBypassingTheGate` and `settleLinkBypassingTheGate` in
 * tests/helpers.ts already use for state the ordinary write path does not produce on request.
 *
 * A SEPARATE CONNECTION TO THE STACK'S OWN FILE, because `liveApp` runs the server as its own
 * process; there is no in-process handle to call the real function through, the way `freshDb`'s `t.api`
 * lets a non-browser test do. `join(app.dir, 'panelx.db')` is the same path `startTheStack` in
 * tests/helpers.ts opens the live server against.
 */
function writeAnOfficeLineToThePair(app: LiveApp, agentId: string, body: string): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const at = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const id = nanoid(12)
    db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) ' +
        // IN THE MESSAGE CENTRE, where the office files every message now, with the mark of the project it names
        // .
        `VALUES (?, 'message-centre', '${THE_TEST_OFFICES_OWNER.id}', ?, ?, 'message', ?, ?, 'authored')`,
    ).run(
      id,
      at,
      at,
      body.slice(0, 40),
      JSON.stringify({
        body,
        sentBy: { kind: 'agent', id: theOfficesOwnIdIn(db) },
        writtenIn: { project: 'default' },
        to: [
          { kind: 'person', id: THE_PERSON },
          { kind: 'agent', id: agentId },
        ],
      }),
    )
    for (const [kind, recipient] of [
      ['person', THE_PERSON],
      ['agent', agentId],
    ] as const) {
      db.prepare(
        'INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(nanoid(12), id, kind, recipient, 'queued', at)
    }
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'contact-row', viewport: { width: 1440, height: 1000 } })
  await anAgent('Noisy Agent', 'noisy-agent')
  await anAgent('Quiet Agent', 'quiet-agent')
  await say('quiet-agent', 'Nothing much.')
  await say('noisy-agent', 'The first of two.')
  await say('noisy-agent', A_LONG_MESSAGE)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the time beside the name', () => {
  it('says the time today, the month and day this year, and the whole day before that', () => {
    expect(whenAContactLastSpoke('2026-09-11 08:42:10', '2026-09-11 09:30:00')).toBe('08:42')
    expect(whenAContactLastSpoke('2026-09-04 22:00:00', '2026-09-11 09:30:00')).toBe('09-04')
    expect(whenAContactLastSpoke('2025-12-30 22:00:00', '2026-09-11 09:30:00')).toBe('2025-12-30')
    // A stamp this cannot read is handed back rather than drawn as a time it is not.
    expect(whenAContactLastSpoke('some time ago', '2026-09-11 09:30:00')).toBe('some time ago')
  })

  it('cuts a long message and leaves a short one alone', () => {
    expect(firstWordsOfAMessage('Short enough.')).toBe('Short enough.')
    const cut = firstWordsOfAMessage(A_LONG_MESSAGE)
    expect(cut.length).toBeLessThanOrEqual(120)
    expect(cut.endsWith('…')).toBe(true)
    // Its own line breaks become spaces: the row draws one line.
    expect(firstWordsOfAMessage('one\ntwo')).toBe('one two')
  })
})

describe('a row draws the five things the owner\'s picture draws', () => {
  it('draws a picture, a bold name, a time, the first words of the last message and a count', async () => {
    await openThePanel()
    const noisy = await theRow('Noisy Agent')

    expect(noisy.avatars, 'the row draws no picture').toBeGreaterThan(0)
    expect(noisy.when, 'the row draws no time for the last message').not.toBeNull()
    expect(noisy.when).toMatch(/^\d{2}:\d{2}$/)
    expect(noisy.preview, 'the row draws the whole body rather than its first words').toBe(
      firstWordsOfAMessage(A_LONG_MESSAGE),
    )
    expect(noisy.badge, 'the count of unread messages is not drawn').toBe('2')

    // THE COUNT IS UNDER THE NAME, on the second line, which is where the owner's picture puts it. Read as
    // geometry: a badge inside the right element but laid out beside the name would pass a check
    // that only looked at the class.
    expect(noisy.badgeTop).not.toBeNull()
    expect(noisy.nameTop).not.toBeNull()
    expect(
      Number(noisy.badgeTop),
      'the count is drawn on the same line as the name rather than under it',
    ).toBeGreaterThan(Number(noisy.nameTop))

    // AND IT IS NOT THE TEXT INK. The badge used to be painted in the ordinary text colour, which
    // is what every other word in the panel is drawn in.
    const textInk = await app.page.evaluate(
      () => window.getComputedStyle(document.querySelector('.px-chat-name') as Element).color,
    )
    expect(noisy.badgeInk, 'the count is painted in the ordinary text ink').not.toBe(textInk)
  }, 180_000)

  it('leaves the badge off a contact with nothing unread', async () => {
    await openThePanel()
    await openTheContact('Quiet Agent')
    await backToTheList()
    // Reading a conversation marks it read on the server, and the panel reads the contacts again
    // after it. This waits for that round trip rather than for a fixed number of milliseconds.
    await app.page.waitForFunction(
      () =>
        document
          .querySelector('.px-chat-contact:has(.px-chat-name)')
          ?.closest('ul') !== null &&
        [...document.querySelectorAll('.px-chat-contact')].some(
          (row) =>
            row.querySelector('.px-chat-name')?.textContent === 'Quiet Agent' &&
            row.querySelector('.px-chat-unread') === null,
        ),
      undefined,
      { timeout: 30_000 },
    )
    const quiet = await theRow('Quiet Agent')
    expect(quiet.badge, 'a badge is drawn on a row with nothing unread').toBeNull()
  }, 180_000)

  it('draws a pencil and the draft’s own words where a draft is waiting', async () => {
    await openThePanel()
    await openTheContact('Quiet Agent')
    await app.page.fill('.px-chat-box', 'Half a sentence I have not sent')
    await app.page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('.px-chat-box')?.value !== '',
      undefined,
      { timeout: 10_000 },
    )
    await backToTheList()

    const quiet = await theRow('Quiet Agent')
    expect(quiet.pencil, 'no pencil is drawn on a row with a draft waiting').toBe(1)
    expect(quiet.preview, 'the row draws the last message rather than the draft').toBe(
      'Half a sentence I have not sent',
    )

    // AND THE OTHER ROW IS UNTOUCHED: a draft belongs to one conversation (M98).
    const noisy = await theRow('Noisy Agent')
    expect(noisy.pencil, 'a pencil is drawn on a contact with no draft').toBe(0)
    expect(noisy.preview).toBe(firstWordsOfAMessage(A_LONG_MESSAGE))
  }, 180_000)

  it('draws the words of a Markdown message rather than its inline markers', async () => {
    // ONCE THE CHAT DREW MARKDOWN (M103) a row began with characters the bubble no longer shows.
    // The row asks the product's one inline reader what a marker means, so a row and a bubble
    // cannot come to two answers about the same sentence.
    await say('noisy-agent', 'A **bold** start and a `code span`, then [a link](https://example.com).')
    await openThePanel()
    await app.page.waitForFunction(
      () =>
        [...document.querySelectorAll('.px-chat-contact')].some(
          (row) =>
            row.querySelector('.px-chat-name')?.textContent === 'Noisy Agent' &&
            (row.querySelector('.px-chat-last')?.textContent ?? '').includes('bold start'),
        ),
      undefined,
      { timeout: 30_000 },
    )
    const noisy = await theRow('Noisy Agent')
    expect(noisy.preview).toBe('A bold start and a code span, then a link.')
  }, 180_000)

  it('draws the card a contact holds as a tag, and nothing where nobody wrote one', async () => {
    // AN AGENT'S CARD IS WRITTEN ON ITS AGENT RECORD and the registry row follows the record, which
    // is what PATCH /api/participants/agent/… says when you try to write it there.
    const card = await fetch(`${app.api}/api/records/${recordOf.get('quiet-agent') ?? ''}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ dataPatch: { role: 'inspector' } }),
    })
    expect(card.status, await card.clone().text()).toBe(200)

    await openThePanel()
    const quiet = await theRow('Quiet Agent')
    expect(quiet.tag, 'the card a contact holds is not drawn as a tag').toBe('inspector')

    // A ROW NOBODY WROTE A CARD ON DRAWS NO TAG. Every registry row is READ as a worker, and drawing
    // that word would say somebody chose it.
    const noisy = await theRow('Noisy Agent')
    expect(noisy.tag, 'a tag is drawn on a contact nobody wrote a card on').toBeNull()
  }, 180_000)
})

describe('the presence mark under a contact name', () => {
  it('draws a never-run agent under the same grey offline draws, with Inactive in the dot\'s title', async () => {
    // THE INACTIVE WORD : the contacts row draws the
    // reading GET /api/presence hands it. On a fresh registered agent there is no session record
    // and no process row, so the reading is `inactive`; it is shown under the same grey an offline
    // agent gets, and only the words differ. This reads the mark the row actually renders.
    await openThePanel()
    const dot = await app.page.$eval(
      '.px-chat-contact:has(.px-chat-name:text-is("Noisy Agent")) .px-chat-dot',
      (one) => ({
        colour: one.getAttribute('data-colour'),
        word: one.getAttribute('aria-label'),
        title: one.getAttribute('title') ?? '',
      }),
    )
    expect(dot.colour, 'the inactive agent is not drawn under the grey offline draws').toBe('grey')
    expect(dot.word).toBe('Inactive')
    expect(dot.title).toContain('Inactive')
  }, 180_000)
})

/**
 * M105 — THE ROW SAYS WHEN THE OFFICE, NOT THE CONTACT, WROTE THE LAST LINE.
 *
 * From F10 on, a reminder is a message whose sentBy is the office, drawn with its own
 * mark in the chat and the contact row. Inside the open conversation that mark is already built —
 * `SystemLine` in src/web/components/Chat.tsx draws it as a centred grey block, unchanged here. The
 * gap: a pair conversation the office wrote into (M22, M24) can be a contact's newest line, and
 * `line.last.body` alone, on the row, reads exactly like something that agent said.
 */
describe('the row marks a line the office wrote, so it is not mistaken for the contact\'s own words', () => {
  it('names the office before the preview, when the last line reaching this row is the office\'s', async () => {
    await anAgent('Reminded Agent', 'reminded-agent')
    writeAnOfficeLineToThePair(app, await theRegistryIdOf('reminded-agent'), 'Re-read the regulations after a compaction.')
    await openThePanel()
    await app.page.waitForFunction(
      () =>
        [...document.querySelectorAll('.px-chat-contact')].some(
          (row) => row.querySelector('.px-chat-name')?.textContent === 'Reminded Agent',
        ),
      undefined,
      { timeout: 30_000 },
    )
    const row = await theRow('Reminded Agent')
    // THE MARK, NOT A GLYPH — see the CSS comment beside .px-chat-last-office: this is not the tick
    // or the clock M113 draws on the reader's own sent messages, which this row never draws at all.
    // It is its own element beside the preview, not folded into `.px-chat-last`'s own text, so a
    // test (or a reader's own eye) can tell "the office said this" from "this is what was said".
    expect(row.officeMark).toBe('Mole Office:')
    expect(row.preview).toContain('Re-read the regulations')
  }, 180_000)

  it('draws no such mark when the contact\'s own words are the last thing said', async () => {
    // "Noisy Agent" from the shared fixture: its own last message, never the office's.
    const noisy = await theRow('Noisy Agent')
    expect(noisy.officeMark).toBeNull()
  }, 180_000)

  it('is unaffected by a waiting draft: the draft is drawn plainly, never marked as the office\'s', async () => {
    await openThePanel()
    await openTheContact('Reminded Agent')
    await app.page.fill('.px-chat-box', 'Answering the reminder')
    await app.page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('.px-chat-box')?.value !== '',
      undefined,
      { timeout: 10_000 },
    )
    await backToTheList()
    const row = await theRow('Reminded Agent')
    expect(row.preview).toBe('Answering the reminder')
    expect(row.officeMark).toBeNull()
  }, 180_000)
})
