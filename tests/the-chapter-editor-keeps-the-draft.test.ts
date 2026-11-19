// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { ChapterContent, SelectedChapter } from '../src/shared/chapter-edit.ts'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'

let browser: Browser, page: Page
const errors: string[] = []
const chapter: ChapterContent = { label: 'Workshop care', title: 'Care for the workshop', conclusion: 'Leave the room ready.', zh: { label: '车间照料', title: '照料车间', conclusion: '保持整洁。' }, rules: [{ id: 'r-1', heading: 'Close the window', text: 'Close it before leaving.', zh: { heading: '关窗', text: '离开前关窗。' } }] }
const selected: SelectedChapter = { n: 1, inUse: 'stored', record: 'made-up-chapter', version: 'version-one', revision: 1, chapter, stored: chapter, shipped: chapter, notUsed: null, chineseWaiting: [] }
beforeAll(async () => {
  const bundle = await bundlePageCode({ stdin: { sourcefile: 'chapter-draft-browser.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `
    import './tests/a-page-of-a-test-office.ts';
    import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
    import { api, ApiError, setActor } from './src/web/api.ts';
    import { setWordLanguage } from './src/shared/i18n.ts';
    import { readLanguage } from './src/web/lib/language.ts';
    import { TheRegulations, REGULATIONS_CSS } from './src/web/pages/RegulationsPage.tsx';
    import { UI_CSS } from './src/web/components/ui.tsx';
    const root=createRoot(document.getElementById('test')); let serial=0;
    window.calls=[]; window.fail=''; window.problems=[];
    api.participants=async()=>({people:[{id:'made-up-reader',language:window.language??'en'}]});
    api.previewChapter=async(n,chapter,keep)=>{window.calls.push({kind:'preview',n,chapter,keep});return {problems:window.problems,ownWords:{was:${JSON.stringify(chapter)},becomes:chapter},changes:[{rule:'r-1',was:${JSON.stringify(chapter.rules[0])},becomes:chapter.rules[0]??null}],rulesFile:window.rulesFile??{bytes:2300,most:32768}}};
    api.previewRestoreChapter=async(n,from,keep)=>{window.calls.push({kind:'restore-preview',n,from,keep});return {problems:[],ownWords:null,changes:[],rulesFile:window.rulesFile??{bytes:2300,most:32768}}};
    api.applyChapter=async(edit)=>{window.calls.push({kind:'apply',...edit});if(window.fail)throw new ApiError(window.fail==='conflict'?409:400,window.fail==='conflict'?'The version changed. Nothing was changed.':'A required rule is missing. Nothing was changed.');return {...window.selected,written:true,chineseDropped:[]}};
    api.restoreChapter=async(edit)=>{window.calls.push({kind:'restore',...edit});return {...window.selected,written:true,chineseDropped:['r-1','chapter']}};
    api.officeChapters=async()=>({chapters:[{...window.selected,version:'version-two'}],says:''});
    api.chapterHistory=async()=>({record:'made-up-chapter',versions:[{seq:7,at:'2026-10-14 09:00:00',by:{type:'human',id:'made-up-caretaker'},because:'A made-up change.',before:null,after:${JSON.stringify(chapter)}}],next:null});
    window.draw=async(selected,actor='human',language='en')=>{window.selected=selected;window.language=language;setActor({type:actor,id:'made-up-reader'});await readLanguage(true);setWordLanguage(language);flushSync(()=>root.render(<><style>{REGULATIONS_CSS+UI_CSS}</style><TheRegulations key={++serial} selected={{chapters:[selected],says:''}} said={{says:'',regulations:[],copiedFromTheDefaults:null,chapters:[{n:1,id:'made-up-chapter',...${JSON.stringify(chapter)},context:'',source:'',zh:{label:'车间照料',title:'照料车间',conclusion:'保持整洁。'},outline:[{id:'r-1',name:'Close the window',text:'Close it before leaving.',zh:{name:'关窗',text:'离开前关窗。'},onlyThisOffice:null}]}]}} /></>))};
  ` }, bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"test"' } })
  browser = await chromium.launch(); page = await browser.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://chapter.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="test"></div></body></html>' }))
  await page.goto('http://chapter.test/')
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') })
  await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0]!.text })
  await page.waitForFunction(() => typeof (window as any).draw === 'function')
  expect(errors).toEqual([])
})
afterAll(async () => { await browser?.close() })
async function draw(one = selected, actor = 'human', language = 'en') {
  await page.evaluate(({ one, actor, language }) => (window as any).draw(one, actor, language), { one, actor, language })
  if (actor === 'human') await page.locator('.ofc-mode button').click()
}
async function press(name: string) { await page.getByRole('button', { name, exact: true }).click(); expect(errors).toEqual([]) }
async function value(name: string, text: string) { await page.getByLabel(name, { exact: true }).fill(text) }
async function calls() { return page.evaluate(() => (window as any).calls) }
/**
 * Every text an element draws, piece by piece, leaving out what a box holds: a sentence drawn beside a part is one piece
 * more. It reads a copy with its neighbouring texts joined, so `1.1` is one piece and the page itself is not touched.
 */
async function piecesOf(where: Locator): Promise<string[]> {
  return where.evaluate(element => {
    const copy = element.cloneNode(true)
    copy.normalize()
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT)
    const pieces: string[] = []
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const piece = node.textContent?.trim() ?? ''
      if (piece !== '' && node.parentElement?.closest('textarea') === null) pieces.push(piece)
    }
    return pieces
  })
}
/** The label a box is written in, as a locator. */
const labelOf = (box: Locator): Locator => box.locator('xpath=ancestor::label[1]')

it('keeps typed words through refusals and conflicts, requires fresh preview and a record choice, and draws a part whose Chinese waits in its English alone', async () => {
  await draw()
  await press('Edit chapter')
  await value('English text for r-1', 'Made-up new English.')
  await value('Chinese text for r-1', '浏览器中的新规则。')
  await value('Chinese label', '车间规则')
  await press('Add a rule')
  expect(await page.getByLabel('English heading for r-2', { exact: true }).count()).toBe(1)
  expect(await page.getByLabel('Chinese heading for r-2', { exact: true }).inputValue()).toBe('')
  await press('Remove rule r-2')
  await page.evaluate(() => { (window as any).problems = ['The chapter needs a rule.'] })
  await press('Preview chapter')
  expect(await page.locator('[data-chapter-preview]').innerText()).toContain('The chapter needs a rule.')
  expect(await page.getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  await page.evaluate(() => { (window as any).problems = [] })
  await press('Preview chapter')
  expect(await page.locator('[data-chapter-preview]').innerText()).toContain('2300 bytes of the 32768 byte limit')
  expect(await page.locator('[data-chapter-preview]').innerText()).toContain('Close it before leaving.')
  expect(await page.locator('[data-chapter-preview]').innerText()).toContain('Made-up new English.')
  expect(await page.locator('[data-chapter-preview]').innerText()).toContain('浏览器中的新规则。')
  expect(await page.locator('[data-chapter-preview]').innerText()).toContain('车间规则')
  expect(await page.getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  await value('Why change this chapter?', 'Made-up reason.')
  await value('English text for r-1', 'Words retained after a refusal.')
  expect(await page.locator('[data-chapter-preview]').count()).toBe(0)
  expect(await page.getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  await press('Preview chapter')
  await page.evaluate(() => { (window as any).fail = 'refusal' })
  await press('Apply chapter')
  await page.getByText('A required rule is missing. Nothing was changed.', { exact: true }).waitFor()
  expect(await page.getByLabel('English text for r-1', { exact: true }).inputValue()).toBe('Words retained after a refusal.')
  await page.evaluate(() => { (window as any).fail = 'conflict' })
  await press('Apply chapter')
  await page.getByText('This chapter changed after you read it. Read it again before applying your words.', { exact: true }).waitFor()
  await press('Read chapter again')
  expect(await page.getByLabel('English text for r-1', { exact: true }).inputValue()).toBe('Words retained after a refusal.')
  expect(await page.getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  expect(await page.getByRole('status').innerText()).toContain('Your words are kept here')
  await page.evaluate(() => { (window as any).fail = '' })
  await press('Preview chapter')
  expect(await page.getByRole('status').count()).toBe(0)
  await press('Apply chapter')
  expect((await calls()).filter((call: any) => call.kind === 'apply').at(-1)).toMatchObject({ version: 'version-two', because: 'Made-up reason.', chapter: { rules: [{ text: 'Words retained after a refusal.' }] } })

  await draw(); await press('Edit chapter'); await press('Preview chapter'); await value('Why change this chapter?', 'Read and cancel this draft.')
  await page.evaluate(() => { (window as any).fail = 'conflict' })
  await press('Apply chapter'); await press('Read chapter again'); await press('Cancel chapter edit')
  expect(await page.locator('[data-chapter-form]').count()).toBe(0)
  expect(await page.getByRole('status').count()).toBe(0)
  await page.evaluate(() => { (window as any).fail = '' })

  await draw({ ...selected, inUse: 'shipped', stored: { ...chapter, rules: [] }, notUsed: { records: ['made-up-chapter'], problems: ['The chapter has no rules.'] } })
  await press('Edit chapter'); await press('Add a rule')
  expect(await page.getByLabel('English heading for r-1', { exact: true }).count()).toBe(1)

  const duplicate: SelectedChapter = { ...selected, inUse: 'shipped', notUsed: { records: ['made-up-chapter', 'second-record'], problems: ['Two records hold chapter 1.'] } }
  await draw(duplicate)
  expect(await page.getByRole('alert').innerText()).toContain('The office is reading the shipped chapter.')
  expect(await page.getByRole('alert').getByRole('link', { name: 'second-record' }).getAttribute('href')).toContain('second-record')
  await press('Edit chapter'); await value('Why change this chapter?', 'Keep this record.')
  expect(await page.getByRole('button', { name: 'Preview chapter', exact: true }).isDisabled()).toBe(true)
  expect(await page.getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  await page.getByLabel('Which record should keep this chapter?', { exact: true }).selectOption('second-record')
  expect(await page.getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  await press('Preview chapter')
  expect((await calls()).filter((call: any) => call.kind === 'preview').at(-1).keep).toBe('second-record')
  await page.getByLabel('Which record should keep this chapter?', { exact: true }).selectOption('made-up-chapter')
  expect(await page.locator('[data-chapter-preview]').count()).toBe(0)
  await page.getByLabel('Which record should keep this chapter?', { exact: true }).selectOption('second-record')
  await press('Preview chapter')
  await press('Apply chapter')
  expect((await calls()).filter((call: any) => call.kind === 'apply').at(-1).keep).toBe('second-record')
  await press('Chapter history')
  await page.locator('[data-chapter-history] article').waitFor()
  expect(await page.locator('[data-chapter-history]').innerText()).toContain('made-up-caretaker')
  expect(await page.locator('[data-chapter-history]').getByRole('link', { name: 'made-up-chapter', exact: true }).getAttribute('href')).toContain('made-up-chapter')
  await press('Restore version 7'); await value('Why change this chapter?', 'Restore this record.')
  expect(await page.getByRole('button', { name: 'Restore chapter', exact: true }).isDisabled()).toBe(true)
  await page.getByLabel('Which record should keep this chapter?', { exact: true }).selectOption('made-up-chapter')
  await press('Preview chapter')
  expect((await calls()).filter((call: any) => call.kind === 'restore-preview').at(-1)).toMatchObject({ from: 7, keep: 'made-up-chapter' })
  await press('Restore chapter')
  expect((await calls()).filter((call: any) => call.kind === 'restore').at(-1)).toMatchObject({ from: 7, keep: 'made-up-chapter' })
  const dropped = page.getByRole('status').filter({ hasText: 'The Chinese for these parts was removed' })
  expect(await dropped.innerText()).toContain('Close the window')
  expect(await dropped.innerText()).toContain('The chapter’s label, title and conclusion')
  await draw(duplicate, 'agent')
  expect(await page.getByRole('alert').innerText()).toContain('Two records hold chapter 1.')
  expect(await page.getByRole('button', { name: /Edit|Restore/ }).count()).toBe(0)
  await draw({ ...selected, inUse: 'none', record: null, version: null, chapter: null, stored: null })
  expect(await page.getByRole('alert').innerText()).toContain('The office holds no such chapter.')
  await press('File the shipped chapter'); await press('Preview chapter'); await value('Why change this chapter?', 'File the missing chapter.'); await press('Restore chapter')
  expect((await calls()).filter((call: any) => call.kind === 'restore').at(-1)).toMatchObject({ version: null, from: 'shipped' })
  await draw({ ...selected, chineseWaiting: ['r-1'] }, 'human', 'zh')
  expect(await page.locator('.ofc-rule').innerText()).toContain('Close it before leaving.')
  expect(await piecesOf(page.locator('.ofc-rule'))).toEqual(['1.1', 'Close the window', 'Close it before leaving.', createI18n('zh').t('regulationsPage.keepForThisOffice')])
  expect(await page.locator('.ofc-rule').innerText()).not.toContain('离开前关窗。')
  await draw({ ...selected, stored: { ...chapter, rules: [{ ...chapter.rules[0]!, zh: null }] }, chineseWaiting: ['r-1'] })
  await press('Edit chapter')
  expect(await page.getByLabel('Chinese text for r-1', { exact: true }).inputValue()).toBe('')
  for (const name of ['Chinese heading for r-1', 'Chinese text for r-1']) expect(await piecesOf(labelOf(page.getByLabel(name, { exact: true }))), name).toEqual([name])
}, 60_000)

/**
 * A PART WITH NO CHINESE, ON A CHINESE PAGE, IS ITS ENGLISH AND NOTHING MORE: on the page, in the edit form and in the
 * preview of a change. Each place is read piece by piece, so a sentence drawn beside the English, or beside an empty
 * Chinese box, is one piece too many, and so is the preview's Chinese label over no Chinese. The empty box and its
 * label still show the part has no Chinese.
 */
it('on a Chinese page draws a part with no Chinese in its English alone, on the page, in the form and in the preview', async () => {
  const zh = createI18n('zh').t
  const english: ChapterContent = { ...chapter, zh: null, rules: [{ ...chapter.rules[0]!, zh: null }] }
  await draw({ ...selected, chapter: english, stored: english, chineseWaiting: ['chapter', 'r-1'] }, 'human', 'zh')
  expect(await piecesOf(page.locator('.ofc-ch-name'))).toEqual(['1', 'Workshop care'])
  expect(await page.locator('section.ofc-ch').evaluate(section => [...section.children].filter(child => !child.matches('.ce, ol')).map(child => (child as HTMLElement).innerText))).toEqual(['Leave the room ready.'])
  expect(await piecesOf(page.locator('.ofc-rule'))).toEqual(['1.1', 'Close the window', 'Close it before leaving.', zh('regulationsPage.keepForThisOffice')])

  await press(zh('chapterEdit.edit'))
  const parts = [['label', english.label], ['title', english.title], ['conclusion', english.conclusion], ['heading', english.rules[0]!.heading], ['text', english.rules[0]!.text]] as const
  for (const [key, words] of parts) {
    const values = key === 'heading' || key === 'text' ? { id: 'r-1' } : undefined
    expect(await page.getByLabel(zh(`chapterEdit.english.${key}` as WordKey, values), { exact: true }).inputValue(), key).toBe(words)
    const name = zh(`chapterEdit.chinese.${key}` as WordKey, values)
    const box = page.getByLabel(name, { exact: true })
    expect(await box.inputValue(), name).toBe('')
    expect(await piecesOf(labelOf(box)), name).toEqual([name])
  }

  await press(zh('chapterEdit.preview'))
  const comparisons = page.locator('[data-chapter-preview] .ce-comparison')
  expect(await comparisons.count()).toBe(4)
  const becomes = [[english.label], [english.title], [english.conclusion], [english.rules[0]!.heading, english.rules[0]!.text]]
  for (const [i, words] of becomes.entries()) {
    expect(await piecesOf(comparisons.nth(i).locator('xpath=./div[2]')), words.join(' ')).toEqual([zh('chapterEdit.becomes'), ...words])
  }
  expect(errors).toEqual([])
}, 60_000)


it('draws an unmeasured rules file in both languages without inventing a size', async () => {
  await page.evaluate(() => { (window as any).rulesFile = { notMeasured: 'The source file is not installed here.' } })
  for (const language of ['en', 'zh']) {
    await draw(selected, 'human', language)
    expect(await page.getByRole('button', { name: language === 'en' ? 'Edit chapter' : '编辑章节', exact: true }).count(), await page.locator('body').innerText()).toBe(1)
    await press(language === 'en' ? 'Edit chapter' : '编辑章节')
    expect(await page.getByRole('button', { name: language === 'en' ? 'Preview chapter' : '预览章节', exact: true }).count(), await page.locator('body').innerText()).toBe(1)
    await press(language === 'en' ? 'Preview chapter' : '预览章节')
    const preview = await page.locator('[data-chapter-preview]').innerText()
    expect(preview).toContain(language === 'en' ? 'The rules file’s size could not be measured here.' : '此处无法测量规则文件的大小。')
    expect(preview).not.toMatch(/bytes|字节|32768|2300/)
  }
  await page.evaluate(() => { delete (window as any).rulesFile })
})
