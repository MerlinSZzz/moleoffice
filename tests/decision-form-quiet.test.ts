// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DECIDE FORM STOPS EXPLAINING ITSELF, AND THE INTERACTION IS UNTOUCHED.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO RULES, AND WHY THEY PULL AGAINST EACH OTHER
 * ---------------------------------------------------------------------------------------
 *
 *   1. The optional explanation box in a Decision is understandable from its context, and needs no
 *      paragraph inside it.
 *
 *   2. The Decision interaction stays as it is: an inline decision on Home is still possible
 *      without navigating away.
 *
 * So the prose goes and the act stays. Every test below holds one of those two rules: either a
 * piece of explanation that must not come back, or a piece of the interaction that must not move.
 *
 * ---------------------------------------------------------------------------------------
 * HOW EACH ONE IS READ
 * ---------------------------------------------------------------------------------------
 *
 * The form is rendered and its words are read off the markup. Where the question is about layout —
 * whether an option card is wide enough to read — the markup and its stylesheet go into a real
 * browser and the box is measured, because no reading of a stylesheet answers that.
 *
 * WHAT THIS FILE USED TO DO INSTEAD, in the half that is now gone. It counted string literals in
 * three named `.tsx` files and looked for two class names. One of those class names, `dq-quiet`, is
 * not in `src/web` at all, so the assertion could never go red: it said nothing about the product
 * and would have gone on passing if every rule it was about were deleted. The literal counting is
 * replaced by a sweep of the whole of `src/web` for the SENTENCE, which is the fact worth holding —
 * nobody types it out a second time — and does not depend on which three files somebody thought of.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT TEST, BECAUSE SOMETHING ELSE ALREADY DOES
 * ---------------------------------------------------------------------------------------
 *
 * The governance rule itself — an agent gets a 403 on creating, changing, deleting, restoring or
 * promoting a decision — is `tests/guard-human-only.test.ts`, `tests/human-only-http.test.ts` and
 * `tests/fork-desk.test.ts`. Nothing here weakens it and nothing here re-states it: a second test of
 * the one access control in the product, written from the browser's side, would be a second answer
 * to the question those files already answer.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sectionsOf } from '../src/web/components/sections.ts'
import { drawInABrowser, type Drawn } from './what-the-browser-draws.ts'
import { theWordListFiles } from './word-list-files.ts'

type Gov = typeof import('../src/web/components/Governance.tsx')
type Queue = typeof import('../src/web/components/DecisionQueue.tsx')

let gov: Gov
let queue: Queue

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Every file under `src/web`, all the way down. */
function webFiles(dir = 'src/web'): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...webFiles(rel))
    else out.push(rel)
  }
  return out
}

/**
 * Which browser files and English word list write this sentence out.
 *
 * A sentence a reader meets on two screens has to be written once, or the two can drift. This
 * answers "who typed it", over the whole tree rather than over three files somebody remembered.
 * The English list is every file of it, en.ts and every wave's part, and a sentence in any of them is
 * named as THE_ENGLISH_LIST, once (wave 13j, round 41).
 */
function filesWriting(sentence: string): string[] {
  const writes = (file: string) => readFileSync(join(ROOT, file), 'utf8').includes(sentence)
  const inTheList = theWordListFiles('en').filter(writes).length
  return [...webFiles().filter(writes), ...(inTheList === 0 ? [] : inTheList === 1 ? [THE_ENGLISH_LIST] : [`${THE_ENGLISH_LIST}, ${String(inTheList)} times`])]
}

/** What `filesWriting` names the English word list. */
const THE_ENGLISH_LIST = 'the English word list'

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  gov = await import('../src/web/components/Governance.tsx')
  queue = await import('../src/web/components/DecisionQueue.tsx')
})

/** A fork as an agent files one. The same shape `GET /api/forks` carries in `fields`. */
const FORK: Record<string, unknown> = {
  question: 'Should the gripper close on contact, or on measured force?',
  options: [
    'a — Close on contact. It is simple and it crushes anything soft.',
    'b — Close on force. It needs the load cell calibrated first.',
  ],
  recommendation: 'Take (b). The load cell is already on the bench.',
  because: 'Two demos have crushed a cup each.',
  revisit_when: 'A gripper with a compliant pad.',
}

/** Markup with the stylesheets taken out, for a question about words. */
const render = (el: React.ReactElement): string =>
  renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

const formElement = (data: Record<string, unknown>, inline: boolean): React.ReactElement =>
  h(gov.ProposalGovernance, {
    recordId: 'p-1',
    title: 'Should the gripper close on contact?',
    data,
    resolved: false,
    ...(inline ? { inline: true } : {}),
    sections: sectionsOf({
      id: 'p-1',
      kind: 'proposal',
      data,
      title: 'Should the gripper close on contact?',
      summary: null,
      relations: [],
    }),
    onSettled: () => {},
  })

/** The panel as Home and the decisions page mount it: inside a card, with the choices open. */
const inlineForm = (data: Record<string, unknown> = FORK): string => render(formElement(data, true))

/** The same panel on the fork's own record page, where nothing above it carries the rule. */
const pageForm = (data: Record<string, unknown> = FORK): string => render(formElement(data, false))

/** The words a reader sees, with every tag and every stylesheet gone. */
const words = (markup: string): string =>
  markup
    .replace(/<style\b[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

// ============================================================================ the optional box

// ============================================================================ said once

/** A reading of what is waiting, with the three parts a caller wants to set. */
function waiting(settle: number, asked = 0, setAside = 0) {
  return {
    status: 'ready' as const,
    value: {
      items: Array.from({ length: settle + asked + setAside }, (_ignored, at) => ({ id: `w-${at}` })),
      counts: { settle, asked, setAside },
      excluded: [],
      scope: 'every project',
      note: 'what is waiting',
    },
  } as never
}

describe('an empty queue', () => {
  it('says it in the mark beside the title, and says it once', () => {
    const html = render(h(queue.WaitingCount, { waiting: waiting(0) }))
    expect(html).toContain('px-absent')
    expect(words(html)).toContain('—')
    expect(words(html)).not.toContain('nothing waiting')
    // ONE WRITER FOR BOTH SURFACES. Home and the decisions page both draw this line, and they draw
    // it through the same component; a second surface writing the phrase itself would be a second
    // answer to "is anything waiting". The sweep is over src/web, so it finds a copy anywhere; the
    // English word list is swept too, and holds the key's one definition.
    expect(filesWriting("'home.nothingWaiting'")).toEqual(['src/web/components/DecisionQueue.tsx', THE_ENGLISH_LIST])
  })

  it('counts what is waiting as one number with its three parts', () => {
    // IT COUNTED FORKS AND NOW IT COUNTS THE READING. The line used to say "3 waiting · 2
    // recommended · 1 holding work up" about forks alone, which is what made it one of five claims
    // on Home that could not agree. It says the one number and the three tiers that sum to it; what
    // is recommended and what a fork is holding up are still on the cards themselves.
    const said = words(render(h(queue.WaitingCount, { waiting: waiting(3, 2, 1) })))
    expect(said).toContain('waiting on you')
    expect(said).toContain('to settle')
    expect(said).toContain('asked of you')
    expect(said).toContain('set aside')
  })
})

// ============================================================================ the interaction

describe('deciding on Home, which is the part that must not move', () => {
  it('opens on the choices, and asks nothing before them', () => {
    const html = inlineForm()
    // THE CARDS ARE THE CONTROL: each lettered option of a decision is pressed directly, and changes
    // colour once chosen — criterion M57. The card used to be a `<label>` around a radio and the
    // decision was written by a separate submit below the list; the card is the press now, so this
    // reads for the buttons rather than for the radios they replaced. The claim has not moved:
    // everything needed to CHOOSE is there the moment the card is opened.
    //
    // WHAT CHANGED ON 9 SEPTEMBER 2026 AND WHAT DID NOT. Criterion P89 makes deciding two steps, a press
    // and then a confirm: a confirm press stands under the cards, so the press on a card no longer
    // writes the decision. This test is unchanged in what it reads for, because the confirm press
    // is not drawn until a card has been pressed and nothing here presses one: what a reader meets
    // when the card opens is still the choices and nothing in front of them.
    expect(html).toContain('button type="button" class="px-gov-opt-inner"')
    expect(html).toContain('Close on force')
    expect(html).toContain('None of these')
    // A SECOND "Decide it" IS STILL REFUSED, and the confirm press is not one: it names the option
    // it will write ("Decide B: …"), so it asks a different question from the press that opened the
    // card. This reads for the whole phrase for that reason.
    expect(html, 'a second "Decide it" press appeared inside the card').not.toContain('Decide it')
    // AND NOTHING IS ASKED FOR BEFORE A CHOICE IS MADE. The submit is for the one answer a press
    // cannot supply — the person's own words when they take none of the options — so until they
    // ask for that, there is no control here but the cards.
    expect(html, 'a control stood in front of the choices').not.toContain('Record this decision')
    expect(html, 'the radio the press replaced is still being drawn').not.toContain('type="radio"')
  })

  it('draws no heading of its own above the question, because the card it sits in is the enclosure', () => {
    // A SECOND TITLE A FEW INCHES UNDER THE BAND'S OWN. On a record page this form is a panel and
    // its heading says "Waiting on you". Inside a card on Home the band above already says that, so
    // the form draws its own headings and no more.
    //
    // READ AS HEADINGS AND THEIR WORDS, not as a class name: what a reader meets is a line of large
    // text above the question, whatever the class on it happens to be called.
    const headings = (markup: string): string[] =>
      [...markup.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/g)].map((m) => words(m[1] ?? '').trim())
    const inside = headings(inlineForm())
    const onAPage = headings(pageForm())
    expect(inside, 'the inline card lost the question it is about').toContain(
      'Should the gripper close on contact, or on measured force?',
    )
    expect(inside, 'the inline card grew the panel’s own title above the question').not.toContain('Decisions')
    expect(onAPage, 'the form on a record page lost its own title').toContain('Decisions')
  })
})

// ============================================================================ the room an option gets

/**
 * MEASURED IN A BROWSER, BECAUSE NO READING OF THE STYLESHEET ANSWERS THIS.
 *
 * `.px-panel` declares `container-type: inline-size`. Until `.px-gov-inline` declared one too, the
 * "is there room for two columns" query inside a 560px card was answered by the 1140px band around
 * it. Photographed at 1440 on 15 August 2026: the option cards were about 55px wide and every
 * option read one character per line.
 *
 * So the card and the band are both built here, at the widths they had, and the option card is
 * measured. The wide case is measured as well — otherwise a form that never splits into two columns
 * anywhere would pass the narrow case while having lost the layout entirely.
 */
describe('an option card gets the width of the card it is in, not of the band the card sits on', () => {
  let narrow: Drawn
  let wide: Drawn

  /** The band, with a card of the given width inside it, holding the inline form. */
  const inABand = (card: number): string =>
    `<div style="width: 1140px; container-type: inline-size; container-name: panel">` +
    `<div style="width: ${card}px">${renderToStaticMarkup(formElement(FORK, true))}</div></div>`

  beforeAll(async () => {
    narrow = await drawInABrowser(inABand(560))
    wide = await drawInABrowser(inABand(1140))
  }, 60_000)

  afterAll(async () => {
    await narrow?.close()
    await wide?.close()
  })

  /** How wide the first option card really is. */
  const optionWidth = (drawn: Drawn): Promise<number> =>
    drawn.page.evaluate(() => {
      const option = document.querySelector('.px-gov-opt')
      if (option === null) return -1
      return Math.round(option.getBoundingClientRect().width)
    })

  it('gives an option in a 560px card most of that card to read in', async () => {
    const width = await optionWidth(narrow)
    expect(width, 'no option card was drawn, so this measures nothing').toBeGreaterThan(0)
    // The measured failure was about 55px. The floor here is what a line of an option needs to be
    // readable at all rather than a number anybody chose: half the card.
    expect(width, `an option in a 560px card is only ${width}px wide, so it reads a word per line`).toBeGreaterThan(
      280,
    )
  })

  it('still lays the form out in two columns when the card really is wide', async () => {
    // THE CONTROL. Without it the case above would pass on a form that had lost the desk layout
    // altogether, which is a different regression drawn the same way.
    const columns = await wide.styleOf('.px-gov-decide[data-deciding="1"]', 'grid-template-columns')
    expect(columns.split(' ').length, `a 1140px card drew the decide form in one column: ${columns}`).toBe(2)
    const one = await narrow.styleOf('.px-gov-decide[data-deciding="1"]', 'grid-template-columns')
    expect(one.split(' ').length, `a 560px card drew the decide form in two columns: ${one}`).toBe(1)
  })
})
