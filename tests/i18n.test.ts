// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { expect, it } from 'vitest'
import { content, createI18n, LANGUAGES, WORD_LISTS } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

it('fills values, chooses each language’s plurals, counts every fallback, and marks the test words', () => {
  const reader = createI18n()
  // The page languages: English, Chinese, and the six the owner named, each in its own language.
  expect(Object.keys(LANGUAGES)).toEqual(['en', 'zh', 'el', 'es', 'it', 'ko', 'pt', 'th'])
  expect(LANGUAGES.en).toBe('English')
  expect(LANGUAGES.zh).toBe('中文')
  expect(LANGUAGES.th).toBe('ไทย')
  expect(reader.t('settings.language.person', { language: '中文' })).toBe('You chose 中文.')
  for (const n of [0, 1, 2, 1.5]) {
    expect(reader.t('tasksToTake.lead', { n })).toBe(`${n} ${n === 1 ? 'task' : 'tasks'} packaged in this project, newest first.`)
  }
  reader.setLanguage('zh')
  for (const n of [0, 1, 2, 1.5]) expect(reader.t('tasksToTake.lead', { n })).toBe(`此项目已打包 ${n} 个任务，最新的在前。`)
  expect(reader.t('settings.language.person', { language: 'English' })).toBe('你选择了 English。')
  expect(reader.check().fallbacks).toEqual([])

  const { 'tasksToTake.lead': omitted, ...withoutLead } = zh
  expect(omitted).toBeDefined()
  const missing = createI18n('zh', { ...WORD_LISTS, en, zh: withoutLead })
  expect(missing.check().missingByLanguage.zh).toEqual(['tasksToTake.lead'])
  expect(missing.t('tasksToTake.lead', { n: 1 })).toBe('1 task packaged in this project, newest first.')
  expect(missing.t('tasksToTake.lead', { n: 2 })).toBe('2 tasks packaged in this project, newest first.')
  // @ts-expect-error An undeclared key must remain a type error, even though runtime data can be bad.
  expect(missing.t('missing.from.both')).toBe('⟦missing.from.both⟧')
  expect(missing.check().fallbacks).toEqual([
    { key: 'tasksToTake.lead', count: 2 }, { key: 'missing.from.both', count: 1 },
  ])
  missing.setLanguage('en')
  expect(missing.check().fallbacks[0]?.count).toBe(2)

  reader.setLanguage('xx')
  const english = '2 tasks packaged in this project, newest first.'
  expect(reader.t('tasksToTake.lead', { n: 2 })).toBe(`⟦${english}${'·'.repeat(Math.ceil(english.length * 0.4))}⟧`)
  // @ts-expect-error Test words use the same typed keys and the same visible absence.
  expect(reader.t('missing.from.both')).toBe('⟦missing.from.both⟧')
  expect(reader.check().fallbacks).toEqual([{ key: 'missing.from.both', count: 1 }])
  expect(content('这段是记录内容 · A record title')).toBe('这段是记录内容 · A record title')
})

/**
 * A NODE PROCESS THAT SAYS WHICH LANGUAGES' CORE FILES IT LOADED, before and after it reads a Thai word. It is handed
 * the source's i18n.ts and a bundle of it. Its hook sees a file loaded by import and by require alike.
 */
const SAYS_WHAT_IT_LOADED = String.raw`
import { registerHooks } from 'node:module'
const loaded = []
registerHooks({
  load(url, context, nextLoad) {
    const core = /\/src\/shared\/words\/([a-z]{2})\.ts$/.exec(url)
    if (core !== null) loaded.push(core[1])
    return nextLoad(url, context)
  },
})
const [source, bundle] = process.argv.slice(1)
const { createI18n, sayInEnglish } = await import(source)
const english = sayInEnglish('settings.language.person', { language: 'X' })
const before = [...loaded].sort()
const thai = createI18n('th').t('settings.language.person', { language: 'X' })
const after = [...loaded].sort()
const bundled = (await import(bundle)).createI18n('th').t('settings.language.person', { language: 'X' })
console.log(JSON.stringify({ english, before, thai, after, bundled }))
`

it('loads a later language’s words in Node only when one is first read, from the source and from a bundle of it', async () => {
  const folder = aTestDatabaseFolder('later-words')
  try {
    // One file for Node, as scripts/bundle.mjs bundles the installed office's server, with no word file beside it.
    const bundle = join(folder, 'server.mjs')
    await build({
      stdin: { contents: "export { createI18n } from './src/shared/i18n.ts'", resolveDir: REPO, loader: 'ts' },
      bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: bundle, logLevel: 'silent',
    })
    // The child is given PATH and nothing else, so no office variable is set in it.
    const source = pathToFileURL(join(REPO, 'src/shared/i18n.ts')).href
    const ran = spawnSync(process.execPath, ['--input-type=module', '-e', SAYS_WHAT_IT_LOADED, '--', source, pathToFileURL(bundle).href], {
      env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 60_000,
    })
    expect(ran.status, ran.stderr).toBe(0)
    const said = JSON.parse(ran.stdout) as { english: string; before: string[]; thai: string; after: string[]; bundled: string }
    // Reading English loads English and Chinese only. Reading Thai then loads Thai, and no other.
    expect(said.before).toEqual(['en', 'zh'])
    expect(said.after).toEqual(['en', 'th', 'zh'])
    const thai = createI18n('th').t('settings.language.person', { language: 'X' })
    expect(thai).not.toBe(said.english)
    expect(said).toMatchObject({ thai, bundled: thai })
  } finally {
    removeThisTestFolder(folder)
  }
})
