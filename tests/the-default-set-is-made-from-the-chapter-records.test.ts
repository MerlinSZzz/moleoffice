// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEFAULT REGULATIONS ARE MADE FROM THE OWNER'S CHAPTER RECORDS, AND A RULE ONLY THE PERSON MARKS IS LEFT OUT.
 *
 * Wave 13s round 9. Each rule of a chapter record may carry its neutral twin
 * (`neutral` on the rule's text block), each chapter record its own neutral words (`neutral` on the record), and the
 * person may mark a rule as only for this office (`onlyThisOffice`). src/shared/default-set.ts turns the records into
 * src/config/rules/default-regulations.json; tools/rules-chapters.mjs writes the file with it; and
 * scripts/write-the-neutral-twins.mjs writes the first twins from today's file.
 *
 * WHAT THIS FILE HOLDS, on a test world of its own: the owner's chapters filed from src/config/rules/chapters.json,
 * in a project of their own, as the owner's office holds them.
 *   1. with no twin and no mark anywhere, the set cannot be made, and the answer says the office has not begun;
 *   2. the person presses "only this office" on each rule today's file names in leftOut, the script, run for real
 *      against this world's server, writes the twins, and the set made from the records is today's file, byte for
 *      byte; run again, it writes nothing;
 *   3. a rule agreed later, with neither a twin nor the mark, stops the set, and the refusal names it;
 *   4. an agent may not mark it, and no ordinary write may set the mark; the person's own press marks it, the set then
 *      leaves it out and names it in leftOut, the page's reply shows who marked it, and the press takes the mark off.
 * A twin's Chinese carries `from`, the hash of the twin's own English, and the last describe holds what that changes:
 *   5. a twin whose Chinese names another English stops the set, on a list of its own, and a twin already stale by the
 *      owner's English stays on that list only;
 *   6. a twin whose Chinese has no `from`, as every twin had before, is named on both answers and stops nothing;
 *   7. the script writes every twin with that `from`, and run again it writes nothing;
 *   8. a stored twin with no `from` on its Chinese is kept as it is, and the script writes a missing twin beside it.
 *
 * THE MUTATIONS OF 5 TO 8, each after a control run and each put back after (chapter 5):
 *   - in `theDefaultSetFromRecords`, the check of a twin's Chinese `from` taken out: 5 turns red;
 *   - the list of twins with no Chinese `from` always empty: 6 turns red;
 *   - in `theWriteThatGivesARecordItsTwins`, the twin written with no `from` on its Chinese: the door refuses the script's
 *     first write, so 7 turns red, and so does every case that needs the twins written;
 *   - in its `settle`, a stored twin that lacks only that `from` read as stale: 8 turns red.
 *
 * WHERE THE MARKS COME FROM. chapters.json carries the owner's rules and no "only this office" marks, so a world built
 * from it alone holds rules that have no twin in the set, and the script refuses it. The world takes the marks from
 * today's file instead: each rule in its leftOut is pressed by the person, as the owner pressed it in the owner's own office.
 *
 * WHAT IS REAL HERE. The migrations, the record door and its guard, the person-only door, the script and the server it
 * talks to. The chapters are the owner's own export; the new rule in case 3 is synthetic.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'

const REPO = join(import.meta.dirname, '..')
const TODAY = readFileSync(join(REPO, 'src/config/rules/default-regulations.json'), 'utf8')
const OWNERS = JSON.parse(readFileSync(join(REPO, 'src/config/rules/chapters.json'), 'utf8')) as {
  chapters: { n: number; forRole?: string; label: string; title: string; conclusion: string; context: string; outline: { id: string; name: string; text: string }[] }[]
}
/** The rules today's file leaves out, because the owner marked them as only for the owner's own office. */
const LEFT_OUT = ((JSON.parse(TODAY) as { leftOut?: { chapter: number; rule: string }[] }).leftOut ?? [])
const PROJECT = 'the-owners-chapters'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
}

let t: TestDb
let app: FastifyInstance
let address = ''
let set: typeof import('../src/shared/default-set.ts')
const chapterIds = new Map<number, string>()

async function theRecords(): Promise<{ id: string; kind: string; title: string; summary: string | null; data: unknown }[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/records?kind=module&shape=full', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { records: { id: string; kind: string; title: string; summary: string | null; data: unknown }[] }
  return body.records
}

/** The person presses "only this office" on a rule of this world, or takes the mark off. */
function theMark(chapter: string, rule: string, only: boolean, headers: Record<string, string> = { ...AS_THE_PERSON, ...thePersonsKeyHeader() }) {
  return app.inject({ method: 'POST', url: '/api/office-regulations/only-this-office', headers, payload: { chapter, rule, only } })
}

/** The script, run as its own process against this world's server. Not run synchronously: the server answers from this process. */
async function theScript(...args: string[]): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_API: address, MOLE_OFFICE_WORKSPACE: PROJECT }
  delete env['MOLE_AGENT_KEY']
  // The registered agent the record door knows in a test world, with no key, as a local program writes there.
  env['MOLE_OFFICE_AGENT'] = AS_AN_AGENT['x-mole-office-actor-id']
  delete env['MOLE_OFFICE_SESSION']
  const ran = await promisify(execFile)('node', [join(REPO, 'scripts/write-the-neutral-twins.mjs'), ...args], { cwd: REPO, env, encoding: 'utf8' })
  return ran.stdout
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ port: 0, host: '127.0.0.1' })
  const bound = app.server.address()
  address = `http://127.0.0.1:${String(typeof bound === 'object' && bound !== null ? bound.port : 0)}`
  set = await import('../src/shared/default-set.ts')
  const projects = await import('../src/server/lib/workspaces.ts')
  projects.createWorkspace({ id: PROJECT, title: "The owner's chapters" })
  for (const chapter of OWNERS.chapters) {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: {
        kind: 'module',
        title: chapter.title,
        summary: chapter.conclusion,
        data: {
          context: chapter.context,
          parts: [],
          extra: { chapter: chapter.n, ...(chapter.forRole === undefined ? {} : { forRole: chapter.forRole }) },
          summaryBlocks: chapter.outline.map((rule) => ({ id: rule.id, type: 'text', heading: rule.name, text: rule.text })),
        },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id
    chapterIds.set(chapter.n, id)
    const revision = (await app.inject({ url: `/api/records/${id}/revisions`, headers: AS_THE_PERSON })).json().revisions[0]
    const label = await app.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers: AS_THE_PERSON, payload: { madeFrom: { seq: revision.seq, contentHash: revision.contentHash }, forms: { label: chapter.label } } })
    expect(label.statusCode, label.body).toBe(200)
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the default regulations, made from the chapter records', () => {
  it('cannot be made before any rule has a twin or a mark, and says the office has not begun', async () => {
    const made = set.theDefaultSetFromRecords(await theRecords())
    expect(made.made).toBe(false)
    expect(made.anyTwinOrMark).toBe(false)
  })

  it('is today\'s file, byte for byte, once the person has marked what it leaves out and the script has written the twins from it; run again, it writes nothing', async () => {
    for (const one of LEFT_OUT) {
      const marked = await theMark(chapterIds.get(one.chapter)!, one.rule, true)
      expect(marked.statusCode, marked.body).toBe(200)
    }
    const checked = await theScript('--check')
    expect(checked).toContain('nothing was written')
    expect(set.theDefaultSetFromRecords(await theRecords()).made).toBe(false)

    const wrote = await theScript()
    expect(wrote).toContain(`Wrote twins to ${String(OWNERS.chapters.length)} of ${String(OWNERS.chapters.length)} chapter records`)
    const made = set.theDefaultSetFromRecords(await theRecords())
    expect(made.made).toBe(true)
    if (made.made) expect(made.text).toBe(TODAY)

    const again = await theScript()
    expect(again).toContain(`Wrote twins to 0 of ${String(OWNERS.chapters.length)} chapter records`)
    // THE OWNER'S OWN WORDS ARE UNTOUCHED: each rule's heading and text are still the export's.
    for (const record of await theRecords()) {
      const n = (record.data as { extra: { chapter: number } }).extra.chapter
      const blocks = (record.data as { summaryBlocks: { id: string; heading: string; text: string }[] }).summaryBlocks
      expect(blocks.map((b) => [b.id, b.heading, b.text])).toEqual(OWNERS.chapters.find((c) => c.n === n)!.outline.map((r) => [r.id, r.name, r.text]))
    }
  })

  it('refuses a twin whose rule the owner rewrote after it was written, names it, and makes nothing from the old twin', async () => {
    // WAVE 13S ROUND 9B, the refusal of check JwcNXuZucxP8: a twin records the hash of the owner's English it was written
    // from, and the set is not made from a twin whose rule has changed since.
    const id = chapterIds.get(5)!
    const record = (await theRecords()).find((one) => one.id === id)!
    const blocks = (record.data as { summaryBlocks: { id: string; text: string }[] }).summaryBlocks
    const was = blocks[0]!.text
    const rewrite = (text: string) =>
      app.inject({
        method: 'PATCH',
        url: `/api/records/${id}`,
        headers: AS_THE_PERSON,
        payload: { dataPatch: { summaryBlocks: blocks.map((block, i) => (i === 0 ? { ...block, text } : block)) } },
      })
    const rewritten = await rewrite(`${was} The owner added this sentence after the twin was written.`)
    expect(rewritten.statusCode, rewritten.body).toBe(200)

    const made = set.theDefaultSetFromRecords(await theRecords())
    expect(made.made).toBe(false)
    if (made.made) return
    expect(made.why.staleRules).toEqual([{ chapter: 5, record: id, rule: blocks[0]!.id, heading: (blocks[0] as unknown as { heading: string }).heading }])
    expect(set.whyTheDefaultSetCannotBeMade(made.why)).toContain(`written from English the owner has since changed: chapter 5 rule ${blocks[0]!.id}`)

    // The write script names it under --check, writes nothing, and ends with exit code 1.
    const checked = await theScript('--check').then(
      () => { throw new Error('the script did not stop on a stale twin') },
      (error: { code?: number; stdout?: string }) => error,
    )
    expect(checked.code).toBe(1)
    expect(checked.stdout).toContain(`chapter 5 (${id}): ${blocks[0]!.id}`)
    expect(checked.stdout).toContain('nothing was written')

    // Put back as it was, the twin is current again and the set is made, today's file byte for byte.
    expect((await rewrite(was)).statusCode).toBe(200)
    const again = set.theDefaultSetFromRecords(await theRecords())
    expect(again.made).toBe(true)
    if (again.made) expect(again.text).toBe(TODAY)
  })

  it('refuses, naming it, a rule agreed later that has neither a twin nor the mark', async () => {
    const id = chapterIds.get(7)!
    const record = (await theRecords()).find((one) => one.id === id)!
    const blocks = (record.data as { summaryBlocks: unknown[] }).summaryBlocks
    const added = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { summaryBlocks: [...blocks, { id: 'r-99', type: 'text', heading: 'A rule agreed later', text: 'Its words.' }] } },
    })
    expect(added.statusCode, added.body).toBe(200)
    const made = set.theDefaultSetFromRecords(await theRecords())
    expect(made.made).toBe(false)
    if (made.made) return
    expect(made.anyTwinOrMark).toBe(true)
    expect(made.why.rules).toEqual([{ chapter: 7, record: id, rule: 'r-99', heading: 'A rule agreed later' }])
    expect(set.whyTheDefaultSetCannotBeMade(made.why)).toContain('chapter 7 rule r-99 ("A rule agreed later"')
  })

  it('takes the mark only from the person\'s press, leaves the marked rule out, and takes the mark off again', async () => {
    const id = chapterIds.get(7)!
    const byAnAgent = await theMark(id, 'r-99', true, AS_AN_AGENT)
    expect(byAnAgent.statusCode, byAnAgent.body).toBe(403)
    const byAPatch = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() },
      payload: { dataPatch: { onlyThisOffice: [{ rule: 'r-99', by: THE_PERSON, at: '2026-10-02 21:00:00' }] } },
    })
    expect(byAPatch.statusCode, byAPatch.body).toBe(403)
    expect(byAPatch.body).toContain('Only the person marks a rule as only for this office')

    const byThePerson = await theMark(id, 'r-99', true)
    expect(byThePerson.statusCode, byThePerson.body).toBe(200)
    expect(byThePerson.json()).toMatchObject({ rule: 'r-99', onlyThisOffice: true, changed: true })

    const made = set.theDefaultSetFromRecords(await theRecords())
    expect(made.made).toBe(true)
    if (made.made) {
      expect(made.set.leftOut).toEqual([...LEFT_OUT, { chapter: 7, rule: 'r-99' }].sort((a, b) => a.chapter - b.chapter))
      expect(made.set.chapters.find((c) => c.n === 7)!.outline.map((r) => r.id)).not.toContain('r-99')
    }
    const page = (await app.inject({ method: 'GET', url: '/api/office-regulations', headers: AS_THE_PERSON })).json() as WhatTheOfficeRegulationsSay
    const rule = page.chapters.find((c) => c.n === 7)!.outline.find((r) => r.id === 'r-99')!
    expect(rule.onlyThisOffice?.by).toBe(THE_PERSON)

    const off = await theMark(id, 'r-99', false)
    expect(off.statusCode, off.body).toBe(200)
    expect(set.theDefaultSetFromRecords(await theRecords()).made).toBe(false)
  })
})

describe('a neutral twin\'s Chinese names the English it was written from', () => {
  type Twin = Record<string, unknown> & { zh: Record<string, unknown> }
  type Block = Record<string, unknown> & { id: string; heading: string; text: string; neutral?: Twin }
  type Held = { extra: { chapter: number }; neutral?: Twin; summaryBlocks: Block[] }
  type ARecord = Awaited<ReturnType<typeof theRecords>>[number]

  const held = (record: ARecord): Held => record.data as Held

  /** The chapter records that hold their own twin, by chapter number, each with its first rule that holds one. */
  function theChaptersWithTwins(records: ARecord[]): { n: number; record: ARecord; rule: Block }[] {
    return records
      .filter((record) => held(record).neutral !== undefined)
      .map((record) => ({ n: held(record).extra.chapter, record, rule: held(record).summaryBlocks.find((block) => block.neutral !== undefined)! }))
      .sort((a, b) => a.n - b.n)
  }

  /** A record of this world as stored now: an old record, whose twins were written before their Chinese named an English. */
  function storeAsAnOldRecord(id: string, change: (data: Held) => void): void {
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const data = JSON.parse(row.data) as Held
    change(data)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
  }

  beforeAll(async () => {
    // THE WORLD AS THE SCRIPT LEFT IT: the cases above add r-99 to chapter 7 with neither a twin nor the mark, and the set
    // is not made while it is there. The person takes it out again, so each case below starts from today's file.
    const id = chapterIds.get(7)!
    const record = (await theRecords()).find((one) => one.id === id)!
    const blocks = held(record).summaryBlocks.filter((block) => block.id !== 'r-99')
    const back = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_PERSON, payload: { dataPatch: { summaryBlocks: blocks } } })
    expect(back.statusCode, back.body).toBe(200)
  })

  it('refuses the set for a twin whose Chinese names another English, and names it once', async () => {
    const { theEnglishHashOfARule, theEnglishHashOfAChapter } = await import('../src/shared/office-rules.ts')
    // THE RECORDS ARE CHANGED IN MEMORY. The record door refuses a write that leaves a twin's Chinese naming another English
    // than the twin's own, so no record of this world can hold one; theDefaultSetFromRecords reads the records it is given.
    const records = structuredClone(await theRecords())
    const [a, b, c] = theChaptersWithTwins(records)
    const anOlder = (english: string) => `${english} A sentence the twin no longer holds.`
    // a: a rule twin's Chinese names an older English of the twin.
    a!.rule.neutral!.zh['from'] = theEnglishHashOfARule({ name: a!.rule.neutral!['heading'] as string, text: anOlder(a!.rule.neutral!['text'] as string) })
    // b: the chapter's own twin, the same.
    const own = held(b!.record).neutral!
    own.zh['from'] = theEnglishHashOfAChapter({ title: own['title'] as string, conclusion: anOlder(own['conclusion'] as string), label: own['label'] as string })
    // c: the owner's rule changed after its twin was written, and the twin's Chinese names an older English too.
    c!.rule.text = anOlder(c!.rule.text)
    c!.rule.neutral!.zh['from'] = theEnglishHashOfARule({ name: c!.rule.neutral!['heading'] as string, text: anOlder(c!.rule.neutral!['text'] as string) })

    const made = set.theDefaultSetFromRecords(records)
    expect(made.made).toBe(false)
    if (made.made) return
    expect(made.why.staleRuleChinese).toEqual([{ chapter: a!.n, record: a!.record.id, rule: a!.rule.id, heading: a!.rule.heading }])
    expect(made.why.staleChapterChinese).toEqual([{ chapter: b!.n, record: b!.record.id }])
    // A TWIN STALE BY THE OWNER'S ENGLISH IS NAMED THERE ONLY: it is written again from the rule, Chinese and all.
    expect(made.why.staleRules).toEqual([{ chapter: c!.n, record: c!.record.id, rule: c!.rule.id, heading: c!.rule.heading }])
    expect([made.why.rules, made.why.chapters, made.why.staleChapters]).toEqual([[], [], []])

    const said = set.whyTheDefaultSetCannotBeMade({ ...made.why, staleRules: [] })
    expect(said).toContain(`chapter ${String(a!.n)} rule ${a!.rule.id}`)
    expect(said).toContain(`chapter ${String(b!.n)} (record ${b!.record.id})`)
  })

  it('names each twin whose Chinese has no from, on the made answer and on the refusal, and still makes today\'s file', async () => {
    const records = structuredClone(await theRecords())
    const current = set.theDefaultSetFromRecords(records)
    expect(current.made).toBe(true)
    if (!current.made) return
    expect(current.twinsWithNoChineseFrom).toEqual({ rules: [], chapters: [] })
    expect(set.whichTwinsHaveNoChineseFrom(current.twinsWithNoChineseFrom)).toBeNull()

    // IN MEMORY, AS AN OFFICE'S RECORDS HELD THEM BEFORE THIS CHANGE: a chapter's own twin and two rules' twins with no from.
    const [a, b, c] = theChaptersWithTwins(records)
    delete held(a!.record).neutral!.zh['from']
    delete a!.rule.neutral!.zh['from']
    delete b!.rule.neutral!.zh['from']
    const named = { rules: [{ chapter: a!.n, rule: a!.rule.id }, { chapter: b!.n, rule: b!.rule.id }], chapters: [a!.n] }

    const made = set.theDefaultSetFromRecords(records)
    expect(made.made).toBe(true)
    if (!made.made) return
    expect(made.text).toBe(TODAY)
    expect(made.twinsWithNoChineseFrom).toEqual(named)
    const said = set.whichTwinsHaveNoChineseFrom(made.twinsWithNoChineseFrom)
    expect(said).toContain(`chapter ${String(a!.n)} rule ${a!.rule.id}`)
    expect(said).toContain(`chapter ${String(b!.n)} rule ${b!.rule.id}`)
    expect(set.whichTwinsHaveNoChineseFrom({ rules: [], chapters: [a!.n] })).toContain(`chapter ${String(a!.n)}`)

    // THE REFUSAL NAMES THEM TOO: a third rule's twin taken away stops the set.
    delete c!.rule.neutral
    const refused = set.theDefaultSetFromRecords(records)
    expect(refused.made).toBe(false)
    if (refused.made) return
    expect(refused.why.rules).toEqual([{ chapter: c!.n, record: c!.record.id, rule: c!.rule.id, heading: c!.rule.heading }])
    expect(refused.twinsWithNoChineseFrom).toEqual(named)
  })

  it('gives every twin of the first writing a Chinese that names the twin\'s own English, and writes nothing when run again', async () => {
    const { theEnglishHashOfARule, theEnglishHashOfAChapter } = await import('../src/shared/office-rules.ts')
    const today = JSON.parse(TODAY) as { chapters: { outline: unknown[] }[] }
    let twins = 0
    for (const record of await theRecords()) {
      const { extra, neutral, summaryBlocks } = held(record)
      if (neutral !== undefined) {
        const english = { title: neutral['title'] as string, conclusion: neutral['conclusion'] as string, label: neutral['label'] as string }
        expect(neutral.zh['from'], `chapter ${String(extra.chapter)}`).toBe(theEnglishHashOfAChapter(english))
        twins += 1
      }
      for (const block of summaryBlocks) {
        if (block.neutral === undefined) continue
        const english = { name: block.neutral['heading'] as string, text: block.neutral['text'] as string }
        expect(block.neutral.zh['from'], `chapter ${String(extra.chapter)} rule ${block.id}`).toBe(theEnglishHashOfARule(english))
        twins += 1
      }
    }
    expect(twins).toBe(today.chapters.length + today.chapters.reduce((sum, chapter) => sum + chapter.outline.length, 0))
    const again = await theScript()
    expect(again).toContain(`Wrote twins to 0 of ${String(OWNERS.chapters.length)} chapter records`)
  })

  it('keeps a stored twin whose Chinese has no from: not named stale, not written over, while a missing twin is written beside it', async () => {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    const [a] = theChaptersWithTwins(await theRecords())
    const last = held(a!.record).summaryBlocks.filter((block) => block.neutral !== undefined).at(-1)!
    expect(last.id).not.toBe(a!.rule.id)
    // AN OLD RECORD: its own twin and its first rule's twin have no from on their Chinese, as every office's twins had before
    // this change, and its last twin is missing, as a rule agreed later has none. The door would refuse the first two now.
    storeAsAnOldRecord(a!.record.id, (data) => {
      delete data.neutral!.zh['from']
      delete data.summaryBlocks.find((block) => block.id === a!.rule.id)!.neutral!.zh['from']
      delete data.summaryBlocks.find((block) => block.id === last.id)!.neutral
    })
    const old = held((await theRecords()).find((record) => record.id === a!.record.id)!)

    const giving = set.theWriteThatGivesARecordItsTwins((await theRecords()).find((record) => record.id === a!.record.id)!, set.theTwinsInTheDefaultSet(JSON.parse(TODAY)))
    expect(giving.stale).toEqual([])
    expect(giving.write).not.toBeNull()

    const wrote = await theScript()
    expect(wrote).toContain(`Wrote twins to 1 of ${String(OWNERS.chapters.length)} chapter records`)
    const now = held((await theRecords()).find((record) => record.id === a!.record.id)!)
    expect(now.neutral).toEqual(old.neutral)
    expect(now.summaryBlocks.find((block) => block.id === a!.rule.id)!.neutral).toEqual(old.summaryBlocks.find((block) => block.id === a!.rule.id)!.neutral)
    const written = now.summaryBlocks.find((block) => block.id === last.id)!.neutral!
    expect(written.zh['from']).toBe(theEnglishHashOfARule({ name: written['heading'] as string, text: written['text'] as string }))
    const made = set.theDefaultSetFromRecords(await theRecords())
    expect(made.made).toBe(true)
    if (made.made) expect(made.text).toBe(TODAY)
  })
})
