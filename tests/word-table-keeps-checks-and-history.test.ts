// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { WordKey } from '../src/shared/i18n.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
let db: TestDb, app: FastifyInstance
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app.close(); db.close() })
/**
 * THE WORD TABLE IS ONE TABLE FOR THE WHOLE OFFICE, AND EVERY CASE HERE EDITS IT. A case starts with
 * no saved word, as a fresh office does, and puts the table back after itself: the saved choices, the
 * change rows the history is read from, and the reader's own copy of the words.
 */
afterEach(async () => {
  db.client.sqlite.prepare("DELETE FROM runtime_settings WHERE name LIKE 'office.word:%'").run()
  db.client.sqlite.prepare("DELETE FROM changes WHERE record_id LIKE 'setting:word:%'").run()
  ;(await import('../src/server/lib/word-settings.ts')).loadSavedWords()
})
async function read(key: string) { const r = await app.inject({ url: '/api/words/table?key=' + encodeURIComponent(key) }); expect(r.statusCode, r.body).toBe(200); return r.json().words[0] }
async function save(key: string, en: unknown, extra = {}) { const row = await read(key); return app.inject({ method: 'POST', url: '/api/words/table', headers, payload: { key, version: row.version, en, zh: row.zh, chineseMatchesEnglish: false, because: 'Made-up word choice', ...extra } }) }
async function restore(key: string, from: string) { const row = await read(key); return app.inject({ method: 'POST', url: '/api/words/restore', headers, payload: { key, version: row.version, from, because: 'Made-up restoration' } }) }

it('a saved edit reaches base, per-wave, legacy, plural, shared vocabulary, server sentences and coded refusals without a build', async () => {
  const words = await import('../src/shared/i18n.ts'), shared = await import('../src/shared/words.ts'), saying = await import('../src/shared/dev-sayings.ts')
  for (const key of ['settings.language.choose', 'noticeRules.title', 'pageWords.SourcePage.001', 'kind.task', 'devWords.said.profileWorldNamedByOffice', 'settingsWords.MOLE_OFFICE_MESSAGE_WORKER', 'noticeWords.memberAdded']) {
    const row = await read(key)
    expect(typeof row.en).toBe('string')
    expect((await save(key, 'Made-up edited: ' + row.en)).statusCode).toBe(200)
    expect(words.sayInEnglish(key as WordKey, { at: 'Made-up time' })).toMatch(/^Made-up edited:/)
  }
  expect(shared.kindWord('task').text).toBe('Made-up edited: task')
  expect(saying.inEnglish({ code: 'profileWorldNamedByOffice', values: { at: 'Made-up time' } })).toMatch(/^Made-up edited:/)
  const notice = await import('../src/server/lib/notices.ts')
  expect(notice.NOTICES.memberAdded.because).toMatch(/^Made-up edited:/)
  const runtime = (await app.inject({ url: '/api/office/settings' })).json().settings
  expect(runtime.find((r: { name: string }) => r.name === 'MOLE_OFFICE_MESSAGE_WORKER').what).toMatch(/^Made-up edited:/)
  expect((await save('settingsWords.MOLE_OFFICE_BUS_MOST_ENTRIES', 'Made-up bus: {fewest} to {most}, shipped {shipped}.')).statusCode).toBe(200)
  const described = (await app.inject({ url: '/api/office/settings' })).json().settings.find((r: { name: string }) => r.name === 'MOLE_OFFICE_BUS_MOST_ENTRIES')
  expect(described.what).toBe('Made-up bus: 1 to 64, shipped 8.')
  const plural = await read('settings.words.total')
  expect((await save(plural.key, { one: 'Made-up {n} word', other: 'Made-up {n} words' })).statusCode).toBe(200)
  expect(words.sayInEnglish(plural.key, { n: 1 })).toBe('Made-up 1 word')
  expect(words.sayInEnglish(plural.key, { n: 4 })).toBe('Made-up 4 words')
  expect((await save('server.recordNotFound', 'Made-up missing record reply.')).statusCode).toBe(200)
  const refused = await app.inject({ url: '/api/records/made-up-missing-record', headers })
  expect(refused.statusCode).toBe(404)
  expect(refused.json()).toMatchObject({ code: 'recordNotFound', error: 'Made-up missing record reply.' })
  // A fresh load from the stored table, without a new build, feeds the same reader.
  const settings = await import('../src/shared/word-settings.ts'), server = await import('../src/server/lib/word-settings.ts')
  settings.installSavedWords({}); expect(words.sayInEnglish('kind.task')).toBe('task')
  server.loadSavedWords(); expect(shared.kindWord('task').text).toBe('Made-up edited: task')
})

it('bad substitutions, plural forms and stale versions leave both choices and audit unchanged', async () => {
  const before = () => JSON.stringify({ choices: db.client.sqlite.prepare('SELECT * FROM runtime_settings ORDER BY name').all(), audit: db.client.sqlite.prepare("SELECT * FROM changes WHERE record_id LIKE 'setting:word:%'").all() })
  const initial = before()
  for (const [key, value] of [['settings.language.person', 'Missing the name.'], ['settings.language.person', 'Wrong {who}.'], ['settings.words.total', { one: '{n} alone' }], ['settings.words.total', { one: '{n} one', other: '{who} others' }], ['settingsWords.MOLE_OFFICE_BUS_MOST_ENTRIES', 'Made-up limit without its numbers.']]) {
    const reply = await save(key as string, value)
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json()).toMatchObject({ code: 'wordSettingRefused' })
    expect(before()).toBe(initial)
  }
  const stale = await read('noticeRules.title')
  expect((await save(stale.key, 'Made-up changed notice words')).statusCode).toBe(200)
  const stored = before()
  const refused = await app.inject({ method: 'POST', url: '/api/words/table', headers, payload: { key: stale.key, version: stale.version, en: 'Made-up stale words', zh: stale.zh, chineseMatchesEnglish: false, because: 'Made-up stale press' } })
  expect(refused.statusCode).toBe(409); expect(before()).toBe(stored)
})

it('keeps shipped sources and full history, restores an earlier choice, and marks a translation whose English changed', async () => {
  const key = 'settings.language.choose', first = await read(key)
  expect((await save(key, 'Made-up first language label')).statusCode).toBe(200)
  const changed = await read(key)
  expect(changed.shipped).toEqual(first.shipped)
  expect(changed.standing).toBe('englishChanged')
  const confirmed = await save(key, changed.en, { chineseMatchesEnglish: true })
  expect(confirmed.statusCode).toBe(200); expect(confirmed.json().standing).toBe('matches')
  expect((await save(key, 'Made-up second language label')).statusCode).toBe(200)
  const history = (await app.inject({ url: '/api/words/history?key=' + key })).json().versions
  expect(history).toHaveLength(3)
  expect(history[2]).toMatchObject({ by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, after: { choice: { en: 'Made-up first language label' }, because: 'Made-up word choice' } })
  expect((await restore(key, history[2].id)).statusCode).toBe(200)
  expect((await read(key)).en).toBe('Made-up first language label')
  expect((await restore(key, 'shipped')).statusCode).toBe(200)
  expect((await read(key)).en).toEqual(first.shipped.en)
  expect((await read(key)).changed).toBe(false)
  expect(db.client.sqlite.prepare('SELECT name FROM runtime_settings WHERE name=?').get('office.word:'+key)).toBeUndefined()
  const waiting = (await app.inject({ url: '/api/words/waiting?limit=500' })).json()
  expect(waiting.words.some((r: {key:string}) => r.key === key)).toBe(false)
  const { whatTheWordsWaitingDoorSays } = await import('../src/server/lib/words-waiting.ts')
  expect(whatTheWordsWaitingDoorSays(0, 20_000).words.some(r => r.key === key)).toBe(false)
})

it('edits page words without rewriting authored records or their revisions, and refuses an ordinary agent', async () => {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'task', title: 'Language for the pages', summary: 'Made-up authored body: Language for the pages.', data: {} } })
  expect(made.statusCode, made.body).toBe(201)
  const id = made.json().record.id
  const records = () => JSON.stringify({ record: db.client.sqlite.prepare('SELECT * FROM records WHERE id=?').get(id), revisions: db.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id=?').all(id) })
  const before = records()
  expect((await save('settings.language.choose', 'Made-up changed page label')).statusCode).toBe(200)
  expect(records()).toBe(before)
  const created = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'made-up-word-worker', name: 'Made-up word worker', role: 'worker' } })
  expect(created.statusCode).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const worker = agentByHandle('made-up-word-worker')!
  const row = await read('noticeRules.title')
  const denied = await app.inject({ method: 'POST', url: '/api/words/table', headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': worker.handle, 'x-mole-office-key': makeAnAgentKey(worker.id, null) }, payload: { key: row.key, version: row.version, en: 'Made-up denied word', zh: row.zh, chineseMatchesEnglish: false, because: 'Made-up denied press' } })
  expect(denied.statusCode).toBe(403); expect((await read(row.key)).en).toEqual(row.en)
})

it('refuses a blank required label before it can hide a control, with no saved choice or audit', async () => {
  const before = () => JSON.stringify({ choices: db.client.sqlite.prepare('SELECT * FROM runtime_settings ORDER BY name').all(), audit: db.client.sqlite.prepare("SELECT * FROM changes WHERE record_id LIKE 'setting:word:%'").all() })
  const original = before()
  for (const key of ['wordTable.save', 'noticeRules.title']) {
    const refused = await save(key, '   ')
    expect(refused.statusCode, refused.body).toBe(400)
    expect(before()).toBe(original)
  }
})

it('keeps shipped getters live in a held reader, and uses the same edited word for stored-value labels',async()=>{
  const words=await import('../src/shared/i18n.ts'), work=await import('../src/shared/work.ts')
  const key='settings.language.choose', source=words.WORD_LISTS.en as Record<string, unknown>
  const original=source[key], reader=words.createI18n('en')
  expect(reader.t(key)).toEqual(original)
  try {
    source[key]='Made-up renamed source label'
    expect(reader.t(key)).toBe('Made-up renamed source label')
  } finally { source[key]=original }
  expect((await save('kind.task','Made-up task label')).statusCode).toBe(200)
  expect(work.displayWord('task')).toBe('Made-up task label')
  expect((await save('state.todo','Made-up state label')).statusCode).toBe(200)
  expect(work.displayWord('todo')).toBe('Made-up state label')
})

it('lets a secretary’s own key edit words and refuses a keyless secretary name',async()=>{
  const made=await app.inject({method:'POST',url:'/api/agents/started',headers,payload:{handle:'made-up-word-secretary',name:'Made-up word secretary',role:'secretary'}})
  expect(made.statusCode,made.body).toBe(201)
  const {agentByHandle}=await import('../src/server/lib/participants.ts'), {makeAnAgentKey}=await import('../src/server/lib/keys.ts')
  const secretary=agentByHandle('made-up-word-secretary')!
  const row=await read('noticeRules.title')
  const payload={key:row.key,version:row.version,en:'Made-up secretary words',zh:row.zh,chineseMatchesEnglish:false,because:'Made-up secretary press'}
  const acting={...headers,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':secretary.handle}
  const denied=await app.inject({method:'POST',url:'/api/words/table',headers:acting,payload})
  expect(denied.statusCode,denied.body).toBe(403)
  expect((await read(row.key)).en).toEqual(row.en)
  const saved=await app.inject({method:'POST',url:'/api/words/table',headers:{...acting,'x-mole-office-key':makeAnAgentKey(secretary.id,null)},payload})
  expect(saved.statusCode,saved.body).toBe(200)
  expect((await read(row.key)).en).toBe(payload.en)
})

// UNTIL WAVE 13Y ROUND 119 this case also edited two of the older built-in map's statuses, read through
// src/shared/pixel-words.ts. That file and its words were deleted with the map, so the Chinese that an English save
// leaves alone is now read from the table's own row.
it('edits surface captions through the effective reader, keeping their Chinese and their shipped labels',async()=>{
  const {surfaceWord}=await import('../src/shared/surfaces.ts')
  const original=await read('surfaceWords.resources.gpu')
  expect(original.zh.length).toBeGreaterThan(0)
  expect((await save('surfaceWords.resources.gpu','Made-up catalogue label')).statusCode).toBe(200)
  expect(surfaceWord('resources.gpu')).toBe('Made-up catalogue label')
  expect((await read('surfaceWords.resources.gpu')).zh).toBe(original.zh)
  expect((await restore('surfaceWords.resources.gpu','shipped')).statusCode).toBe(200)
  expect(surfaceWord('resources.gpu')).toBe(original.shipped.en)
})

it('fills the folder the runner reads into the shipped words for the two Modal runner files',async()=>{
  const {MODAL_FOLDER,settingNamed}=await import('../src/config/settings.mjs')
  const door=(await app.inject({url:'/api/office/settings'})).json().settings as {name:string,what:string}[]
  for(const [name,file] of [['MOLE_OFFICE_MODAL_TOKEN_FILE','token.toml'],['MOLE_OFFICE_MODAL_PYTHON','venv/bin/python']]){
    for(const what of [door.find((s)=>s.name===name)!.what,settingNamed(name!).what]) expect(what).toContain(`at ~/${MODAL_FOLDER}/${file} unless set`)
  }
})
