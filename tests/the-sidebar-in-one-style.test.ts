// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR IN ONE STYLE, OPEN AND NARROWED, WITH EVERY OTHER PAGE ON ALL PAGES.
 *
 * One sidebar style is made from two designs: the open sidebar draws each word beside its
 * icon, and the narrowed one draws the same entries as icons only, with each entry's name shown beside it
 * on hover and on keyboard focus. Only a few entries stand in front. Every other page is listed on one
 * page, All pages, in the groups the sidebar's arrangement setting gives them.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own:
 *   1. The open and the narrowed sidebar, and the menu at 390, draw the same entries, in the same order,
 *      with the same icons: Ask agent, Reviews and the quick search, then Home, Chat, Reports, Checklists and
 *      Decisions, then All pages, then Settings at the foot. Home's icon is the house both designs draw. Test change
 *      (wave 13y round 166): the quick search's press stands after Reviews, because it acts on the page being read.
 *      Test change (wave 13y round 167, point QN-2 of the quick notes): My notes stands in front after Reports, as
 *      option C's step 6 picture draws it. Test change (the same point): the New note press stands after the quick
 *      search. Option C's step 1 picture draws it right under Reviews, and has no quick search press.
 *   2. Narrowed, the sidebar draws icons only: an entry draws no text but its count mark. The mouse over an
 *      entry, and the keyboard reaching it, show the entry's name beside it, whole, in the window and on top;
 *      the name goes when the mouse or the focus leaves. Open, and in the menu at 390, each word stands beside
 *      its icon and the mouse shows no name. In English and in Chinese, narrowed at 1440 and at the narrowest
 *      width that still has a sidebar beside the page. Below that width the sidebar is a menu over the page,
 *      which is always open, never narrowed.
 *   3. Every page that had a sidebar row before is reached from All pages, with its group's category
 *      page. The pages in front are drawn there grey, and are not among the pages it lists. Test change (wave 13y
 *      round 165): the project switch stands in the sidebar again, on that round's answer, and All pages draws none.
 *   4. The number the All pages entry draws is the number of pages All pages lists, in both modes.
 *   5. A changed arrangement changes All pages' groups.
 *   6. A page reached from All pages lights the All pages entry, the same way open and narrowed.
 *   7. Every entry's icon is the size of Home's and fills it as Home's does, open and narrowed.
 *   8. Ask agent and Reviews are the same shape as each other, open, narrowed and in the menu.
 *   9. A count mark stands in one place against its icon, open, narrowed and in the menu, clear of its word
 *      wherever the word is drawn.
 *  10. The open foot's row holds the person, the look and the power; the narrow press ends the Settings row.
 *  11. All pages draws the headings of its groups all the same way.
 *  12. Reports counts the project's reports not yet read, the number Home's reports band draws from the attention
 *      answer. Checklists counts the project's checklist steps waiting on the person, the sum the Checklists page
 *      adds up. Neither draws a mark when its count is nought, and no entry ever draws "0".
 *  13. All pages' title is drawn at the size, height and weight of the title of All records, a page it lists.
 *
 * THE PICTURES are taken only when W13Y_SIDEBAR_PICTURES names a folder. They are of a made-up office,
 * and each carries the made-up label above the page.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { SHIPPED_SIDEBAR, type SidebarArrangement } from '../src/shared/sidebar-arrangement.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { SidebarSetting } from '../src/server/lib/sidebar.ts'
import { DESTINATIONS, SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { categoryPath, FLAT_ROUTES, pathFor } from '../src/web/components/router.tsx'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'the-sidebar-in-one-style'
const PICTURES = process.env['W13Y_SIDEBAR_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const PROJECT = { id: 'made-up-sidebar-project', title: 'Made-up Fern Workshop' }
/** A project with nothing in it until case 12 files one report and one waiting step. */
const COUNTED = { id: 'made-up-counted-project', title: 'Made-up Counting Room' }
const AGENT = { name: 'Made-up Sidebar Agent', handle: 'made-up-sidebar-agent' }
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** The chosen entries, in their order: the four presses, the six in front, All pages, and Settings at the foot. */
const THE_ENTRIES = ['ask', 'reviews', 'rail.quicksearch', 'rail.quicknote', 'rail.home', 'rail.chat', 'rail.notes', 'rail.mynotes', 'rail.checklists', 'rail.decisions', 'rail.allpages', 'rail.settings']
/** The arranged pages that stand in front, and so are drawn grey on All pages and not listed there. */
const IN_FRONT = ['home', 'notes', 'myNotes', 'checklists', 'decisions']

/** Every entry of the sidebar: the two presses at its top and every link or press drawn as a row. */
const ENTRY = '#shell-side .px-point-switch, #shell-side .px-review-switch, #shell-side .shell-link'
/** The word an entry draws, the icon it draws, and the count mark it draws. */
const WORD = '.shell-label, .px-point-switch-words, .px-review-switch-words'
const ICON = 'svg.shell-ico, .px-talk-handle-glyph, .px-review-dot'
const BADGE = '.shell-badge, .shell-chat-count'
/** The name a narrowed entry shows beside it, on hover and on keyboard focus. */
const TIP = '.shell-tip'
/** What the All pages page lists. */
const LISTED = '#main a.ap-page'
/** The number the All pages entry draws when the sidebar is open. */
const THE_NUMBER = '#shell-side .shell-pages-count'

let app: LiveApp
const originalOwnerName = process.env['MOLE_OFFICE_OWNER_NAME']

/**
 * THE MADE-UP ROWS THAT MAKE EACH 1, filed by the agent in a project. The report is never opened, so the project's
 * attention answer counts it in `reportCounts.waiting`. The checklist has two steps: the first is waiting on the
 * person and the second is open, so the checklists door counts one in `counts.waitingOnTheOwner`.
 */
async function fileOneOfEachWaiting(workspace: string): Promise<void> {
  const asTheAgent = { ...OWNER, 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
  const report = await fetch(app.api + '/api/records', {
    method: 'POST', headers: asTheAgent,
    body: JSON.stringify({ kind: 'report', title: 'A made-up report', data: { for: THE_TEST_OFFICES_OWNER.name, date: '2027-01-01', blocks: [{ id: 'b-1', type: 'text', text: 'Made up for the sidebar counts.' }] } }),
  })
  expect(report.status, await report.clone().text()).toBe(201)
  const checklist = await fetch(app.api + '/api/checklists', {
    method: 'POST', headers: asTheAgent,
    body: JSON.stringify({ title: 'A made-up checklist', items: [{ words: 'Is the made-up shelf free?', state: 'waiting on the owner' }, { words: 'Sort the made-up folders.' }] }),
  })
  expect(checklist.status, await checklist.clone().text()).toBe(201)
}

beforeAll(async () => {
  process.env['MOLE_OFFICE_OWNER_NAME'] = 'Made-up caretaker'
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: { width: 1440, height: 900 } })
  // This test reads the count on the sidebar's Chat row, which carries it only when the button stays while there are unread messages.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  const project = await fetch(app.api + '/api/workspaces', { method: 'POST', headers: OWNER, body: JSON.stringify(PROJECT) })
  expect(project.status, await project.clone().text()).toBe(201)
  const agent = await fetch(app.api + '/api/records', {
    method: 'POST', headers: OWNER,
    body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(agent.status, await agent.clone().text()).toBe(201)
  // A line from the agent, so the chat has a count to draw.
  const said = await fetch(app.api + '/api/records', {
    method: 'POST',
    headers: { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle },
    body: JSON.stringify({ kind: 'message', title: 'A made-up line', data: { body: 'A made-up line for the sidebar pictures.', to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  // A fork the owner settles, so Decisions has a count to draw.
  const fork = await fetch(app.api + '/api/records', {
    method: 'POST',
    headers: { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle },
    body: JSON.stringify({
      kind: 'proposal',
      title: 'A made-up fork',
      data: {
        question: 'Which made-up shelf takes the new folders?',
        options: ['a — The top shelf.', 'b — The low shelf.'],
        recommendation: 'Take (a). It is empty.',
        because: 'Made up for the sidebar pictures.',
        who_settles_it: 'the owner',
      },
    }),
  })
  expect(fork.status, await fork.clone().text()).toBe(201)
  // A report and a checklist step waiting on the person, so Reports and Checklists have counts to draw.
  await fileOneOfEachWaiting('default')
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (originalOwnerName === undefined) delete process.env['MOLE_OFFICE_OWNER_NAME']
  else process.env['MOLE_OFFICE_OWNER_NAME'] = originalOwnerName
}, 60_000)

type Look = { theme?: 'light' | 'dark'; narrowed?: boolean; width?: number; height?: number; project?: string }

/** A fresh window whose stored choices are set before the app runs. */
async function aWindow(look: Look = {}): Promise<{ context: BrowserContext; page: Page }> {
  const width = look.width ?? 1440
  const context = await app.browser.newContext({ viewport: { width, height: look.height ?? (width <= 390 ? 844 : 900) } })
  await context.addInitScript(({ id, theme, narrowed, key, project }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, narrowed ? 'collapsed' : 'expanded')
    localStorage.setItem('mole-office.workspace', project)
  }, { id: THE_TEST_OFFICES_OWNER.id, theme: look.theme ?? 'light', narrowed: look.narrowed ?? false, key: SIDEBAR_KEY, project: look.project ?? 'default' })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00'))
  return { context, page }
}

async function open(page: Page, address: string, query = 'lang=en'): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?${query}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

type Box = { left: number; top: number; right: number; bottom: number }
type Entry = {
  name: string
  /** Its place among every element that ENTRY finds, drawn or not, so a locator can reach it. */
  index: number
  icon: string
  word: string
  /** Where the entry, its icon, its word and its count mark are drawn. The word's box is null when the word is not drawn. */
  box: Box
  iconBox: Box | null
  wordBox: Box | null
  badge: Box | null
  /** Every piece of text the entry draws, other than its count mark. */
  drawnText: string[]
  /** How far across, at its widest, what the icon draws reaches. */
  drawnAcross: number
}

/** The sidebar's entries as drawn, in the order they are drawn. */
async function theEntries(page: Page): Promise<Entry[]> {
  await page.locator('#shell-side .shell-link').first().waitFor({ timeout: 30_000 })
  return page.locator(ENTRY).evaluateAll((all, [word, icon, badge]) => all.map((one, index) => ({ one, index })).filter(({ one }) => one.getClientRects().length > 0).map(({ one, index }) => {
    const name = one.classList.contains('px-point-switch') ? 'ask'
      : one.classList.contains('px-review-switch') ? 'reviews'
      : /rail\.[a-z]+/.exec(one.getAttribute('data-target') ?? '')?.[0] ?? `link ${one.getAttribute('href') ?? ''}`
    const box = (el: Element | null): { left: number; top: number; right: number; bottom: number } | null => {
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    // A PART OF THE ENTRY IS DRAWN when it and everything holding it inside the entry is shown, and none of them shuts
    // it in a box too small to show anything.
    const shows = (part: Element): boolean => {
      for (let at: Element | null = part; at !== null && at !== one.parentElement; at = at.parentElement) {
        if (!at.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
        const r = at.getBoundingClientRect(), look = getComputedStyle(at)
        if ((r.width < 2 || r.height < 2) && (look.overflowX !== 'visible' || look.overflowY !== 'visible' || look.clipPath !== 'none')) return false
      }
      return true
    }
    const drawnText: string[] = []
    const texts = document.createTreeWalker(one, NodeFilter.SHOW_TEXT)
    for (let text = texts.nextNode(); text !== null; text = texts.nextNode()) {
      const words = (text.textContent ?? '').trim(), holder = text.parentElement
      if (words === '' || holder === null || holder.closest(badge!) !== null || holder.closest('svg') !== null) continue
      if (shows(holder)) drawnText.push(words)
    }
    const theWord = one.querySelector(word!)
    const drawn = one.querySelector(icon!)
    // What an icon drawn as a picture draws is its shapes; an icon drawn as a letter or a dot is the box itself.
    const shapes = drawn instanceof SVGElement ? [...drawn.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon')].map((shape) => shape.getBoundingClientRect()) : drawn === null ? [] : [drawn.getBoundingClientRect()]
    const across = shapes.length === 0 ? 0 : Math.max(
      Math.max(...shapes.map((r) => r.right)) - Math.min(...shapes.map((r) => r.left)),
      Math.max(...shapes.map((r) => r.bottom)) - Math.min(...shapes.map((r) => r.top)),
    )
    return {
      name,
      index,
      icon: drawn === null ? '' : `${drawn.tagName} ${drawn.getAttribute('class') ?? ''} ${drawn.innerHTML}`,
      word: (theWord?.textContent ?? '').trim(),
      box: box(one)!,
      iconBox: box(drawn),
      wordBox: theWord !== null && shows(theWord) ? box(theWord) : null,
      badge: box([...one.querySelectorAll(badge!)].find((mark) => mark.getClientRects().length > 0) ?? null),
      drawnText,
      drawnAcross: across,
    }
  }), [WORD, ICON, BADGE] as const)
}

const across = (box: Box): number => box.right - box.left
const down = (box: Box): number => box.bottom - box.top
const px = (n: number): string => n.toFixed(1)

/** Open the menu that stands for the sidebar below the width that has one beside the page. */
async function openTheMenu(page: Page): Promise<void> {
  await page.locator('.shell-menu').click()
  await page.locator('#shell-side[data-drawer="open"]').waitFor()
  await page.waitForTimeout(600)
}

/**
 * WHAT IS WRONG WITH THE NAME SHOWN BESIDE A NARROWED ENTRY, the entry given by its place among what ENTRY finds. With an
 * entry: no name shown or more than one, a name other than the entry's word, a name cut, or one that does not stand beside
 * the entry, wholly in the window and on top of what is under it. With none, any name shown at all is wrong.
 */
async function theNameShown(page: Page, entry: number | null): Promise<string[]> {
  // The name is drawn in a frame after the mouse or the focus reaches the entry, and after any motion it makes.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
  await page.evaluate(async (tip) => {
    await Promise.all(document.getAnimations()
      .filter((one) => one.effect instanceof KeyframeEffect && one.effect.target instanceof Element && one.effect.target.closest(tip) !== null)
      .map((one) => one.finished.catch(() => undefined)))
  }, TIP)
  return page.evaluate(([entrySelector, word, tip, index]) => {
    const shown = [...document.querySelectorAll<HTMLElement>(tip)].filter((one) => one.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      && one.getBoundingClientRect().width >= 2 && one.getBoundingClientRect().height >= 2)
    if (index === null) return shown.map((one) => `the name "${(one.textContent ?? '').trim()}" is shown`)
    const entry = document.querySelectorAll(entrySelector)[index]
    const name = (entry?.querySelector(word)?.textContent ?? '').trim()
    if (entry === undefined || name === '') return ['the entry has no word to show']
    if (shown.length !== 1) return [`${String(shown.length)} names are shown`]
    const tipShown = shown[0]!
    const t = tipShown.getBoundingClientRect(), e = entry.getBoundingClientRect(), side = document.getElementById('shell-side')!.getBoundingClientRect()
    const problems: string[] = []
    const text = (tipShown.textContent ?? '').trim()
    if (text !== name) problems.push(`it shows "${text}", not "${name}"`)
    if (tipShown.scrollWidth > tipShown.clientWidth + 1 || tipShown.scrollHeight > tipShown.clientHeight + 1) problems.push('the name is cut')
    if (t.left < e.right - 0.5 || t.left > side.right + 24) problems.push(`it starts at ${String(Math.round(t.left))}, not beside the entry, which ends at ${String(Math.round(e.right))}`)
    const middle = (t.top + t.bottom) / 2
    if (middle < e.top || middle > e.bottom) problems.push('it is not level with the entry')
    if (t.left < 0 || t.top < 0 || t.right > innerWidth || t.bottom > innerHeight) problems.push('it reaches out of the window')
    // ON TOP: a point in its middle reaches it once it may be reached, which the mouse passing over it may not.
    const was = tipShown.style.getPropertyValue('pointer-events'), wasFirm = tipShown.style.getPropertyPriority('pointer-events')
    tipShown.style.setProperty('pointer-events', 'auto', 'important')
    const hit = document.elementFromPoint((t.left + t.right) / 2, middle)
    tipShown.style.setProperty('pointer-events', was, wasFirm)
    if (hit === null || !tipShown.contains(hit)) problems.push(`something else is drawn over it: ${hit === null ? 'nothing' : `${hit.tagName} ${hit.className}`}`)
    return problems
  }, [ENTRY, WORD, TIP, entry] as const)
}

/**
 * THE KEYBOARD FROM THE TOP OF THE SIDEBAR, one Tab at a time until one stop past the last entry: the entries it reaches in
 * their order, and what is wrong with the name shown at each stop.
 */
async function byTheKeyboard(page: Page, entries: readonly Entry[]): Promise<{ reached: string[]; problems: string[] }> {
  await page.locator('#shell-side .shell-brand').focus()
  const reached: string[] = []
  const problems: string[] = []
  let past = false
  for (let press = 0; press < 40 && !past; press++) {
    await page.keyboard.press('Tab')
    const index = await page.evaluate((entry) => [...document.querySelectorAll(entry)].indexOf(document.activeElement!), ENTRY)
    const one = entries.find((each) => each.index === index)
    if (one !== undefined) reached.push(one.name)
    else past = reached.at(-1) === entries.at(-1)?.name
    const at = one === undefined ? `the stop after ${reached.at(-1) ?? 'the top'}` : one.name
    problems.push(...(await theNameShown(page, one === undefined ? null : one.index)).map((fault) => `${at}: ${fault}`))
  }
  return { reached, problems }
}

/** The link each arranged page's sidebar row led to. */
function addressOf(key: string): string {
  const found = DESTINATIONS.find((one) => one.key === key)
  if (found === undefined) throw new Error(`No sidebar row for ${key}.`)
  return `#${found.to}`
}

/** The groups All pages should draw for an arrangement: its groups, less the pages in front and, in normal mode, the developer group. */
function theGroupsFor(arrangement: SidebarArrangement, inspect: boolean): { key: string; hrefs: string[] }[] {
  return arrangement.groups
    .filter((group) => inspect || group.key !== 'developer')
    .map((group) => ({ key: group.key, hrefs: group.keys.filter((key) => !IN_FRONT.includes(key)).map(addressOf) }))
}

/** The groups the All pages page draws, in its order, with the links each lists. */
async function theGroupsDrawn(page: Page): Promise<{ key: string; hrefs: string[] }[]> {
  return page.locator('#main .ap-group').evaluateAll((all) => all.map((group) => ({
    key: group.getAttribute('data-group') ?? '',
    hrefs: [...group.querySelectorAll('a.ap-page')].map((link) => link.getAttribute('href') ?? ''),
  })))
}

it('1. the open and the narrowed sidebar draw the same entries, in the same order, with the same icons', async () => {
  const { context, page } = await aWindow()
  try {
    await open(page, '/')
    const opened = await theEntries(page)
    await page.locator('.shell-collapse').click()
    await page.locator('#shell-side[data-state="collapsed"]').waitFor()
    const narrowed = await theEntries(page)
    const phone = await aWindow({ width: 390 })
    let menu: Entry[]
    try {
      await open(phone.page, '/')
      await openTheMenu(phone.page)
      menu = await theEntries(phone.page)
    } finally {
      await phone.context.close()
    }
    expect(DESTINATIONS.find((one) => one.key === 'home')?.icon, "Home's icon").toBe('house')
    expect(opened.map((one) => one.name), 'the open sidebar').toEqual(THE_ENTRIES)
    expect(narrowed.map((one) => one.name), 'the narrowed sidebar').toEqual(THE_ENTRIES)
    expect(menu.map((one) => one.name), 'the menu at 390').toEqual(THE_ENTRIES)
    expect(narrowed.map((one) => one.icon), 'the icons, narrowed against open').toEqual(opened.map((one) => one.icon))
    expect(menu.map((one) => one.icon), 'the icons, the menu against the open sidebar').toEqual(opened.map((one) => one.icon))
    expect(opened.every((one) => one.icon !== '' && one.word !== ''), 'an entry with no icon or no word').toBe(true)
  } finally {
    await context.close()
  }
}, 180_000)

it('2. narrowed, the sidebar draws icons only, and an entry shows its name on hover and on keyboard focus, in English and in Chinese', async () => {
  const problems: string[] = []
  for (const width of [1440, THE_SHELL_WIDTH]) {
    for (const lang of ['en', 'zh']) {
      const at = `narrowed at ${String(width)} in ${lang}`
      const { context, page } = await aWindow({ narrowed: true, width })
      try {
        await open(page, '/', `lang=${lang}`)
        await page.locator('#shell-side[data-state="collapsed"]').waitFor()
        const entries = await theEntries(page)
        expect(entries.map((one) => one.name), at).toEqual(THE_ENTRIES)
        // No word under or beside any icon: an entry draws its icon and its count mark, and no text besides.
        for (const one of entries) if (one.drawnText.length > 0) problems.push(`${at}, ${one.name}: draws ${JSON.stringify(one.drawnText)}`)
        // The mouse over each entry shows its name beside it, and the mouse in the page shows none.
        for (const one of entries) {
          await page.locator(ENTRY).nth(one.index).hover()
          problems.push(...(await theNameShown(page, one.index)).map((fault) => `${at}, the mouse over ${one.name}: ${fault}`))
        }
        await page.mouse.move(width - 200, 450)
        problems.push(...(await theNameShown(page, null)).map((fault) => `${at}, the mouse in the page: ${fault}`))
        // The keyboard reaches every entry in its order, each showing its name, and the name goes past the last.
        const keyboard = await byTheKeyboard(page, entries)
        expect(keyboard.reached, `${at}, the entries the keyboard reaches`).toEqual(THE_ENTRIES)
        problems.push(...keyboard.problems.map((fault) => `${at}, the keyboard on ${fault}`))
      } finally {
        await context.close()
      }
    }
  }
  // Open, and in the menu, each word stands beside its icon, and the mouse over an entry shows no name.
  for (const [state, look] of [['open at 1440', {}], ['the menu at 390', { width: 390 }]] as const) {
    for (const lang of ['en', 'zh']) {
      const at = `${state} in ${lang}`
      const { context, page } = await aWindow(look)
      try {
        await open(page, '/', `lang=${lang}`)
        if (state === 'the menu at 390') await openTheMenu(page)
        const entries = await theEntries(page)
        expect(entries.map((one) => one.name), at).toEqual(THE_ENTRIES)
        for (const one of entries) {
          if (one.wordBox === null || one.iconBox === null || one.wordBox.left < one.iconBox.right - 0.5 || !one.drawnText.includes(one.word)) {
            problems.push(`${at}, ${one.name}: its word is not drawn beside its icon`)
          }
          await page.locator(ENTRY).nth(one.index).hover()
          problems.push(...(await theNameShown(page, null)).map((fault) => `${at}, the mouse over ${one.name}: ${fault}`))
        }
      } finally {
        await context.close()
      }
    }
  }
  expect(problems).toEqual([])
}, 420_000)

it('3. every page that had a sidebar row is reached from All pages, and the pages in front are not listed twice', async () => {
  const { context, page } = await aWindow()
  try {
    await open(page, pathFor('allPages' as never), 'lang=en&mode=inspect')
    await page.locator(LISTED).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
    const listed = await page.locator(LISTED).evaluateAll((all) => all.map((one) => one.getAttribute('href') ?? ''))
    const everyRow = SHIPPED_SIDEBAR.groups.flatMap((group) => group.keys).filter((key) => !IN_FRONT.includes(key)).map(addressOf)
    expect([...listed].sort(), 'the pages All pages lists').toEqual([...everyRow].sort())
    expect(listed.filter((href) => IN_FRONT.map(addressOf).includes(href)), 'a page in front listed again').toEqual([])
    expect(new Set(listed).size, 'a page listed twice').toBe(listed.length)
    // Each group with a category page still leads to it. The project switch stands in the sidebar, and not here.
    for (const group of SHIPPED_SIDEBAR.groups.filter((one) => one.key !== 'all')) {
      expect(await page.locator(`#main .ap-group[data-group="${group.key}"] a[href="#${categoryPath(group.key)}"]`).count(), `the ${group.key} category page`).toBe(1)
    }
    expect(await page.locator('#main .sbp-switch').count(), 'a project switch on All pages').toBe(0)
    expect(await page.locator('#shell-side .sbp-switch').count(), 'the project switch in the sidebar').toBe(1)
  } finally {
    await context.close()
  }
}, 180_000)

it('4. the number the All pages entry draws is the number of pages All pages lists, in both modes', async () => {
  const counted: Record<string, { drawn: number | null; listed: number }> = {}
  for (const mode of ['normal', 'inspect']) {
    const { context, page } = await aWindow()
    try {
      await open(page, '/', `lang=en&mode=${mode}`)
      await page.locator(THE_NUMBER).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
      const words = await page.locator(THE_NUMBER).allTextContents()
      const drawn = words.length === 1 ? Number(/\d+/.exec(words[0]!)?.[0] ?? NaN) : null
      await open(page, pathFor('allPages' as never), `lang=en&mode=${mode}`)
      await page.locator(LISTED).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
      counted[mode] = { drawn, listed: await page.locator(LISTED).count() }
    } finally {
      await context.close()
    }
  }
  expect(counted['normal']!.drawn, 'the number in normal mode').toBe(counted['normal']!.listed)
  expect(counted['inspect']!.drawn, 'the number in developer mode').toBe(counted['inspect']!.listed)
  const developer = SHIPPED_SIDEBAR.groups.find((group) => group.key === 'developer')!.keys.length
  expect(counted['inspect']!.listed - counted['normal']!.listed, 'the developer group only in developer mode').toBe(developer)
}, 180_000)

it('5. a changed arrangement changes the groups of All pages', async () => {
  const read = async (): Promise<SidebarSetting> => (await fetch(app.api + '/api/sidebar', { headers: OWNER })).json() as Promise<SidebarSetting>
  const write = async (arrangement: SidebarArrangement): Promise<void> => {
    const r = await fetch(app.api + '/api/sidebar', { method: 'POST', headers: OWNER, body: JSON.stringify({ version: (await read()).version, arrangement, because: 'Made-up arrangement for All pages' }) })
    expect(r.status, await r.clone().text()).toBe(200)
  }
  // The toolset leaves Agents for the start of Office, and All records leaves All projects' end for its start.
  const changed: SidebarArrangement = {
    groups: SHIPPED_SIDEBAR.groups.map((group) => ({
      key: group.key,
      keys: group.key === 'agents' ? group.keys.filter((key) => key !== 'toolset')
        : group.key === 'office' ? ['toolset', ...group.keys]
        : group.key === 'all' ? ['records', ...group.keys.filter((key) => key !== 'records')]
        : [...group.keys],
    })),
  }
  const { context, page } = await aWindow()
  try {
    await open(page, pathFor('allPages' as never))
    await page.locator(LISTED).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
    expect(await theGroupsDrawn(page), 'the shipped arrangement').toEqual(theGroupsFor(SHIPPED_SIDEBAR, false))
    await write(changed)
    await open(page, pathFor('allPages' as never))
    await page.locator(LISTED).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
    expect(await theGroupsDrawn(page), 'the changed arrangement').toEqual(theGroupsFor(changed, false))
  } finally {
    await write(SHIPPED_SIDEBAR)
    await context.close()
  }
}, 180_000)

it('6. a page reached from All pages lights the All pages entry, the same way open and narrowed', async () => {
  const lit: Record<string, string[]> = {}
  for (const narrowed of [false, true]) {
    const { context, page } = await aWindow({ narrowed })
    try {
      await open(page, pathFor('records'))
      await page.locator('#shell-side .shell-link').first().waitFor({ timeout: 30_000 })
      lit[narrowed ? 'narrowed' : 'open'] = await page.locator(ENTRY).evaluateAll((all) => all
        .filter((one) => one.getClientRects().length > 0 && one.hasAttribute('aria-current'))
        .map((one) => /rail\.[a-z]+/.exec(one.getAttribute('data-target') ?? '')?.[0] ?? one.className))
    } finally {
      await context.close()
    }
  }
  expect(lit['open'], 'lit in the open sidebar').toEqual(['rail.allpages'])
  expect(lit['narrowed'], 'lit in the narrowed sidebar').toEqual(['rail.allpages'])
}, 180_000)

it("7. every entry's icon is the size of Home's and fills it as Home's does, open and narrowed", async () => {
  const problems: string[] = []
  for (const narrowed of [false, true]) {
    const state = narrowed ? 'narrowed' : 'open'
    const { context, page } = await aWindow({ narrowed })
    try {
      await open(page, '/')
      const entries = await theEntries(page)
      const home = entries.find((one) => one.name === 'rail.home')?.iconBox ?? null
      const homeAcross = entries.find((one) => one.name === 'rail.home')?.drawnAcross ?? 0
      if (home === null) {
        problems.push(`${state}: Home draws no icon`)
        continue
      }
      for (const one of entries) {
        if (one.iconBox === null) {
          problems.push(`${state} ${one.name}: no icon`)
          continue
        }
        if (Math.abs(across(one.iconBox) - across(home)) > 0.5 || Math.abs(down(one.iconBox) - down(home)) > 0.5) {
          problems.push(`${state} ${one.name}: the icon is ${px(across(one.iconBox))} by ${px(down(one.iconBox))}, Home's ${px(across(home))} by ${px(down(home))}`)
        }
        if (one.drawnAcross < homeAcross * 0.7) problems.push(`${state} ${one.name}: what the icon draws reaches ${px(one.drawnAcross)} across, Home's ${px(homeAcross)}`)
      }
    } finally {
      await context.close()
    }
  }
  expect(problems).toEqual([])
}, 180_000)

it('8. Ask agent and Reviews are the same shape as each other, open, narrowed and in the menu', async () => {
  const problems: string[] = []
  for (const [state, look] of [['open', {}], ['narrowed', { narrowed: true }], ['the menu at 390', { width: 390 }]] as const) {
    const { context, page } = await aWindow(look)
    try {
      await open(page, '/')
      if (state === 'the menu at 390') await openTheMenu(page)
      const entries = await theEntries(page)
      const ask = entries.find((one) => one.name === 'ask')?.box
      const reviews = entries.find((one) => one.name === 'reviews')?.box
      if (ask === undefined || reviews === undefined) {
        problems.push(`${state}: Ask agent or Reviews is not drawn`)
        continue
      }
      if (Math.abs(across(ask) - across(reviews)) > 0.5 || Math.abs(down(ask) - down(reviews)) > 0.5) {
        problems.push(`${state}: Ask agent is ${px(across(ask))} by ${px(down(ask))}, Reviews ${px(across(reviews))} by ${px(down(reviews))}`)
      }
    } finally {
      await context.close()
    }
  }
  expect(problems).toEqual([])
}, 180_000)

it('9. a count mark stands in one place against its icon, open, narrowed and in the menu, and clear of its word wherever the word is drawn', async () => {
  // Where each count mark stands against its icon's top right corner, and what is wrong with it.
  const places: string[] = []
  const problems: string[] = []
  for (const [state, look] of [['open', {}], ['narrowed', { narrowed: true }], ['the menu at 990', { width: 990 }]] as const) {
    const { context, page } = await aWindow(look)
    try {
      await open(page, '/')
      if (state === 'the menu at 990') await openTheMenu(page)
      await page.locator(`#shell-side [data-target*="rail.decisions"] :is(${BADGE})`).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
      const entries = await theEntries(page)
      const counted = state === 'the menu at 990' ? ['rail.chat', 'rail.notes', 'rail.checklists', 'rail.decisions'] : ['rail.notes', 'rail.checklists', 'rail.decisions']
      for (const name of counted) {
        const one = entries.find((entry) => entry.name === name)
        if (one?.badge == null || one.iconBox === null) {
          problems.push(`${state} ${name}: no count mark drawn`)
          continue
        }
        places.push(`${px(one.badge.left - one.iconBox.right)} ${px(one.badge.top - one.iconBox.top)}`)
        // Narrowed, no word is drawn, so there is none for the mark to keep clear of.
        const clear = one.wordBox === null || one.badge.right + 2 <= one.wordBox.left || one.badge.left - 2 >= one.wordBox.right
          || one.badge.bottom + 2 <= one.wordBox.top || one.badge.top - 2 >= one.wordBox.bottom
        if (!clear) problems.push(`${state} ${name}: the count mark comes within 2px of its word`)
      }
    } finally {
      await context.close()
    }
  }
  expect(problems).toEqual([])
  expect(places.length, 'the count marks measured').toBe(10)
  expect(new Set(places).size, `where the count marks stand against their icons: ${places.join('; ')}`).toBe(1)
}, 180_000)

it("10. the open foot's row holds the person, the look and the power, and the narrow press ends the Settings row", async () => {
  const { context, page } = await aWindow()
  try {
    await open(page, '/')
    await page.locator('#shell-side .sbp-foot-row').waitFor({ timeout: 30_000 })
    expect(await page.locator('#shell-side .sbp-foot-row .sbp-settings').count(), 'Settings in the foot row').toBe(0)
    expect(await page.locator('#shell-side .sbp-foot-row .shell-collapse').count(), 'the narrow press in the foot row').toBe(0)
    const settings = await page.locator('#shell-side a.sbp-settings').boundingBox()
    const word = await page.locator('#shell-side a.sbp-settings .shell-label').boundingBox()
    const press = await page.locator('#shell-side .shell-collapse').boundingBox()
    expect(settings !== null && word !== null && press !== null, 'the Settings row, its word and the narrow press are drawn').toBe(true)
    const middle = press!.y + press!.height / 2
    expect(middle >= settings!.y && middle <= settings!.y + settings!.height, 'the narrow press stands on the Settings row').toBe(true)
    expect(press!.x >= word!.x + word!.width, 'the narrow press stands after the word Settings').toBe(true)
    await page.locator('.shell-collapse').click()
    await page.locator('#shell-side[data-state="collapsed"]').waitFor()
    expect(await page.locator('#shell-side .shell-collapse').isVisible(), 'the widen press, narrowed').toBe(true)
  } finally {
    await context.close()
  }
}, 180_000)

it('11. All pages draws the headings of its groups all the same way', async () => {
  const { context, page } = await aWindow()
  try {
    await open(page, pathFor('allPages' as never))
    await page.locator('#main .ap-group').first().waitFor({ timeout: 30_000 }).catch(() => undefined)
    const headings = await page.locator('#main .ap-group .ap-cap').evaluateAll((all) => all.map((cap) => {
      // The words a person reads: the link to the group's category page where there is one, the heading where there is none.
      const words = cap.querySelector('a') ?? cap
      const look = getComputedStyle(words)
      return {
        group: cap.closest('.ap-group')?.getAttribute('data-group') ?? '',
        look: `${look.textDecorationLine} ${look.color} ${look.fontWeight} ${look.fontSize}`,
      }
    }))
    expect(headings.map((one) => one.group), 'the groups').toEqual(theGroupsFor(SHIPPED_SIDEBAR, false).map((group) => group.key))
    expect(new Set(headings.map((one) => one.look)).size, headings.map((one) => `${one.group}: ${one.look}`).join('; ')).toBe(1)
  } finally {
    await context.close()
  }
}, 180_000)

it('12. Reports and Checklists count what waits on the person, and no entry draws a mark at nought', async () => {
  const made = await fetch(app.api + '/api/workspaces', { method: 'POST', headers: OWNER, body: JSON.stringify(COUNTED) })
  expect(made.status, await made.clone().text()).toBe(201)
  /** The text of each drawn count mark of Reports and Checklists, and every drawn mark's text, in each state. */
  const theCounts = async (expectMarks: boolean): Promise<{ state: string; notes: string | null; checklists: string | null; every: string[] }[]> => {
    const seen: { state: string; notes: string | null; checklists: string | null; every: string[] }[] = []
    for (const [state, look] of [['open', {}], ['narrowed', { narrowed: true }], ['the menu at 390', { width: 390 }]] as const) {
      const { context, page } = await aWindow({ ...look, project: COUNTED.id })
      try {
        // The readings behind the two counts, so a mark that is not drawn is not merely a mark not drawn yet.
        const read = Promise.all([
          page.waitForResponse((answer) => answer.url().includes('/api/attention?') && answer.url().includes('shape=home'), { timeout: 30_000 }).catch(() => undefined),
          page.waitForResponse((answer) => answer.url().includes('/api/checklists'), { timeout: 30_000 }).catch(() => undefined),
        ])
        await open(page, '/')
        await read
        if (state === 'the menu at 390') await openTheMenu(page)
        const mark = (target: string): string => `#shell-side [data-target*="${target}"] :is(${BADGE})`
        if (expectMarks) {
          await page.locator(mark('rail.notes')).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
          await page.locator(mark('rail.checklists')).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
        } else await page.waitForTimeout(1_500)
        const textOf = async (target: string): Promise<string | null> => {
          const shown = await page.locator(mark(target)).evaluateAll((all) => all.filter((one) => one.getClientRects().length > 0).map((one) => (one.textContent ?? '').trim()))
          return shown[0] ?? null
        }
        const every = await page.locator(`#shell-side :is(${BADGE})`).evaluateAll((all) => all.filter((one) => one.getClientRects().length > 0).map((one) => (one.textContent ?? '').trim()))
        seen.push({ state, notes: await textOf('rail.notes'), checklists: await textOf('rail.checklists'), every })
      } finally {
        await context.close()
      }
    }
    return seen
  }
  const states = ['open', 'narrowed', 'the menu at 390']
  // Nothing waits in the new project, so neither entry draws a mark.
  const none = await theCounts(false)
  expect(none.map((one) => [one.state, one.notes, one.checklists])).toEqual(states.map((state) => [state, null, null]))
  // One report nobody has read and one step waiting on the person: each entry draws 1.
  await fileOneOfEachWaiting(COUNTED.id)
  const one = await theCounts(true)
  expect(one.map((each) => [each.state, each.notes, each.checklists])).toEqual(states.map((state) => [state, '1', '1']))
  // No entry draws a mark that says nought, or a mark with no number in it.
  const atNought = [...none, ...one].flatMap((each) => each.every.filter((text) => !/^[1-9][0-9]*\+?$/.test(text)).map((text) => `${each.state}: "${text}"`))
  expect(atNought).toEqual([])
}, 300_000)

it("13. All pages' title is drawn as the title of a page it lists", async () => {
  const { context, page } = await aWindow()
  try {
    const theTitle = async (address: string): Promise<string> => {
      await open(page, address)
      return page.locator('#main h1').first().evaluate((one) => {
        const drawn = getComputedStyle(one)
        return `size ${drawn.fontSize}, line ${drawn.lineHeight}, weight ${drawn.fontWeight}`
      })
    }
    const records = await theTitle(pathFor('records'))
    expect(await theTitle(pathFor('allPages' as never)), `All records' title is drawn at ${records}`).toBe(records)
  } finally {
    await context.close()
  }
}, 120_000)

it.skipIf(PICTURES === undefined)('takes the pictures of the sidebar, open, narrowed and as the menu', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  const label = async (page: Page): Promise<void> => {
    await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
    await page.waitForTimeout(600)
  }
  for (const theme of ['light', 'dark'] as const) {
    for (const [width, narrowed] of [[1440, false], [1440, true], [990, false], [660, false], [390, false]] as const) {
      const { context, page } = await aWindow({ theme, narrowed, width })
      try {
        const name = (what: string): string => join(folder, `${what}-${String(width)}-${theme}.png`)
        await open(page, '/')
        await label(page)
        const menu = await page.locator('.shell-menu').isVisible()
        if (!menu) await page.screenshot({ path: name(narrowed ? 'home-narrowed' : 'home-open') })
        else {
          await page.screenshot({ path: name('home-menu-shut') })
          await page.locator('.shell-menu').click()
          await page.locator('#shell-side[data-drawer="open"]').waitFor()
          await page.waitForTimeout(600)
          await page.screenshot({ path: name('home-menu-open') })
        }
        // NARROWED, AN ENTRY'S NAME SHOWN: by the mouse over Reports, and by the keyboard on Checklists.
        if (narrowed) {
          await page.locator('#shell-side [data-target*="rail.notes"]').hover()
          await page.waitForTimeout(600)
          await page.screenshot({ path: name('home-narrowed-name-by-the-mouse') })
          await page.mouse.move(width - 200, 450)
          await page.locator('#shell-side .shell-brand').focus()
          for (let press = 0; press < 20 && !(await page.evaluate(() => document.activeElement?.getAttribute('data-target')?.includes('rail.checklists') ?? false)); press++) {
            await page.keyboard.press('Tab')
          }
          await page.waitForTimeout(600)
          await page.screenshot({ path: name('home-narrowed-name-by-the-keyboard') })
        }
        // A page reached from All pages, so the picture shows which entry is lit.
        if (!menu) {
          await open(page, pathFor('records'))
          await label(page)
          await page.screenshot({ path: name(narrowed ? 'records-narrowed' : 'records-open') })
          // The base has no All pages page, so the pictures before the change have none of it.
          const allPages = Object.values(FLAT_ROUTES).includes('allPages' as never) ? pathFor('allPages' as never) : undefined
          if (allPages !== undefined) await open(page, allPages)
          if (allPages !== undefined && await page.locator('#main .ap-group').count() > 0) {
            await label(page)
            await page.screenshot({ path: name(narrowed ? 'all-pages-narrowed' : 'all-pages-open'), fullPage: true })
          }
        }
      } finally {
        await context.close()
      }
    }
  }
}, 900_000)
