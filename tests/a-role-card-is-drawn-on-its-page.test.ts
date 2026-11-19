// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD IS DRAWN — THE SEVEN PARTS, ON THE PAGE OF THE RECORD THAT HOLDS IT.
 *
 * Problem `76Yh8qLhHdGY` and criterion P44 of design/permissions/ACCEPTANCE.md section 8.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The question was where the role cards were visible in Mole Office.
 * They were mirrored as `role_card` records, so a card was openable, and the page drew the title,
 * the summary and three collapsed rows — Role name, Copied from, Copied at — and nothing of the card
 * itself. The seven parts sit in one field of type `Record<string, unknown>` that no page read. A later
 * message settled where the way in goes: the Embassy.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS MEASURED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what a person can read on a screen, and the fault was a field nothing drew.
 * Reading the record back would have passed on the day the owner opened the page and saw three collapsed
 * rows. So this starts a stack, draws the pages, and reads what was drawn — at 1440 and at 390, in
 * light and in dark, because the layout is the other half of the claim.
 *
 * THE CHAPTER LINKS ARE PART OF IT. A card's Must read line names chapter numbers; a chapter of the
 * code of law is a `module` record carrying `extra.chapter` (decision `JC_raqC0fRCh`). This files
 * two chapter records, one of which the worker card names and one of which it does not, so a link to
 * the wrong chapter cannot pass.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { deleteTheCopiedDefaultChapters, liveApp, one, type LiveApp, waitForThePage } from './helpers.ts'
import { readFileSync } from 'node:fs'
import type { RolesDeclaration } from '../src/shared/roles.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ROLE_CARD_WORDS } from '../src/web/components/RoleCard.tsx'
import { ROLES_WORDS } from '../src/web/pages/RolesPage.tsx'

const DECLARED = JSON.parse(readFileSync(new URL('../src/config/roles.json', import.meta.url), 'utf8')) as RolesDeclaration
const DEFAULTS = JSON.parse(readFileSync(new URL('../src/config/rules/default-regulations.json', import.meta.url), 'utf8')) as { chapters: unknown[] }
const WORKER_CHAPTERS = DECLARED.cards.find((card) => card.name === 'worker')!.mustRead.chapters

let app: LiveApp
let page: Page
/** The record holding the copy of the worker card, and the record of chapter 2. */
let workerCard = ''
let chapterTwo = ''

/** The one a card gets until somebody chooses, and the one this test chooses instead. Criterion P47. */
const FIRST_PORTRAIT = '/api/portraits/role/worker/worker-1'
const CHOSEN_PORTRAIT = '/api/portraits/role/worker/worker-2'

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function open(where: string, theme: 'light' | 'dark', width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Everything one pass over a drawn page measured. */
interface Seen {
  /** The heading of every labelled part of the card, in the order they are drawn. */
  parts: string[]
  /** The text of the whole card. */
  text: string
  /** Every chapter row: the words drawn, and the address the link goes to, or null for no link. */
  chapters: { words: string; to: string | null }[]
  /** How far the document scrolls sideways past the window. Anything but 0 is an overflow. */
  overflow: number
}

async function readTheCard(): Promise<Seen> {
  return (await page.evaluate(() => {
    const card = document.querySelector('.rc')
    return {
      parts: [...document.querySelectorAll('.rc-part-name')].map((one) => (one.textContent ?? '').trim()),
      text: card === null ? '' : (card.textContent ?? ''),
      chapters: [...document.querySelectorAll('.rc-chapter')].map((one) => {
        const link = one.querySelector('a')
        return { words: (one.textContent ?? '').trim(), to: link === null ? null : link.getAttribute('href') }
      }),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })) as Seen
}

beforeAll(async () => {
  app = await liveApp({ name: 'role-card', viewport: { width: 1440, height: 900 } })
  page = app.page

  // A FRESH OFFICE COPIES THE DEFAULT CHAPTERS at its first start (wave 13s round 7). This test is
  // about a project where only some chapters have a record, so it deletes the copied chapters first.
  expect(await deleteTheCopiedDefaultChapters(app.api)).toBe(DEFAULTS.chapters.length)

  // THE TWO CHAPTER RECORDS. A chapter is a module carrying its number in `extra.chapter`, which is
  // the rule tools/rules-chapters.mjs finds them by. Chapter 2 is one the worker card names and
  // chapter 7 is one it does not, so a page linking every chapter to the same record cannot pass.
  const two = (await post('/api/records', {
    kind: 'module',
    title: 'Processes and ports',
    summary: 'Stop a process only by the group id you recorded.',
    data: { context: 'the chapter about what outlives your command', extra: { chapter: 2 } },
  }))['record'] as { id: string }
  chapterTwo = two.id
  await post('/api/records', {
    kind: 'module',
    title: 'The chat and messages',
    summary: 'Who may write to a person, and how to lead somebody to a page.',
    data: { context: 'the chapter about messages', extra: { chapter: 7 } },
  })

  const copied = (await post('/api/roles/mirror', undefined)) as { written?: string[] }
  expect(copied.written, 'the mirror copied no card into the project').toContain('worker')

  const listed = (await (await fetch(`${app.api}/api/records?kind=role_card&shape=full`)).json()) as {
    records?: { id: string; data?: { roleName?: string } }[]
  }
  workerCard = one(
    (listed.records ?? []).filter((r) => r.data?.roleName === 'worker'),
    'the record copying the worker card',
  ).id
}, 120_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the card itself is on the page of the record that holds it', () => {
  it('draws the parts of the card, under headings, where three collapsed rows used to be all there was', async () => {
    await open(`/r/${workerCard}`, 'light', 1440)
    const seen = await readTheCard()
    // THE PARTS OF THE TEMPLATE. The first is the name, which the record's own title carries. The
    // May and May-not headings that stood second and third are gone with criterion P56, and Powers
    // stands where they were; What it is for became Duties with the same criterion.
    expect(seen.parts).toEqual([
      ROLE_CARD_WORDS.duties,
      // HOW IT WORKS, right after Duties and before Powers. Since wave 13k round 17 it is the card's
      // handbook text, `howItWorks` in roles.json, and no longer its flow.
      ROLE_CARD_WORDS.flow,
      ROLE_CARD_WORDS.powers,
      ROLE_CARD_WORDS.mustRead,
      ROLE_CARD_WORDS.reportsTo,
      ROLE_CARD_WORDS.whatEndsIt,
      ROLE_CARD_WORDS.appointedBy,
      ROLE_CARD_WORDS.appoints,
    ])
  })

  it('draws the words of the card and not only its field names', async () => {
    const seen = await readTheCard()
    // A power the worker holds, by name, and one act under it with its key beside it — a refusal
    // names the key, and a reader matching one to the other needs the word Mole Office uses.
    expect(seen.text).toContain('Records')
    expect(seen.text).toContain('File a record of any kind but a decision')
    expect(seen.text).toContain('record.write')
    // AND NOT A POWER IT DOES NOT HOLD. Criterion P56: the card carries no May-not list, so the
    // person's own acts are not on a worker's card at all, under any heading.
    expect(seen.text).not.toContain('Write a decision, or promote a proposal into one')
    expect(seen.text).not.toContain('decision.write')
    // Who it reports to, and what ends it: the two parts a person opens a card to read.
    expect(seen.text).toContain('Its starter.')
    expect(seen.text).toContain('Its own message saying it is done does not end it.')
  })

  it('makes each chapter it must read a link to that chapter record', async () => {
    const seen = await readTheCard()
    // The worker card supplies the chapters to read. This project holds a record for chapter 2
    // and a record the card does not name, so only chapter 2 is a link.
    expect(seen.chapters).toHaveLength(WORKER_CHAPTERS.length)
    const linked = seen.chapters.filter((one) => one.to !== null)
    expect(linked).toHaveLength(1)
    expect(linked[0]?.to).toBe(`#/r/${chapterTwo}`)
    expect(linked[0]?.words).toContain('Processes and ports')
    // How much of it this role reads, in words rather than the stored value.
    expect(linked[0]?.words).toContain('the whole chapter')
    // A chapter nothing here answers to says so rather than being drawn as a dead link.
    expect(seen.chapters.filter((one) => one.words.includes(ROLE_CARD_WORDS.noChapterRecord))).toHaveLength(WORKER_CHAPTERS.filter((one) => one.chapter !== 2).length)
  })

  it('draws the first of the role\'s three portraits, which is what a card gets until somebody chooses', async () => {
    // Criterion P47: three per role, in one style, and whoever holds the card picks one of the
    // three. Until they do, the card carries the role's -1 picture — a default, not a choice.
    const drawn = await page.evaluate(() => {
      const img = document.querySelector('.rc-portrait')
      return { src: img === null ? null : img.getAttribute('src'), alt: img === null ? null : img.getAttribute('alt') }
    })
    // ITS SMALL COPY, which is what the page draws; a press opens the whole picture (wave 13x round 11).
    expect(drawn.src?.endsWith(`${FIRST_PORTRAIT}?size=small`), String(drawn.src)).toBe(true)
    // The words under it are the record's own title. A caption of this page's invention would be a
    // second name for the card.
    expect(drawn.alt).toBe('The worker role card')
  })

  it('serves the picture it names, so the card is not drawing an address that answers nothing', async () => {
    const got = await fetch(`${app.api}${FIRST_PORTRAIT}`)
    expect(got.status, await got.clone().text()).toBe(200)
    expect(got.headers.get('content-type')).toBe('image/png')
    expect((await got.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  })

  it('refuses a name that is a path, so the two folders are the whole of what it reads', async () => {
    const out = await fetch(`${app.api}/api/portraits/role/worker/${encodeURIComponent('../../../etc/passwd')}`)
    expect(out.status).toBe(400)
    expect(await out.text()).toContain('plain name')
    const noSuchSet = await fetch(`${app.api}/api/portraits/elsewhere/worker/worker-1`)
    expect(noSuchSet.status).toBe(404)
  })

  it('leaves a place for the portrait and says nobody has painted one, where the card names none', async () => {
    // A card whose copy holds no portrait draws the frame and says so. That is what a role nobody
    // has painted looks like, and it is a state rather than a gap.
    const bare = (await post('/api/records', {
      kind: 'role_card',
      title: 'The stand-in role card',
      summary: 'It stands in for a role nobody has painted.',
      data: {
        roleName: 'stand-in',
        card: { name: 'stand-in', rung: null, duties: 'It stands in for a role nobody has painted.' },
        copiedFrom: 'design/permissions/roles.json',
        copiedAt: '2026-09-06 16:00:00',
      },
    }))['record'] as { id: string }
    await open(`/r/${bare.id}`, 'light', 1440)
    const seen = await readTheCard()
    expect(seen.text).toContain(ROLE_CARD_WORDS.noPortrait)
    expect(await page.locator('.rc-face').count()).toBe(1)
    expect(await page.locator('.rc-portrait').count()).toBe(0)
    await open(`/r/${workerCard}`, 'light', 1440)
  })

  it('draws the one that was chosen instead of the default', async () => {
    // Criterion P47. The picture is a choice, so it is stored on the card and not in the
    // declaration, and `dataPatch` is how a partial change is written.
    const res = await fetch(`${app.api}/api/records/${workerCard}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_PERSON,
      },
      body: JSON.stringify({ dataPatch: { portrait: CHOSEN_PORTRAIT } }),
    })
    expect(res.ok, await res.text()).toBe(true)

    await open(`/r/${workerCard}`, 'light', 1440)
    const drawn = await page.evaluate(() => ({
      src: document.querySelector('.rc-portrait')?.getAttribute('src') ?? null,
      stillSaysNone: (document.querySelector('.rc')?.textContent ?? '').includes('nobody has painted one yet'),
    }))
    expect(drawn.src).toContain(CHOSEN_PORTRAIT)
    expect(drawn.stillSaysNone).toBe(false)
  })

  it('keeps the chosen portrait when the declaration is copied again', async () => {
    // The mirror rewrites a copy that no longer matches the declaration, and it writes the default
    // only on a copy it is making for the first time. The picture is a choice somebody made and the
    // declaration holds no pictures, so a rewrite leaves it exactly as it found it.
    await post('/api/roles/mirror', undefined)
    await open(`/r/${workerCard}`, 'light', 1440)
    const src = await page.evaluate(() => document.querySelector('.rc-portrait')?.getAttribute('src') ?? null)
    expect(src).toContain(CHOSEN_PORTRAIT)
  })

  it('says the card is for one thing once, and not twice on one page', async () => {
    // The mirror writes the card's duties into the record's summary, so drawing the page's lede as
    // well would put the same words on the screen twice.
    //
    // THE WORDS COME FROM THE DECLARATION rather than being typed here. They used to be typed, and
    // they were the worker card's `whatItIsFor`; criterion P56 replaced that field with `duties`,
    // and a sentence typed into a test is a copy of a declaration that nothing keeps in step — this
    // test went green by finding its sentence nowhere on a page that was drawing the right thing.
    const asked = await fetch(`${app.api}/api/roles`)
    const roles = (await asked.json()) as { cards: { name: string; duties: string }[] }
    const said = String(roles.cards.find((one) => one.name === 'worker')?.duties)
    expect(said, 'the declaration holds no worker card').not.toBe('undefined')
    const times = await page.evaluate((sentence) => {
      const main = document.querySelector('#main')
      const text = main === null ? '' : (main.textContent ?? '')
      return text.split(sentence).length - 1
    }, said)
    expect(times).toBe(1)
  })

  it('draws the person’s own newly registered acts on the person card, where a card’s acts live', async () => {
    // THE THREE ACTS A DECISION REGISTERED. The list at #/roles draws a card's powers
    // as names; the acts under a name are on the card's own page (criterion P56), and this is the
    // person's card. The copy is one the mirror wrote, so this reads the declaration through the
    // product's own page rather than through the file.
    const listed = (await (await fetch(`${app.api}/api/records?kind=role_card&shape=full`)).json()) as {
      records?: { id: string; data?: { roleName?: string } }[]
    }
    const administrator = one(
      (listed.records ?? []).filter((r) => r.data?.roleName === 'administrator'),
      'the record copying the administrator card',
    )
    await open(`/r/${administrator.id}`, 'light', 1440)
    const keys = await page.evaluate(() =>
      [...document.querySelectorAll('.rc-act-key')].map((one) => (one.textContent ?? '').trim()),
    )
    expect(keys).toContain('direction.shelve')
    expect(keys).toContain('goal.confirm')
    expect(keys).toContain('plan.commit')
    await open(`/r/${workerCard}`, 'light', 1440)
  })

  // LIGHT ONLY. Fitting the window does not depend on the colour scheme, so the dark fits go.
  for (const theme of ['light'] as const) {
    for (const width of [1440, 390]) {
      it(`fits the window at ${String(width)} in ${theme}`, async () => {
        await open(`/r/${workerCard}`, theme, width)
        const seen = await readTheCard()
        // 7 parts before How it works was added, 8 since: Duties, How it works, Powers, What it
        // must read, Who it reports to, What ends it, Who appoints it, Whom it appoints.
        expect(seen.parts.length).toBe(8)
        expect(seen.overflow, 'the card pushes the page sideways').toBe(0)
      })
    }
  }
})

describe('the cards are in one place, and it opens from the Embassy', () => {
  it('lists every card with its rung and its one sentence', async () => {
    await open('/roles', 'light', 1440)
    const rows = await page.evaluate(() => ({
      names: [...document.querySelectorAll('.rol-name')].map((one) => (one.textContent ?? '').trim()),
      rungs: [...document.querySelectorAll('.rol-rung')].map((one) => (one.textContent ?? '').trim()),
      text: document.querySelector('.page')?.textContent ?? '',
      links: [...document.querySelectorAll('.rol-open a')].map((one) => one.getAttribute('href')),
    }))
    expect(rows.names).toEqual([
      'worker', 'supervisor', 'secretary', 'inspector',
      // NOT THE MAILER SINCE 1 OCTOBER 2026. It was a tool's card off the tree, and
      // another decision makes the mail tool the owner's own tool, not a role card.
      // AND THE ROLE A PERSON HOLDS, in its own list below. Criterion P45.
      'administrator',
      // AND THE BLOCK THAT MAKES A CARD, at the end. Criterion P50:
      // a new card is added on this same page. It carries a name like every other
      // block and nothing else is filled in.
      ROLES_WORDS.addName,
    ])
    // Three rungs, one agent role that is not on the tree (the inspector; the mailer was the second
    // until it left on 1 October 2026), and a person's card which is not on the agent tree at all —
    // each said in words rather than left blank.
    // The add block has no rung: it is not a card yet, and a rung on it would be a claim about
    // something nobody has written.
    expect(rows.rungs).toEqual(['rung 1', 'rung 2', 'rung 3', ROLES_WORDS.noRung, ROLES_WORDS.notARung])
    expect(rows.text).toContain('It holds one piece of work and answers for it.')
    // Every card of both lists is copied here, so every row opens one. FIVE SINCE 1 OCTOBER 2026, when
    // the mailer card left the declaration.
    expect(rows.links).toHaveLength(5)
    expect(rows.links).toContain(`#/r/${workerCard}`)
  })

  it('lists the cards a person holds in a list of their own, because nothing reads across the two', async () => {
    // Criterion P45: a person has a role card too. A person's role is never one an agent can be
    // registered as, so the page draws two lists and says which is which.
    const seen = await page.evaluate(() => ({
      groups: [...document.querySelectorAll('.rol-group-name')].map((one) => (one.textContent ?? '').trim()),
      people: [...document.querySelectorAll('.rol-group')]
        .filter((g) => (g.querySelector('.rol-group-name')?.textContent ?? '').includes('person'))
        .map((g) => (g.textContent ?? '')),
    }))
    // THREE GROUPS SINCE CRITERION P51, and the third is its own for the same reason the first two
    // are separate: nothing reads across. A card written in the product is enforced by nothing, so a
    // reader must not meet it in the list of the cards that ARE enforced.
    //
    // AND THE POWER TREE ABOVE THEM SINCE CRITERION P68, which asks the Role cards page to draw
    // a tree of powers too. It is a drawing of who stands above whom rather than a
    // fourth list of cards, and it is first because it is what the page answers in one look.
    expect(seen.groups).toEqual([ROLES_WORDS.tree, ROLES_WORDS.agents, ROLES_WORDS.people, ROLES_WORDS.madeHere])
    const people = seen.people.join(' ')
    expect(people).toContain('administrator')
    // Where they stand, from the card, and the words that keep the agent ladder out of it.
    expect(people).toContain('administrator of Mole Office')
    expect(people).toContain(ROLES_WORDS.notARung)
  })

  // Test change (wave 13y round 165): the Agents group is listed on All pages now. On Role cards the
  // sidebar lights its All pages entry, and All pages lists Role cards inside the Agents group.
  it('marks Role cards inside the Agents group', async () => {
    const mark = await page.locator('nav.shell-nav a.shell-all-pages').getAttribute('aria-current')
    await page.evaluate(() => { location.hash = '#/all-pages' })
    await page.locator('#main .ap-group[data-group="agents"]').waitFor({ timeout: 30_000 })
    const rail = await page.evaluate(() => {
      const group = document.querySelector('#main .ap-group[data-group="agents"]')
      return {
        count: group?.querySelectorAll('a[href="#/roles"]').length ?? 0,
        caption: group?.querySelector('.ap-cap')?.textContent,
      }
    })
    expect(rail.caption).toBe('Agents')
    expect(rail.count).toBe(1)
    expect(mark).toBe('true')
  })

  // LIGHT ONLY. Fitting the window does not depend on the colour scheme, so the dark fits go.
  for (const theme of ['light'] as const) {
    for (const width of [1440, 390]) {
      it(`fits the window at ${String(width)} in ${theme}`, async () => {
        await open('/roles', theme, width)
        const seen = await page.evaluate(() => ({
          names: document.querySelectorAll('.rol-name').length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }))
        // Five cards and the block that makes a sixth. Criterion P50. Six cards until the mailer card
        // left the declaration on 1 October 2026.
        expect(seen.names).toBe(6)
        expect(seen.overflow, 'the list pushes the page sideways').toBe(0)
      })
    }
  }
})
