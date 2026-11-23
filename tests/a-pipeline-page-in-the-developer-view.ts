// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE'S PAGE IN THE DEVELOPER VIEW, AND THE SENTENCES ONLY THAT VIEW SHOWS. Wave 13u round 231.
 *
 * By the decision of 16 November 2026, which the secretary filed from the owner's words, the About part of
 * a pipeline's page, and the section that
 * follows it, hold only what a reader needs to trust the page. The drawing's other sentences, such as the links it
 * could not draw and the stored hints it does not use, are shown in the developer view only, in a section of their
 * own: `[data-pipeline-part="developer"]`, right after the said section, or right after the About part when the said
 * section is not drawn. Each line of it is a `li`, and names its sentence's word key in a `code` first and then says
 * the sentence. The normal view draws no such section.
 *
 * The developer view is asked for in the address, `?mode=inspect` before the hash, as src/web/lib/mode.ts reads it.
 * The address is not stored, so a page opened next without it is in the normal view again.
 */
import type { Page } from 'playwright'

import { waitForThePage, type LiveApp } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'

export const DEVELOPER = '[data-pipeline-part="developer"]'

let loads = 0

/**
 * How long a page is given to mark itself ready. The mark waits until no read the page asked for is in flight. A block
 * pipeline's page of the made-up master asks the restriction and work-domain reads about some 40 records, and on 16
 * November 2026, on a machine shared with three other test runs, four waits of 30 s for such a page ran out with one of
 * those reads still in flight.
 */
export const A_PAGE_IS_READY_WITHIN = 120_000

/** Opens a page of the test office in the developer view, as openThePage in a-made-up-office-drawn-in-lanes.ts does. */
export async function openInTheDeveloperView(app: LiveApp, path: string, theme: 'light' | 'dark' = 'light'): Promise<void> {
  loads += 1
  await app.page.goto(`${app.site}/?lang=en&mode=inspect&theme=${theme}&load=developer-${String(loads)}#${path}`)
  await waitForThePage(app.page, A_PAGE_IS_READY_WITHIN)
  await waitForTheProjects(app.page)
}

/** Opens a page of the test office in the normal view, as openThePage does, with A_PAGE_IS_READY_WITHIN for the mark. */
export async function openInTheNormalView(app: LiveApp, path: string, theme: 'light' | 'dark' = 'light'): Promise<void> {
  loads += 1
  await app.page.goto(`${app.site}/?lang=en&theme=${theme}&load=normal-${String(loads)}#${path}`)
  await waitForThePage(app.page, A_PAGE_IS_READY_WITHIN)
  await waitForTheProjects(app.page)
}

/** One line of the developer section: the word key it names, and the sentence after it. */
export interface ADeveloperLine {
  key: string
  words: string
}

/** Lines kept on the drawing or its empty-state element, in their page order. */
export async function theDeveloperLines(page: Page): Promise<ADeveloperLine[]> {
  const raw = await page.locator('[data-to-developers]').first().getAttribute('data-to-developers')
  return raw === null ? [] : JSON.parse(raw) as ADeveloperLine[]
}

/** The engine's unchanged map of link ids to its no-route reasons. */
export async function theUnroutedLinks(page: Page): Promise<Record<string, string>> {
  const raw = await page.locator('[data-drawing="lanes"]').first().getAttribute('data-not-drawn')
  return raw === null ? {} : JSON.parse(raw) as Record<string, string>
}

/**
 * THE SENTENCES FOR DEVELOPERS, BY THE WORD KEY THAT WRITES EACH ONE. These are the page's sentences the decision sends
 * to the developer view: what the drawing could not draw or does not use, and the like. Each sentence written from one
 * word is named by that word's key. Two are written from several words, so they are named by the word that says what
 * happened: the restriction checks that could not run (`g7b.Canvas.could_not_run`), and the work-domain read while it
 * runs (`g7b.Canvas.reading_who_is_working_on_these_records`).
 *
 * The sentences every reader keeps are not here: an arrangement that could not be read, a count a card cannot show, a
 * gate that cannot be read, a restriction or work-domain read that failed or is running, and the restricted records.
 */
export const FOR_DEVELOPERS = [
  'lanesInput.placedNotLoaded',
  'lanesInput.headNotLoaded',
  'lanesInput.oldNodeLane',
  'lanesInput.unusedHints',
  'lanesInput.stepUnderFirst',
  'lanesInput.linkBroken',
  'lanesInput.linkFarNotLoaded',
  'lanesInput.ownLinkNotDrawn',
  'lanesInput.linkNotDrawn',
  'lanesInput.linkOfAnAreasPipeline',
  'lanesInput.linkOfAnotherPipeline',
  'lanesInput.linkOfAnotherPipelinesStep',
  'lanes.missingEnd',
  'drawingWithNoMarks.workDomain',
  'g7b.Canvas.could_not_run',
  'g7b.Canvas.reading_who_is_working_on_these_records',
] as const

/** A word's text, or each of its plural forms, as a pattern that any value may fill. */
function patternsOf(word: unknown): RegExp[] {
  const forms = typeof word === 'string' ? [word] : typeof word === 'object' && word !== null ? Object.values(word).filter((one) => typeof one === 'string') : []
  if (forms.length === 0) throw new Error(`a word for developers is neither text nor plural forms: ${JSON.stringify(word)}`)
  return forms.map((form) => new RegExp(`^${form.split(/\{[a-zA-Z]+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]+?')}$`))
}

let patterns: { key: (typeof FOR_DEVELOPERS)[number]; fits: RegExp[] }[] | null = null

/**
 * Which word for developers wrote the sentence, in English, or null when none did. A sentence of the page is matched
 * whole, so a sentence for every reader that quotes a title is not taken for one.
 */
export async function theWordForDevelopersThatWrote(sentence: string): Promise<(typeof FOR_DEVELOPERS)[number] | null> {
  if (patterns === null) {
    const { englishWords } = await import('../src/shared/words/joined.ts')
    const words = englishWords() as unknown as Record<string, unknown>
    const at = (key: string): unknown => {
      if (!(key in words)) throw new Error(`the English words have no ${key}`)
      return words[key]
    }
    const restriction = `\\d+${String(at('g7b.Canvas.restriction'))} (${String(at('g7b.Canvas.check'))}|${String(at('g7b.Canvas.checks'))})${String(at('g7b.Canvas.could_not_run'))}: `
    patterns = FOR_DEVELOPERS.map((key) => {
      // restrictions-and-presence.ts writes this one from four words and the checks that could not run.
      if (key === 'g7b.Canvas.could_not_run') return { key, fits: [new RegExp(`^${restriction}[\\s\\S]+$`)] }
      return { key, fits: patternsOf(at(key)) }
    })
  }
  const text = sentence.replace(/\s+/g, ' ').trim()
  return patterns.find((one) => one.fits.some((fit) => fit.test(text)))?.key ?? null
}
