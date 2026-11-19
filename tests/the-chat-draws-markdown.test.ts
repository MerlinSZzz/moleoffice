// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT DRAWS MARKDOWN, WITH THE RENDERER THE REPORTS USE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The chat did not draw Markdown, not bold, tables, bullets or numbered lists, and not even line
 * breaks. Criterion M103.
 *
 * Measured at commit 4c77b62a: `Body` in src/web/components/Chat.tsx split the body into record
 * ids, page addresses and plain words, and drew each run of plain words in a span. Every Markdown
 * marker reached the screen as the characters it is, and the bubble had no white-space rule, so a
 * body written in paragraphs was drawn as one run of words.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * One message carrying each element named above, read off the drawn page: bold, italics, a bullet
 * list, a numbered list, a table, a code span, a fenced block, a link, and paragraphs.
 *
 * Then the three things that are easy to lose. Nothing a message carries is executed: a body with a
 * script tag and an HTML tag in it draws those characters and adds no elements. A record id in a
 * message is still a press (M42, M48), because Markdown must not have taken the links away. And an
 * id inside a code block is left as characters, because that is what somebody quoting it meant.
 *
 * A SINGLE NEWLINE BREAKS THE LINE IN THE CHAT, AND NOT IN A REPORT. It is settled
 * on proposal kG2sFXVKNgkt. The same three lines, written
 * with no blank line between them, are posted as a message and filed as a report's text block. The
 * bubble draws them on three lines; the report joins them into one paragraph, as it always has.
 * Set CHAT_NEWLINE_SHOTS to a folder to photograph the chat at the four widths in both themes.
 *
 * THAT THE RENDERER IS THE REPORTS' OWN IS NOT CHECKED HERE, and saying so is the honest thing to
 * do: what is checked is what reaches the screen. The evidence that it is one renderer is in the
 * drawing itself — every block carries the `sb-` classes only `renderMarkdown` writes, and the
 * cases below read those classes rather than the element names.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { theResizeIsDrawn, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** The id of a record this test filed, so a message can name it and the row can be drawn. */
let namedRecord = ''

/** Every element named above, in one message. */
const EVERYTHING = [
  '# A heading',
  '',
  'A paragraph with **bold** and *italic* and a `code span` in it.',
  '',
  'A second paragraph, so a line break between them is a line break.',
  '',
  '- first bullet',
  '- second bullet',
  '',
  '1. first number',
  '2. second number',
  '',
  '| Part | State |',
  '| --- | --- |',
  '| gripper | fitted |',
  '| camera | waiting |',
  '',
  '```',
  'a fenced block',
  '```',
  '',
  'And a link: [the readme](https://example.com/readme).',
].join('\n')

/** Three lines with no blank line between them: English, then two Chinese lines. */
const THREE_LINES = ['The first line of three, with **bold** in it.', '第二行写在这里', '第三行也写在这里'].join('\n')

/** A report holding the same three lines in a text block, so both surfaces draw the same text. */
let reportId = ''

const DANGEROUS = 'Nothing is run here: <script>window.__ranInAMessage = true</script> and <b>not bold</b>.'

async function say(body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'agent', id: 'markdown-agent' }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.clone().text()).toBe(409)
}

async function openTheConversation(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-said')) === null) {
    await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Markdown Agent"))')
  }
  await app.page.waitForSelector('.px-chat-md', { timeout: 20_000 })
}

/** The bubble holding a message whose text contains these words. */
function bubbleWith(words: string): string {
  return `.px-chat-bubble:has(.px-chat-md:has-text("${words}"))`
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-markdown', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Markdown Agent',
      data: { handle: 'markdown-agent', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  namedRecord = ((await filed.json()) as { record: { id: string } }).record.id

  await say(EVERYTHING)
  await say(DANGEROUS)
  await say(`The record is ${namedRecord} and you should read it.`)
  await say(['An id inside a fence stays as characters:', '```', namedRecord, '```'].join('\n'))
  await say(THREE_LINES)

  const report = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'Three lines in a report',
      data: { date: '2026-09-25', blocks: [{ id: 'b-1', type: 'text', text: THREE_LINES }] },
    }),
  })
  expect(report.status, await report.clone().text()).toBe(201)
  reportId = ((await report.json()) as { record: { id: string } }).record.id
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a message body is drawn as Markdown', () => {
  it('draws every element the person named', async () => {
    await openTheConversation()
    const held = bubbleWith('A heading')
    await app.page.waitForSelector(held, { timeout: 20_000 })

    const drawn = await app.page.$eval(held, (box) => ({
      headings: box.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      bold: [...box.querySelectorAll('strong, b')].map((one) => one.textContent),
      italic: [...box.querySelectorAll('em, i')].map((one) => one.textContent),
      codeSpans: [...box.querySelectorAll('code')].map((one) => one.textContent),
      // `ul li` WOULD MATCH TOO MUCH. querySelectorAll matches its selector against the whole
      // document and then keeps what is inside this box, and the panel's own list of messages is an
      // `ol`, so every item in the bubble is already inside one. The list's own class tells the two
      // apart. Measured: `ol li` answered four items where two were written.
      bullets: [...box.querySelectorAll('ul.sb-list > li')].map((one) => (one.textContent ?? '').trim()),
      numbers: [...box.querySelectorAll('ol.sb-list > li')].map((one) => (one.textContent ?? '').trim()),
      // A HEADER CELL CARRIES ITS SORT MARK, which is the table block's own control rather than a
      // word of the message.
      tableCells: [...box.querySelectorAll('table td, table th')].map((one) =>
        (one.textContent ?? '').replace('⇅', '').trim(),
      ),
      paragraphs: box.querySelectorAll('p').length,
      links: [...box.querySelectorAll('a')].map((one) => (one.textContent ?? '').trim()),
      // The markers themselves must not have reached the screen.
      words: box.textContent ?? '',
    }))

    expect(drawn.headings, 'a heading was not drawn').toBeGreaterThan(0)
    expect(drawn.bold).toContain('bold')
    expect(drawn.italic).toContain('italic')
    expect(drawn.codeSpans).toContain('code span')
    expect(drawn.codeSpans.some((one) => (one ?? '').includes('a fenced block')), 'no fenced block').toBe(true)

    expect(drawn.bullets).toEqual(['first bullet', 'second bullet'])
    expect(drawn.numbers).toEqual(['first number', 'second number'])
    expect(drawn.tableCells).toEqual(['Part', 'State', 'gripper', 'fitted', 'camera', 'waiting'])
    // TWO PARAGRAPHS AT LEAST, because line breaks were missing too: the body used to be one run.
    expect(drawn.paragraphs).toBeGreaterThanOrEqual(2)
    expect(drawn.links).toContain('the readme')

    // AND NOTHING SCROLLS SIDEWAYS AT 390 because a table went into a bubble. The table block
    // carries its own scrolling box with the mark that says it scrolls; the chat adds none.
    await app.page.setViewportSize({ width: 390, height: 844 })
    await theResizeIsDrawn(app.page)
    expect(
      await app.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      'the page scrolls sideways at 390 with a table in a message',
    ).toBe(false)
    await app.page.setViewportSize({ width: 1440, height: 1000 })

    // AND THE MARKERS ARE GONE FROM THE WORDS.
    expect(drawn.words).not.toContain('**bold**')
    expect(drawn.words).not.toContain('| --- |')
    expect(drawn.words).not.toContain('# A heading')
  }, 180_000)

  it('runs nothing a message carries', async () => {
    await openTheConversation()
    const held = bubbleWith('Nothing is run here')
    await app.page.waitForSelector(held, { timeout: 20_000 })

    const drawn = await app.page.$eval(held, (box) => ({
      scripts: box.querySelectorAll('script').length,
      bold: box.querySelectorAll('b, strong').length,
      words: box.textContent ?? '',
    }))
    expect(drawn.scripts, 'a script element was built from a message body').toBe(0)
    expect(drawn.bold, 'an HTML tag in a message body became an element').toBe(0)
    expect(drawn.words, 'the characters were not drawn as characters').toContain('<script>')
    expect(drawn.words).toContain('<b>not bold</b>')

    const ran = await app.page.evaluate(() => (window as unknown as { __ranInAMessage?: boolean }).__ranInAMessage)
    expect(ran, 'a message body ran').toBeUndefined()
  }, 180_000)

  it('still draws a record id as a press, and leaves one inside a fence alone', async () => {
    await openTheConversation()
    const plain = bubbleWith('you should read it')
    await app.page.waitForSelector(plain, { timeout: 20_000 })
    // THE LINK IS WAITED FOR, because an id is drawn as a link once the office has said it knows the
    // record, and that answer comes after the message is drawn.
    await app.page.waitForSelector(`${plain} a[data-named]`, { timeout: 20_000 })
    const asLink = await app.page.$$(`${plain} a[data-named]`)
    expect(asLink.length, 'a record id in a message is no longer a press').toBe(1)

    const fenced = bubbleWith('An id inside a fence')
    await app.page.waitForSelector(fenced, { timeout: 20_000 })
    const inTheFence = await app.page.$eval(fenced, (box) => ({
      links: box.querySelectorAll('code a').length,
      code: [...box.querySelectorAll('code')].map((one) => (one.textContent ?? '').trim()),
    }))
    expect(inTheFence.links, 'an id somebody quoted in a code block was turned into a link').toBe(0)
    expect(inTheFence.code.join(' ')).toContain(namedRecord)
  }, 180_000)

  it('breaks the line at a single newline in the chat, and not in a report', async () => {
    await openTheConversation()
    const held = bubbleWith('The first line of three')
    await app.page.waitForSelector(held, { timeout: 20_000 })
    const inTheChat = await app.page.$eval(held, (box) => {
      const paragraph = box.querySelector('.px-chat-md .sb-p')
      return {
        breaks: paragraph?.querySelectorAll('br').length ?? -1,
        lines: (paragraph as HTMLElement | null)?.innerText.split('\n') ?? [],
        bold: [...box.querySelectorAll('strong')].map((one) => one.textContent),
      }
    })
    expect(inTheChat.breaks, 'the bubble drew no break between the lines').toBe(2)
    expect(inTheChat.lines).toEqual(['The first line of three, with bold in it.', '第二行写在这里', '第三行也写在这里'])
    expect(inTheChat.bold).toContain('bold')

    // PHOTOGRAPHED ONLY WHEN ASKED. The ordinary run and the mutation runs take no picture.
    const shots = process.env['CHAT_NEWLINE_SHOTS']
    if (shots) {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.locator(held).scrollIntoViewIfNeeded()
          await app.page.waitForTimeout(300)
          await app.page.screenshot({ path: `${shots}/chat-three-lines-${width}-${theme}.png` })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    }

    await app.page.goto(`${app.site}/#/r/${reportId}`)
    await waitForThePage(app.page, 30_000)
    const inTheReport = '.sb-block.sb-text .sb-p'
    await app.page.waitForSelector(inTheReport, { timeout: 30_000 })
    const report = await app.page.$eval(inTheReport, (paragraph) => ({
      breaks: paragraph.querySelectorAll('br').length,
      words: paragraph.textContent ?? '',
    }))
    expect(report.breaks, 'a report drew a single newline as a break').toBe(0)
    expect(report.words).toContain('with bold in it. 第二行写在这里第三行也写在这里')
  }, 240_000)
})
