// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { ChapterContent, SelectedChapter, TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'

let browser: Browser, page: Page
const errors: string[] = []
const word = (key: string) => createI18n('en').t(key as WordKey)
const chapter: ChapterContent = {
  label: 'Made-up harbour rules', title: 'Care of a made-up harbour', conclusion: 'Keep the landing clear.', zh: null,
  rules: [
    { id: 'r-1', heading: 'Close the gate', text: 'Close the gate at dusk.', zh: null },
    { id: 'r-2', heading: 'Check the rope', text: 'Check it before tying a boat.', zh: null },
  ],
}
const selected: SelectedChapter = { n: 1, inUse: 'stored', record: 'test-harbour', version: 'first-read', revision: 1, chapter, stored: chapter, shipped: chapter, notUsed: null, chineseWaiting: [] }

beforeAll(async () => {
  const bundle = await bundlePageCode({ stdin: { sourcefile: 'regulations-mode-browser.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `
    import './tests/a-page-of-a-test-office.ts';
    import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
    import { api, setActor } from './src/web/api.ts';
    import { setWordLanguage } from './src/shared/i18n.ts';
    import { TheRegulations, REGULATIONS_CSS } from './src/web/pages/RegulationsPage.tsx';
    import { UI_CSS } from './src/web/components/ui.tsx';
    const root=createRoot(document.getElementById('test')); let serial=0;
    window.calls=[];
    const mark={by:'test-caretaker',at:'2026-10-28 08:00:00'};
    function render(){flushSync(()=>root.render(<><style>{REGULATIONS_CSS+UI_CSS}</style><TheRegulations key={serial} said={window.said} selected={window.selection} onChanged={()=>{window.calls.push({kind:'reread'});render()}} /></>))}
    api.markARuleOnlyForThisOffice=async(chapter,rule,only)=>{window.calls.push({kind:'mark',chapter,rule,only});window.said.chapters[0].outline.find(one=>one.id===rule).onlyThisOffice=only?mark:null};
    api.chapterHistory=async()=>({record:'test-harbour',versions:[{seq:3,at:mark.at,by:{type:'human',id:'test-caretaker'},because:'A made-up earlier change.',before:null,after:${JSON.stringify(chapter)}}],next:null});
    api.previewChapter=async(n,chapter)=>{window.calls.push({kind:'preview',n,chapter});return {problems:[],ownWords:null,changes:[],rulesFile:{notMeasured:'Made-up source not installed.'}}};
    api.applyChapter=async(edit)=>{window.calls.push({kind:'apply',...edit});return {...window.selection.chapters[0],chapter:edit.chapter,stored:edit.chapter,version:'written-version',written:true,chineseDropped:[]}};
    window.draw=(selection,actor='human')=>{++serial;window.calls=[];window.selection=selection;setActor({type:actor,id:'test-caretaker'});setWordLanguage('en');window.said={workspaceId:'default',regulations:[],says:'',copiedFromTheDefaults:null,chapters:[{n:1,id:'test-harbour',...${JSON.stringify(chapter)},context:'',source:'',outline:${JSON.stringify(chapter.rules)}.map((rule,i)=>({id:rule.id,name:rule.heading,text:rule.text,zh:null,onlyThisOffice:i===0?mark:null}))}]};render()};
    window.refresh=()=>{window.selection={...window.selection,chapters:window.selection.chapters.map(one=>({...one,version:'later-read'}))};render()};
  ` }, bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"test"' } })
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://regulations.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main id="test"></main></body></html>' }))
  await page.goto('http://regulations.test/')
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') })
  await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0]!.text })
  await page.waitForFunction(() => typeof (window as any).draw === 'function')
})
afterAll(async () => { await browser?.close() })
async function draw(one: SelectedChapter = selected, actor = 'human', unsupported: TheSelectedChapters['unsupported'] = null) {
  await page.evaluate(({ one, actor, unsupported }) => (window as any).draw({ chapters: [one], unsupported, says: '' }, actor), { one, actor, unsupported })
}
async function press(key: string) { await page.getByRole('button', { name: word(key), exact: true }).click() }
async function value(key: string, text: string, id?: string) { await page.getByLabel(createI18n('en').t(key as WordKey, { id: id ?? '' }), { exact: true }).fill(text) }

it('reads without rule presses, edits through ChapterEditor, retains drafts and selected recovery, and fits both modes', async () => {
  await draw()
  expect(await page.locator('.ofc-rule-mark button').count()).toBe(0)
  expect(await page.locator('.ofc-rule-only').allTextContents()).toEqual([word('regulationsPage.onlyForThisOffice')])
  expect(await page.getByRole('button', { name: word('chapterEdit.edit'), exact: true }).count()).toBe(0)
  await press('chapterEdit.history')
  await page.locator('[data-chapter-history] article').waitFor()
  expect(await page.locator('[data-chapter-history] button').count()).toBe(0)
  await press('chapterEdit.closeHistory')
  await press('regulationsMode.edit')
  expect(await page.locator('.ofc-rule-mark button').count()).toBe(chapter.rules.length)
  await press('regulationsPage.keepForThisOffice')
  await page.locator('.ofc-rule').first().getByRole('button', { name: word('regulationsPage.giveToNewOffices'), exact: true }).click()
  expect(await page.evaluate(() => (window as any).calls.filter((one: any) => one.kind === 'mark'))).toEqual([
    { kind: 'mark', chapter: selected.record, rule: 'r-2', only: true },
    { kind: 'mark', chapter: selected.record, rule: 'r-1', only: false },
  ])
  await press('regulationsMode.read')
  expect(await page.locator('.ofc-rule-mark button').count()).toBe(0)
  expect(await page.locator('.ofc-rule').nth(1).locator('.ofc-rule-only').innerText()).toBe(word('regulationsPage.onlyForThisOffice'))
  await press('regulationsMode.edit')
  await press('chapterEdit.edit')
  await value('chapterEdit.english.text', 'Keep this unfinished rewording.', 'r-1')
  await press('chapterEdit.addRule')
  await value('chapterEdit.english.heading', 'A new harbour rule', 'r-3')
  await value('chapterEdit.english.text', 'Leave a clear path.', 'r-3')
  await page.getByRole('button', { name: createI18n('en').t('chapterEdit.removeRule', { id: 'r-2' }), exact: true }).click()
  await press('chapterEdit.preview')
  await page.locator('[data-chapter-preview]').waitFor()
  // The reason box is drawn once the preview has passed, so the reason is typed after it.
  await value('chapterEdit.reason', 'Explain the harbour change.')
  await press('regulationsMode.read')
  expect(await page.locator('[data-chapter-form]').isVisible()).toBe(false)
  expect(await page.getByText(word('regulationsMode.draftKept'), { exact: true }).isVisible()).toBe(true)
  expect(await page.locator('.ofc-rule-mark button').count()).toBe(0)
  await page.evaluate(() => (window as any).refresh())
  await press('regulationsMode.edit')
  expect(await page.getByLabel(createI18n('en').t('chapterEdit.english.text', { id: 'r-1' }), { exact: true }).inputValue()).toBe('Keep this unfinished rewording.')
  expect(await page.getByLabel(word('chapterEdit.reason'), { exact: true }).inputValue()).toBe('Explain the harbour change.')
  expect(await page.locator('.ce-rule').count()).toBe(2)
  expect(await page.locator('[data-chapter-preview]').isVisible()).toBe(true)
  await press('chapterEdit.apply')
  expect(await page.locator('[data-chapter-form]').count()).toBe(0)
  const applied = await page.evaluate(() => (window as any).calls.find((one: any) => one.kind === 'apply'))
  expect(applied).toMatchObject({ n: selected.n, version: selected.version, because: 'Explain the harbour change.' })
  expect(applied.chapter.rules.map((one: any) => [one.id, one.text])).toEqual([['r-1', 'Keep this unfinished rewording.'], ['r-3', 'Leave a clear path.']])

  const shipped = { ...chapter, label: 'Shipped harbour', rules: [{ ...chapter.rules[0]!, heading: 'A shipped rule', text: 'The shipped harbour words.' }] }
  await draw({ ...selected, inUse: 'shipped', chapter: shipped, shipped, notUsed: { records: ['test-harbour', 'test-duplicate'], problems: ['Two made-up records claim the chapter.'] } }, 'human', { records: ['test-unsupported'], problems: ['Unsupported made-up number.'] })
  expect(await page.locator('.ofc-rule-text').allTextContents()).toEqual(shipped.rules.map(one => one.text))
  expect(await page.locator('[data-chapter-recovery]').innerText()).toContain('Two made-up records claim the chapter.')
  expect(await page.locator('[data-unsupported-chapters] a').getAttribute('href')).toContain('test-unsupported')
  expect(await page.locator('.ofc-rule-only, .ofc-rule-mark button').count()).toBe(0)
  expect(await page.getByRole('button', { name: word('chapterEdit.restoreShipped'), exact: true }).count()).toBe(0)
  await press('regulationsMode.edit')
  expect(await page.getByRole('button', { name: word('chapterEdit.restoreShipped'), exact: true }).count()).toBe(1)
  expect(await page.locator('.ofc-rule-mark button').count()).toBe(0)
  await press('chapterEdit.edit')
  expect(await page.getByLabel(createI18n('en').t('chapterEdit.english.text', { id: 'r-1' }), { exact: true }).inputValue()).toBe(chapter.rules[0]!.text)
  await draw({ ...selected, inUse: 'none', record: null, version: null, chapter: null, stored: null })
  expect(await page.locator('.ofc-rule, .ofc-ch-open').count()).toBe(0)
  expect(await page.getByRole('button', { name: word('chapterEdit.fileShipped'), exact: true }).count()).toBe(0)
  await press('regulationsMode.edit')
  await press('chapterEdit.fileShipped')
  expect(await page.locator('[data-chapter-form]').isVisible()).toBe(true)

  await page.evaluate(() => (window as any).draw(undefined))
  expect(await page.locator('.ofc-rule-mark button').count()).toBe(0)
  await press('regulationsMode.edit')
  expect(await page.locator('.ofc-rule-mark button').count()).toBe(chapter.rules.length)
  await draw(selected, 'agent')
  expect(await page.locator('.ofc-mode button, .ofc-rule-mark button').count()).toBe(0)
  expect(await page.locator('.ofc-rule-only').count()).toBe(1)
  await press('chapterEdit.history')
  await page.locator('[data-chapter-history] article').waitFor()
  expect(await page.locator('[data-chapter-history] button').count()).toBe(0)

  const shots = process.env.REGULATIONS_MODE_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
    await draw()
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
    for (const mode of ['reading', 'editing', 'draft']) {
      if (mode === 'editing') await press('regulationsMode.edit')
      if (mode === 'draft') await press('chapterEdit.edit')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme} ${mode}`).toBe(true)
      if (shots) await page.screenshot({ path: join(shots, `${mode}-${width}-${theme}.png`), fullPage: true })
    }
  }
  expect(errors).toEqual([])
})
