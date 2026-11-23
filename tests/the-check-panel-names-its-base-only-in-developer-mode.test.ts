// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK PANEL NAMES THE BASE IT READ AGAINST ONLY IN DEVELOPER MODE.
 *
 * By item 2 of one decision, the check panel's fork base shows only in developer mode, like its working directory and
 * commit by item 3 of another.
 *
 * WHAT THIS PROVES, IN A REAL BROWSER. Every mode, every reading and the width case are read in
 * English; Chinese keeps one case for each panel line, the base line and the reading line:
 *
 *   · developer mode (?mode=inspect) draws the base line (`chk.baseFound`) with the assembly's own
 *     sentence about it, and Chinese reads that line once;
 *   · developer mode draws `chk.noBaseNamed` where no base was said, and the state
 *     `chk.noWorkingDirectoryWord` where the run recorded a checkout with no working directory (as
 *     decided in November 2026, the sentence that named the branch and the fork point is gone);
 *   · normal mode (?mode=normal) draws none of them, and still draws the part "What the check would
 *     read" with its file line, and the part "Who the office asked", so no heading is left over an
 *     empty part.
 *   · every normal-mode reading has no whitespace after "。" in zh, and exactly one space
 *     between sentences in en. The second pass adds assertions to the existing 24 normal-mode
 *     reading cases; no cases were added. Before adTmco_wIzln there were 57 cases: 8 base, 24 normal readings,
 *     24 developer readings and 1 drawing at four widths in both themes and languages.
 *
 * adTmco_wIzln, inspector note 52ZNPB44bOPb; USER.md invariants 2 and 5:
 * the sealed reading names its kind, and no kind means only sealed work. Five more readings
 * add 20 language/mode cases (77 total). Records fixtures omit tip, as the tool does.
 * WFeYzNnhPtkh, inspector ab2Bj-DkFm7S on adTmco_wIzln: whose tree was read comes first.
 * A sealed git reading and an older sealed release both name the worker's own worktree when
 * ofItsOwn is false. The older release adds four language/mode cases. Wave 13n round F keeps every
 * English case and one Chinese case for each panel line (43 cases).
 *
 * THE RUNS ARE REAL AND THE CHECK ON THEM IS MADE UP. Each run is a session filed through the API. The
 * page's read of the run is answered through `app.context.route`, which every page of the context uses, with the
 * real reply plus a made-up `whatTheCheckWouldRead`, because an assembly needs a checkout and an inspector this
 * test is not about.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run:
 *   - In `WhatItWouldRead` in src/web/components/TheCheckOnARun.tsx, draw the base line and the
 *     base's sentence in normal mode again (drop the `inspect` condition on both). The two English
 *     normal-mode base cases go red: "is not drawn in normal mode, and the part it was in still
 *     says what the check would read" and "says nobody named a base in developer mode only".
 *   - In `WhoWasAsked`, drop `|| !inspect` from the checkout condition. The no-working-directory
 *     case "draws that no working directory was recorded in developer mode only" goes red in
 *     English, on the state drawn in normal mode.
 *   - Normal mode drawing `said.says` again in `WhatTreeItRead` turns every English "normal mode
 *     describes <reading> without paths or commits" case red, and the one Chinese reading case.
 *     The stored sentence carries made-up paths and commits.
 *   - In `TheCheckOnARun`, drop `inspect &&` from the confirmation's standing condition
 *     (`? inspect && stands.standing === 'closed' && stands.confirmed !== null`). The two English
 *     confirmed normal-mode cases go red. `confirmedNotChecked` draws the path and commit in
 *     normal mode.
 *   - In `readingInWords`, restore `sentences.join(' ')`. The one Chinese reading case goes red,
 *     because its reading joins more than one translated sentence. Every English case stays green.
 *   Each mutation was run alone and restored in the second pass.
 *
 * Item 6 of one decision and item 2 of another, as read in hX_qDiISkTCp, say that the page builds the normal sentence
 * from the recorded facts in both word lists. Developer mode keeps the full
 * English sentence. No tool writes a second English sentence.
 * These readings are explicitly made-up browser fixtures, never observations of a real check.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { WhatWasRead } from '../src/shared/releasing.ts'
import type { Locator, Page } from 'playwright'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'

let app: LiveApp
let page: Page
let withABase = ''
let withNoBase = ''
let withNoDirectory = ''
let withADirectory = ''
/** Each made-up run's title, which its page draws, so an open can tell the run it asked for has been drawn. */
const titles = new Map<string, string>()

const MADE_UP_REF = 'c0ffee1234abcd'
const MADE_UP_SAYS = 'Made up for this test: the base is where the branch left the trunk.'

const MADE_UP_TREE = '/made-up/check-reading/worktree'
const MADE_UP_TIP = 'abcdef0123456789abcdef0123456789abcdef01'
const MADE_UP_OTHER_COMMIT = 'fedcba9876543210fedcba9876543210fedcba98'
const MADE_UP_FILE = 'private-worker-file.ts'
const MADE_UP_STAGE = '/made-up/sealed-files'
const MADE_UP_SEAL = 'made-up-seal-id'
const FULL_READING = `Made up for this test: read ${MADE_UP_TREE} at ${MADE_UP_TIP}, from ${MADE_UP_OTHER_COMMIT}, with ${MADE_UP_FILE} staged at ${MADE_UP_STAGE} for ${MADE_UP_SEAL}.`
/** The paths of the run with a working directory: its office run's log, its work folder, and the worktree a check would read. */
const MADE_UP_OFFICE_RUN = 'made-up-office-run'
const MADE_UP_LOG = '/made-up/office-runs/made-up-office-run.log'
const MADE_UP_WORK_FOLDER = '/made-up/worktrees/the-lamp'
const MADE_UP_CHECK_TREE = '/made-up/check-trees/the-lamp'
const readings: {
  name: string
  source: 'released' | 'refused' | 'assembly' | 'confirmed'
  facts: Partial<WhatWasRead>
  words: readonly WordKey[]
  scope?: number
  handedOn?: number
  run?: string
}[] = [
  { name: 'its own worktree at the sealed tip', source: 'released', facts: { sealId: MADE_UP_SEAL, sealKind: 'git' }, words: ['chk.read.ownSealedTip'] },
  { name: 'a verified copy of a files seal', source: 'released', facts: { sealId: MADE_UP_SEAL, sealKind: 'files', staged: MADE_UP_STAGE, tip: undefined }, words: ['chk.read.filesCopy'] },
  { name: 'the sealed record revisions', source: 'refused', facts: { sealId: MADE_UP_SEAL, sealKind: 'records', linkEvidence: 'read', tip: undefined }, words: ['chk.read.records'] },
  { name: 'the sealed record revisions of a seal made before links were pinned', source: 'refused', facts: { sealId: MADE_UP_SEAL, sealKind: 'records', linkEvidence: 'sealed-before-links', tip: undefined }, words: ['chk.read.recordsSealedBeforeLinks'] },
  { name: 'the sealed record revisions whose record does not say', source: 'refused', facts: { sealId: MADE_UP_SEAL, sealKind: 'records', tip: undefined }, words: ['chk.read.recordsLinksNotSaid'] },
  { name: 'sealed code with no tip recorded', source: 'released', facts: { sealId: MADE_UP_SEAL, sealKind: 'git', tip: undefined }, words: ['chk.read.sealedCodeNoTip'] },
  // WFeYzNnhPtkh, inspector ab2Bj-DkFm7S on adTmco_wIzln.
  // MUTATION: read the seal kind before ofItsOwn. Both sealed worker-tree cases fail in en and zh.
  { name: 'sealed code in the worker’s worktree', source: 'released', facts: { sealId: MADE_UP_SEAL, sealKind: 'git', ofItsOwn: false }, words: ['chk.read.workerTree'] },
  // MUTATION: read the seal kind before ofItsOwn; this older release must still name whose tree it read.
  { name: 'an older sealed release in the worker’s worktree', source: 'released', facts: { sealId: MADE_UP_SEAL, ofItsOwn: false }, words: ['chk.read.workerTree'] },
  { name: 'sealed work with no kind or tip recorded', source: 'released', facts: { sealId: MADE_UP_SEAL, tip: undefined }, words: ['chk.read.sealedWork'] },
  { name: 'sealed work with no kind and a recorded tip', source: 'released', facts: { sealId: MADE_UP_SEAL }, words: ['chk.read.sealedWork'] },
  { name: 'sealed work with no kind and a copy source', source: 'released', facts: { sealId: MADE_UP_SEAL, staged: MADE_UP_STAGE, tip: undefined }, words: ['chk.read.sealedWork'] },
  { name: 'the worker’s own worktree', source: 'refused', facts: { ofItsOwn: false }, words: ['chk.read.workerTree'] },
  { name: 'a confirmation accepting a seal without a check', source: 'confirmed', facts: { sealId: MADE_UP_SEAL, ofItsOwn: false }, words: ['chk.read.acceptedSeal'] },
  { name: 'a confirmation with no seal recorded', source: 'confirmed', facts: { ofItsOwn: false }, words: ['chk.read.acceptedNoSeal'] },
  { name: 'an unsealed reading of its own worktree', source: 'released', facts: { unsealed: true, sealId: MADE_UP_SEAL }, words: ['chk.read.ownTip', 'chk.read.unsealed'] },
  { name: 'an assembly with no seal recorded', source: 'assembly', facts: {}, words: ['chk.read.ownTip'] },
  { name: 'its own worktree with no tip recorded', source: 'released', facts: { tip: null }, words: ['chk.read.ownTree'] },
  { name: 'a scoped check and a checker handoff', source: 'released', facts: { sealId: MADE_UP_SEAL, sealKind: 'git', only: [MADE_UP_FILE, 'another-secret.ts'], needsJudgment: [{ path: MADE_UP_FILE, why: 'Made-up reason' }] }, words: ['chk.read.ownSealedTip'], scope: 2, handedOn: 1 },
  { name: 'a one-path scope and two checker handoffs', source: 'refused', facts: { only: [MADE_UP_FILE], needsJudgment: [{ path: MADE_UP_FILE, why: 'Made-up reason' }, { path: 'another-secret.ts', why: 'Another made-up reason' }] }, words: ['chk.read.ownTip'], scope: 1, handedOn: 2 },
  { name: 'an empty scope and an empty checker handoff', source: 'released', facts: { only: [], needsJudgment: [] }, words: ['chk.read.ownTip'], scope: 0, handedOn: 0 },
]

const asPerson: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function post(path: string, body: unknown, headers = asPerson): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** A made-up assembly, with or without a base. */
function wouldRead(base: boolean): Record<string, unknown> {
  return {
    at: '2026-09-30T10:00:00.000Z',
    inside: ['work/the-lamp.ts'],
    outside: [],
    chaptersAt: [],
    ...(base ? { base: { ref: MADE_UP_REF, how: 'fork point', says: MADE_UP_SAYS } } : {}),
  }
}

/** Answer the page's read of each run with the real reply and a made-up assembly on it. */
async function answerWithAMadeUpAssembly(): Promise<void> {
  for (const [run, base, checkout] of [[withABase, true, false], [withNoBase, false, false], [withNoDirectory, true, true]] as const) {
    await app.context.route(`**/api/records/${run}`, async (route) => {
      const real = await route.fetch()
      const body = (await real.json()) as { record: { data: Record<string, unknown> } }
      body.record.data['whatTheCheckWouldRead'] = wouldRead(base)
      // A CHECKOUT WITH NO WORKING DIRECTORY, so the panel draws that none was recorded.
      if (checkout) body.record.data['theCheck'] = { askedAt: '2026-09-30T10:00:00.000Z', askedOf: 'made-up-inspector', checkout: {} }
      await route.fulfill({ response: real, json: body })
    })
  }
  // A CHECK ASKED WITH A WORKING DIRECTORY AND AN OFFICE RUN, so developer mode draws their paths, and an assembly
  // that names the worktree a check would read. The assembly's own sentence holds none of the paths.
  await app.context.route(`**/api/records/${withADirectory}`, async (route) => {
    const real = await route.fetch()
    const body = (await real.json()) as { record: { data: Record<string, unknown> } }
    body.record.data['whatTheCheckWouldRead'] = {
      ...wouldRead(true),
      read: { worktree: MADE_UP_CHECK_TREE, tip: MADE_UP_TIP, ofItsOwn: true, says: 'Made up for this test: the check would read the work.' },
    }
    body.record.data['theCheck'] = {
      askedAt: '2026-09-30T10:00:00.000Z',
      askedOf: 'made-up-inspector',
      checkout: { directory: MADE_UP_WORK_FOLDER, cutFrom: MADE_UP_REF },
      execution: { session: MADE_UP_OFFICE_RUN, log: MADE_UP_LOG, model: 'made-up-model', minutes: 3 },
    }
    await route.fulfill({ response: real, json: body })
  })
}

/**
 * ONE PAGE FOR EACH LANGUAGE AND MODE, LOADED ONCE. The language and the mode are read from the address when a page
 * loads (src/web/lib/language.ts, src/web/lib/mode.ts), so a page holds one of each. Every later open of a run on it
 * changes only the part of the address after the `#`, as a press on a link does. This file used to load and reload a
 * page for each of its 96 opens (wave 13t round 31).
 */
const pages = new Map<string, Page>()

async function open(run: string, lang: 'en' | 'zh', mode: 'normal' | 'inspect'): Promise<void> {
  const loaded = pages.get(`${lang} ${mode}`)
  page = loaded ?? (await app.context.newPage())
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'light' })
  if (loaded === undefined) {
    pages.set(`${lang} ${mode}`, page)
    await page.goto(`${app.site}/?lang=${lang}&mode=${mode}#/r/${run}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.reload({ timeout: 60_000 })
  } else {
    await page.evaluate((hash) => { window.location.hash = hash }, `#/r/${run}`)
  }
  await waitForThePage(page, 60_000)
  await page.locator('#main h1', { hasText: titles.get(run) }).waitFor({ timeout: 30_000 })
  await page.locator('.chk').waitFor({ timeout: 30_000 })
}

/** Each code row in this place: its label, the text of its code element, and the state word after it. */
async function theCodeRows(place: Locator): Promise<{ label: string; value: string; state: string | null }[]> {
  return place.evaluate((holder) =>
    [...holder.querySelectorAll('dl.code-rows dt')].map((term) => ({
      label: term.textContent ?? '',
      value: term.nextElementSibling?.querySelector('code')?.textContent ?? '',
      state: term.nextElementSibling?.querySelector('.code-rows-state')?.textContent ?? null,
    })),
  )
}

/** The headings and the whole text of the check panel. */
async function thePanel(): Promise<{ parts: string[]; text: string }> {
  return page.evaluate(() => ({
    parts: [...document.querySelectorAll('.chk .chk-h')].map((one) => (one.textContent ?? '').trim()),
    text: document.querySelector('.chk')?.textContent ?? '',
  }))
}

beforeAll(async () => {
  app = await liveApp({ name: 'check-base-developer-only', viewport: { width: 1440, height: 900 } })
  await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  await post(
    '/api/agents/started',
    { handle: 'lamp-worker', name: 'lamp-worker', runtime: 'claude-code', role: 'worker', chapters: ['5:full'], workArea: ['work'] },
    asAgent(THE_TEST_OFFICES_SECRETARY.handle),
  )
  for (const title of ['A made-up run with a base', 'A made-up run with no base', 'A made-up run with no working directory', 'A made-up run with a working directory']) {
    const made = (await post(
      '/api/records',
      { kind: 'session', title, data: { state: 'running', servingAgent: 'lamp-worker', doing: 'mending the lamp' } },
      asAgent('lamp-worker'),
    ))['record'] as { id: string }
    titles.set(made.id, title)
    if (title.endsWith('with a base')) withABase = made.id
    else if (title.endsWith('with no base')) withNoBase = made.id
    else if (title.endsWith('with no working directory')) withNoDirectory = made.id
    else withADirectory = made.id
  }
  await answerWithAMadeUpAssembly()
  for (const reading of readings) {
    const made = (await post('/api/records', {
      kind: 'session', title: `A made-up reading: ${reading.name}`,
      data: { state: 'running', servingAgent: 'lamp-worker', doing: 'mending the lamp' },
    }, asAgent('lamp-worker')))['record'] as { id: string }
    reading.run = made.id
    titles.set(made.id, `A made-up reading: ${reading.name}`)
    await app.context.route(`**/api/records/${made.id}`, async (route) => {
      const real = await route.fetch()
      const body = (await real.json()) as { record: { data: Record<string, unknown> } }
      const data = body.record.data
      const read: WhatWasRead = { worktree: MADE_UP_TREE, tip: MADE_UP_TIP, ofItsOwn: true, says: FULL_READING, ...reading.facts }
      // The tool omits a missing tip rather than sending null.
      if (read.tip === undefined) delete read.tip
      const act = { by: { kind: 'agent', id: 'made-up-checker' }, at: '2026-09-30 10:00:00', read }
      if (reading.source === 'assembly') data['whatTheCheckWouldRead'] = { read }
      else if (reading.source === 'confirmed') {
        data['theCheck'] = { reviewLevel: 'none' }
        data['confirmed'] = { ...act, because: 'Made up: accepted the sealed work.' }
      } else if (reading.source === 'released') data['released'] = { ...act, how: 'an inspector' }
      else data['refused'] = { ...act, missing: ['A made-up omission'], says: { chapter: 5 } }
      await route.fulfill({ response: real, json: body })
    })
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang)
  const heading = words.t('chk.whatItWouldRead')
  const filesLine = words.t('chk.filesInsideRead', { n: 1 })
  const baseLine = words.t('chk.baseFound', { ref: MADE_UP_REF, how: words.t('chk.base.forkPoint') })
  const noBase = words.t('chk.noBaseNamed')
  const noDirectory = words.t('chk.noWorkingDirectoryWord')

  describe(`the check panel's base, in ${lang}`, () => {
    it('is drawn in developer mode, with the assembly\'s own sentence', async () => {
      await open(withABase, lang, 'inspect')
      const seen = await thePanel()
      expect(seen.parts).toContain(heading)
      expect(seen.text).toContain(baseLine)
      expect(seen.text).toContain(MADE_UP_SAYS)
    })

    if (lang === 'en') {
      it('is not drawn in normal mode, and the part it was in still says what the check would read', async () => {
        await open(withABase, lang, 'normal')
        const seen = await thePanel()
        expect(seen.parts).toContain(heading)
        expect(seen.text).toContain(filesLine)
        expect(seen.text).not.toContain(MADE_UP_REF)
        expect(seen.text).not.toContain(MADE_UP_SAYS)
      })

      it('says nobody named a base in developer mode only', async () => {
        await open(withNoBase, lang, 'inspect')
        expect((await thePanel()).text).toContain(noBase)
        await open(withNoBase, lang, 'normal')
        const seen = await thePanel()
        expect(seen.parts).toContain(heading)
        expect(seen.text).not.toContain(noBase)
      })

      it('draws that no working directory was recorded in developer mode only', async () => {
        await open(withNoDirectory, lang, 'inspect')
        expect((await thePanel()).text).toContain(noDirectory)
        await open(withNoDirectory, lang, 'normal')
        const seen = await thePanel()
        expect(seen.parts).toContain(words.t('chk.whoAsked'))
        expect(seen.text).not.toContain(noDirectory)
      })
    }
  })
}

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang)
  describe(`what the check read, in ${lang}`, () => {
    // ONE CHINESE READING LINE, on the reading that joins more than one translated sentence, so the
    // Chinese punctuation and joining are still read once. Every reading is read in English.
    for (const reading of readings.filter((one) => lang === 'en' || one.name === 'a one-path scope and two checker handoffs')) {
      /** adTmco_wIzln, note 52ZNPB44bOPb; USER.md invariants 2 and 5.
       * MUTATION: choose the seal kind from staged/tip again. The git-without-tip and
       * unnamed-seal cases fail in en and zh, including unnamed seals with tips or copy sources.
       * WFeYzNnhPtkh, inspector ab2Bj-DkFm7S: MUTATION: read kind before ofItsOwn.
       * The sealed git and older sealed worker-tree readings fail in both languages. */
      it(`normal mode describes ${reading.name} without paths or commits`, async () => {
        await open(reading.run!, lang, 'normal')
        const seen = await thePanel()
        const part = page.locator('.chk-part').filter({ has: page.locator('h3', { hasText: words.t(reading.source === 'confirmed' ? 'chk.whichWorkWasAccepted' : 'chk.whichTreeItRead') }) })
        const readingText = await part.locator('.chk-said').textContent()
        const sentences = reading.words.map((key) => words.t(key))
        if (reading.scope !== undefined) sentences.push(words.t('chk.read.only', { n: reading.scope }))
        if (reading.handedOn !== undefined) sentences.push(words.t('chk.read.handedOn', { n: reading.handedOn }))
        expect(readingText).toBe(sentences.join(lang === 'en' ? ' ' : ''))
        if (reading.words.includes('chk.read.sealedCodeNoTip') || reading.words.includes('chk.read.sealedWork')) {
          expect(readingText).not.toContain(words.t('chk.read.records'))
        }
        if (reading.words.includes('chk.read.sealedWork')) {
          expect(readingText).not.toContain(words.t('chk.read.sealedCode'))
          expect(readingText).not.toContain(words.t('chk.read.ownSealedTip'))
        }
        if (lang === 'zh') expect(readingText).not.toMatch(/。\s/)
        else for (const gap of readingText!.match(/\.(?=[\s\S])\s*/g) ?? []) expect(gap).toBe('. ')
        expect(seen.parts).toContain(words.t(reading.source === 'confirmed' ? 'chk.whichWorkWasAccepted' : 'chk.whichTreeItRead'))
        for (const key of reading.words) expect(seen.text).toContain(words.t(key))
        if (reading.scope !== undefined) expect(seen.text).toContain(words.t('chk.read.only', { n: reading.scope }))
        if (reading.handedOn !== undefined) expect(seen.text).toContain(words.t('chk.read.handedOn', { n: reading.handedOn }))
        if (reading.scope === undefined) expect(seen.text).not.toContain(words.t('chk.read.only', { n: 0 }))
        if (reading.handedOn === undefined) expect(seen.text).not.toContain(words.t('chk.read.handedOn', { n: 0 }))
        for (const detail of [FULL_READING, MADE_UP_TREE, MADE_UP_TIP, MADE_UP_OTHER_COMMIT, MADE_UP_FILE, 'another-secret.ts', MADE_UP_STAGE, MADE_UP_SEAL]) {
          expect(seen.text, `normal ${lang}: ${detail}`).not.toContain(detail)
        }
        expect(await part.locator('.chk-server').count()).toBe(0)
      })

      if (lang === 'en') {
        it(`developer mode keeps the full sentence for ${reading.name}`, async () => {
          await open(reading.run!, lang, 'inspect')
          const seen = await thePanel()
          expect(seen.text).toContain(FULL_READING)
          // THE WORKTREE AND THE TIP ARE ROWS OF THEIR OWN, and the sentence that held them is gone.
          const noTip = 'tip' in reading.facts && reading.facts.tip == null
          const part = page.locator('.chk-part').filter({ has: page.locator('h3', { hasText: words.t(reading.source === 'confirmed' ? 'chk.whichWorkWasAccepted' : 'chk.whichTreeItRead') }) })
          expect(await theCodeRows(part)).toEqual([
            { label: words.t('chk.row.worktree' as WordKey), value: MADE_UP_TREE, state: noTip ? words.t('chk.row.tipNotRecorded' as WordKey) : null },
            ...(noTip ? [] : [{ label: words.t('chk.row.tip' as WordKey), value: MADE_UP_TIP, state: null }]),
          ])
          expect(seen.text).not.toContain(words.t(noTip ? 'chk.worktreeNoTip' : 'chk.worktreeAtTip', { worktree: MADE_UP_TREE, tip: MADE_UP_TIP }))
        })
      }
    }
  })
}

it('the normal reading fits at 1440 and 390, in the light theme, in English', async () => {
  const shots = process.env['CHECK_READING_SHOTS']
  if (shots) mkdirSync(shots, { recursive: true })
  for (const lang of ['en'] as const) {
    for (const reading of readings.filter((one) => one.scope === 2 || ['sealed code with no tip recorded', 'the sealed record revisions', 'the sealed record revisions of a seal made before links were pinned', 'the sealed record revisions whose record does not say', 'sealed work with no kind or tip recorded', 'sealed code in the worker’s worktree', 'an older sealed release in the worker’s worktree'].includes(one.name))) {
      await open(reading.run!, lang, 'normal')
      {
        const theme = 'light' as const
        await page.emulateMedia({ colorScheme: theme })
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 })
          expect(await page.locator('.chk').evaluate((panel) => panel.scrollWidth > panel.clientWidth), `${lang}/${theme}/${width}`).toBe(false)
          if (shots) await page.locator('.chk').screenshot({ path: join(shots, `${reading.words[0]}-${lang}-${theme}-${width}.png`) })
        }
      }
    }
  }
})

/**
 * IN DEVELOPER MODE THE PATHS OF WHO WAS ASKED AND OF WHAT THE CHECK WOULD READ ARE ROWS OF THEIR OWN. The office
 * run's log, the work's folder and the worktree a check would read each sat in a sentence: "Its log is …", "The work is
 * in …, cut from …" and "Worktree: …". Those sentences go, and each path, with the office run and where the work was
 * cut from, is a labelled row in the office's code style.
 */
describe('developer mode draws the paths of who was asked and of what the check would read as rows', () => {
  const words = createI18n('en')

  it('draws the office run, its log, the work folder, where it was cut from and the worktree as rows, and no sentence holds a path', async () => {
    await open(withADirectory, 'en', 'inspect')
    const rows = await theCodeRows(page.locator('.chk'))
    for (const row of [
      { label: words.t('chk.row.officeRun' as WordKey), value: MADE_UP_OFFICE_RUN, state: null },
      { label: words.t('chk.row.log' as WordKey), value: MADE_UP_LOG, state: null },
      { label: words.t('chk.row.workFolder' as WordKey), value: MADE_UP_WORK_FOLDER, state: null },
      { label: words.t('chk.row.cutFrom' as WordKey), value: MADE_UP_REF, state: null },
      { label: words.t('chk.row.worktree' as WordKey), value: MADE_UP_CHECK_TREE, state: null },
    ]) expect(rows, `no row ${row.label}`).toContainEqual(row)
    for (const said of await page.locator('.chk p').allTextContents()) {
      for (const path of [MADE_UP_LOG, MADE_UP_WORK_FOLDER, MADE_UP_CHECK_TREE]) expect(said, 'a sentence holds a path').not.toContain(path)
    }
  })

  it('draws none of these rows in normal mode', async () => {
    await open(withADirectory, 'en', 'normal')
    const rows = await theCodeRows(page.locator('.chk'))
    for (const path of [MADE_UP_OFFICE_RUN, MADE_UP_LOG, MADE_UP_WORK_FOLDER, MADE_UP_CHECK_TREE]) {
      expect(rows.map((row) => row.value), `normal mode draws ${path}`).not.toContain(path)
    }
  })
})
