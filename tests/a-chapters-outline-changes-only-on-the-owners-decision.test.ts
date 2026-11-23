// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHAPTER'S OUTLINE CHANGES ONLY BY THE PERSON, OR BY AN AGENT ON THE OWNER'S DECISION. Wave 13r round 5, item 3:
 * EhNAprifszYY, and the secretary's AWhlI0gV62Ep, CSK685LItJOq, G9qHEx_0h_KG, OAfUqVC-nSSO and UokD08PZo9jk.
 *
 * THE OLD WORDING. EhNAprifszYY said that a change to a chapter's outline, its list of rules, is a decision, and nothing
 * on the record doors asked it: any agent could rename, reorder, add or remove a chapter's rules, give a module a chapter
 * number, or delete a chapter, through POST, PATCH, DELETE and the two restore doors. The secretary's first answer
 * (AWhlI0gV62Ep) had such a write name `"decision": "<id>"` at the top of its body.
 *
 * THE NEW WORDING. The outline is the rule ids in order and each rule's English heading, read on the record as it is
 * stored and as the write would leave it, with the chapter's number and kind. A write that changes it is refused, with
 * one sentence saying what to do and nothing written, unless the person makes it (proved by the person's key) or it
 * carries the existing warrant: the owner's words, where `message:<id>`, and a live decision, in any project, whose
 * authority_reference is that message, whose decided_by is "the owner" and whose authority is "the owner said so". A
 * decision of an agent's is not enough, and neither is a raised secretary. Everything below the outline stays free: rule
 * texts, the Chinese, the label, title and conclusion, the neutral twins, the parts and a move. An agent's delete or
 * restore of a chapter record is refused outright, until DELETE and restore take a warrant. The office's own copy of the
 * default chapters into a fresh office is not refused (tests/a-fresh-office-copies-the-default-regulations.test.ts).
 *
 * WHY. The secretary corrected the "decision" field (CSK685LItJOq): chapter edits carry a warrant already, and the warrant is
 * how an agent applies the owner's decision. The check is one function, `whichDecisionOfTheOwnersTheseWordsStandOn` in
 * src/server/lib/warrants.ts, shared with wave 13w.
 *
 * THE WORDING SINCE ROUND 5D. Both waves wrote that function, and main's, from wave 13w round 5, is the one kept (the secretary's
 * 3S7Tmt5HNMgQ, answer 1). It asks one thing more than this branch's did: the warrant's words are the person's, copied
 * whole from the message it cites, which the person wrote. So every warrant here copies its message's words, one case
 * shows words the message does not hold refused, and the refusals expected are that function's sentences.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, theAnswerToAWriteInATestOffice, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { englishHash } from '../src/shared/english-hash.ts'

let t: TestDb
let app: FastifyInstance
let person: Record<string, string>
let worker: Record<string, string>
let secretary: Record<string, string>

const OTHER_PROJECT = 'made-up-other-project'
const RULES = [1, 2, 3].map((n) => ({ id: `r-${String(n)}`, type: 'text', heading: `Made-up rule ${String(n)}`, text: `Made-up words of rule ${String(n)}.` }))
/** The start of the refusal of an outline change, and its last sentence. */
const OUTLINE_REFUSED = /^This write would change the outline of chapter \d+ .*only the person, or an agent acting on a decision of the owner's, changes an outline\..*Nothing was written\.$/s
const DELETE_REFUSED = 'Only the person deletes a chapter record or brings one back, because either changes which rules the office reads. Nothing was written.'

function snapshot(): string {
  return JSON.stringify(['records', 'revisions', 'changes'].map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
}

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>, summary?: string): Promise<string> {
  const made = await ask('POST', '/api/records', headers, { kind, title, data, ...(summary === undefined ? {} : { summary }) })
  expect(made.status, made.said).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return String((made.body['record'] as { id: string }).id)
}

/** A chapter the person files, numbered n, with three rules. */
function aChapter(n: number): Promise<string> {
  return file(person, 'module', `Made-up chapter ${String(n)}`, { state: 'active', parts: [], extra: { chapter: n }, summaryBlocks: RULES.map((rule) => ({ ...rule })) }, 'Made-up conclusion.')
}

async function blocks(id: string): Promise<Record<string, unknown>[]> {
  const back = await ask('GET', `/api/records/${id}`, person)
  expect(back.status, back.said).toBe(200)
  return (back.body['record'] as { data: { summaryBlocks: Record<string, unknown>[] } }).data.summaryBlocks
}

/** A message the person wrote to the worker. */
function thePersonsMessage(body: string): Promise<string> {
  return file(person, 'message', 'About the made-up chapter', { body, to: [{ kind: 'agent', id: 'made-up-outline-worker' }] })
}

/** A decision the person filed, resting on that message. */
function aDecision(message: string, decidedBy: string, authority: string, headers = person, replaces: string[] = []): Promise<string> {
  return file(headers, 'decision', `Made-up decision on ${message}`, {
    ...governsTheWholeProject(), replaces,
    decided_by: decidedBy,
    authority,
    authority_reference: message,
    option_taken: 'Rule 2 of the made-up chapter is renamed.',
    because: 'Made-up words: rename rule 2.',
  })
}

/** The person's words, copied whole from the message, as a warrant for one record or for the title a create names. */
function aWarrant(message: string, acting: string, where = `message:${message}`, words = 'Made-up words: rename rule 2.'): Record<string, unknown> {
  return { saidBy: THE_PERSON, words, where, when: '2026-10-12 21:06', for: [acting] }
}

/** The start of the refusal when no live decision of the owner's rests on the message. */
const noLiveDecisionOn = (message: string): string => `No live decision of the owner's rests on message ${message}.`

/** Rule 2 renamed: an outline change. */
function renamed(): Record<string, unknown>[] {
  return RULES.map((rule) => (rule.id === 'r-2' ? { ...rule, heading: 'Made-up rule 2, renamed' } : { ...rule }))
}

async function refusedAndNothingWritten(request: () => Promise<{ status: number; said: string }>, sentence: RegExp | string = OUTLINE_REFUSED): Promise<string> {
  const before = snapshot()
  const refused = await request()
  expect(refused.status, refused.said).toBe(403)
  if (typeof sentence === 'string') expect(refused.said).toBe(sentence)
  else expect(refused.said).toMatch(sentence)
  expect(snapshot()).toBe(before)
  return refused.said
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: OTHER_PROJECT, title: 'Made-up other project' })
  const as = async (role: string): Promise<Record<string, string>> => {
    const handle = `made-up-outline-${role}`
    const made = await ask('POST', '/api/agents/started', person, { handle, name: `Made-up ${role}`, role })
    expect(made.status, made.said).toBe(201)
    return { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(agentByHandle(handle)!.id, null) }
  }
  worker = await as('worker')
  secretary = await as('secretary')
  const raised = await ask('POST', '/api/roles/elevation/made-up-outline-secretary', person, { reason: 'Made-up authority proof', endsWhen: 'at a time', until: '2099-01-01 07:00' })
  expect(raised.status, raised.said).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("an agent's write that changes a chapter's outline, with no warrant", () => {
  const changes: Record<string, (rules: Record<string, unknown>[]) => Record<string, unknown>[]> = {
    'renames a rule': () => renamed(),
    'reorders the rules': (rules) => [rules[1]!, rules[0]!, rules[2]!],
    'adds a rule': (rules) => [...rules, { id: 'r-4', type: 'text', heading: 'Made-up rule 4', text: 'Made-up words of rule 4.' }],
    'removes a rule': (rules) => rules.slice(0, 2),
    "changes a rule's id": (rules) => rules.map((rule, i) => (i === 2 ? { ...rule, id: 'r-9' } : rule)),
  }
  for (const [what, change] of Object.entries(changes)) {
    it(`is refused when it ${what}`, async () => {
      const chapter = await aChapter(7)
      const said = await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: change(RULES.map((rule) => ({ ...rule }))) } }))
      expect(said).toContain('This request carries no warrant.')
    })
  }

  const ofTheChapter: Record<string, Record<string, unknown>> = {
    "changes the chapter's number": { dataPatch: { extra: { chapter: 6 } } },
    "takes away the chapter's number": { dataPatch: { extra: { chapter: null } } },
    'takes the record out of its kind': { kind: 'note' },
  }
  for (const [what, write] of Object.entries(ofTheChapter)) {
    it(`is refused when it ${what}`, async () => {
      const chapter = await aChapter(7)
      await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, write))
    })
  }

  it('is refused when it files a new chapter', async () => {
    await refusedAndNothingWritten(() => ask('POST', '/api/records', worker, { kind: 'module', title: 'Made-up chapter by an agent', summary: 'Made-up.', data: { state: 'active', parts: [], extra: { chapter: 5 }, summaryBlocks: RULES } }))
  })

  it('is refused when it gives a module a chapter number', async () => {
    const module = await file(worker, 'module', 'Made-up subsystem', { state: 'active', parts: [] })
    await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${module}`, worker, { dataPatch: { extra: { chapter: 5 }, summaryBlocks: RULES } }))
  })

  it('is refused for a raised secretary', async () => {
    const chapter = await aChapter(7)
    await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, secretary, { dataPatch: { summaryBlocks: renamed() } }))
  })

  it('is refused through the revision restore door, and the sentence sends it as a PATCH carrying a warrant', async () => {
    const chapter = await aChapter(7)
    const changed = await ask('PATCH', `/api/records/${chapter}`, person, { dataPatch: { summaryBlocks: renamed() } })
    expect(changed.status, changed.said).toBe(200)
    const said = await refusedAndNothingWritten(() => ask('POST', `/api/records/${chapter}/revisions/1/restore`, worker, {}))
    expect(said).toContain('PATCH /api/records/<id>')
    expect(said).toContain('message:<id>')
  })
})

describe("the warrant an agent's outline change carries", () => {
  it('is refused when it cites a place that is not a message', async () => {
    const chapter = await aChapter(7)
    const said = await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant('', chapter, 'terminal') }))
    expect(said).toContain("Mole Office cannot check that the warrant's words are the person's: it cites terminal, and only a message the person wrote can be checked.")
  })

  it('is refused when the message does not hold the warrant\'s words', async () => {
    const chapter = await aChapter(7)
    const message = await thePersonsMessage('Made-up words: rename rule 3.')
    await aDecision(message, 'the owner', 'the owner said so')
    const said = await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant(message, chapter) }))
    expect(said).toContain(`The warrant's words are not the person's words: message ${message} does not hold them.`)
  })

  it('is refused when no decision rests on the message', async () => {
    const chapter = await aChapter(7)
    const message = await thePersonsMessage('Made-up words: rename rule 2.')
    const said = await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant(message, chapter) }))
    expect(said).toContain(`${noLiveDecisionOn(message)} No live decision cites it.`)
  })

  it('is refused when the decision on the message is not decided by the owner on the owner\'s word', async () => {
    const chapter = await aChapter(7)
    const message = await thePersonsMessage('Made-up words: rename rule 2.')
    const byAnAgent = await aDecision(message, 'an agent', 'reversible engineering judgement')
    const said = await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant(message, chapter) }))
    expect(said).toContain(`${noLiveDecisionOn(message)} The live decisions that cite it (${byAnAgent}) are not the owner's on the person's words`)
  })

  it('is refused when the decision on the message stands on something other than the owner\'s word', async () => {
    const chapter = await aChapter(7)
    const message = await thePersonsMessage('Made-up words: rename rule 2.')
    const measured = await aDecision(message, 'the owner', 'a measurement')
    const said = await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant(message, chapter) }))
    expect(said).toContain(`${noLiveDecisionOn(message)} The live decisions that cite it (${measured}) are not the owner's on the person's words`)
  })

  it('is refused when the owner\'s decision on the message is deleted', async () => {
    const chapter = await aChapter(7)
    const deletedOn = await thePersonsMessage('Made-up words: rename rule 2.')
    const deleted = await aDecision(deletedOn, 'the owner', 'the owner said so')
    expect((await ask('DELETE', `/api/records/${deleted}`, person)).status).toBe(200)
    expect(await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant(deletedOn, chapter) }))).toContain(`${noLiveDecisionOn(deletedOn)} No live decision cites it.`)
  })

  it('is refused when the owner\'s decision on the message is replaced by a live one', async () => {
    const chapter = await aChapter(7)
    const replacedOn = await thePersonsMessage('Made-up words: rename rule 2, said again.')
    const replaced = await aDecision(replacedOn, 'the owner', 'the owner said so')
    const later = await thePersonsMessage('Made-up words: leave rule 2 alone.')
    await aDecision(later, 'the owner', 'the owner said so', person, [replaced])
    expect(await refusedAndNothingWritten(() => ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant(replacedOn, chapter, undefined, 'Made-up words: rename rule 2, said again.') }))).toContain(
      `${noLiveDecisionOn(replacedOn)} The live decisions that cite it (${replaced}) are not the owner's on the person's words, or a later decision replaced them.`,
    )
  })

  it('lets the change through on a live decision of the owner in another project, and keeps the warrant on the change row', async () => {
    const chapter = await aChapter(7)
    const message = await thePersonsMessage('Made-up words: rename rule 2.')
    await aDecision(message, 'the owner', 'the owner said so', { ...person, 'x-mole-office-workspace': OTHER_PROJECT })
    const done = await ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: renamed() }, warrant: aWarrant(message, chapter) })
    expect(done.status, done.said).toBe(200)
    expect((await blocks(chapter)).map((block) => block['heading'])).toEqual(['Made-up rule 1', 'Made-up rule 2, renamed', 'Made-up rule 3'])
    const row = t.client.sqlite.prepare('SELECT warrant FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1').get(chapter) as { warrant: string | null }
    expect(JSON.parse(row.warrant!)).toMatchObject({ where: `message:${message}` })
  })

  it('lets a new chapter be filed on the owner\'s decision, the warrant naming its title', async () => {
    const message = await thePersonsMessage('Made-up words: file chapter 4.')
    await aDecision(message, 'the owner', 'the owner said so')
    const title = 'Made-up chapter 4, filed on the owner\'s word'
    const made = await ask('POST', '/api/records', worker, { kind: 'module', title, summary: 'Made-up.', data: { state: 'active', parts: [], extra: { chapter: 4 }, summaryBlocks: RULES }, warrant: aWarrant(message, title, undefined, 'Made-up words: file chapter 4.') })
    expect(made.status, made.said).toBe(201)
  })
})

describe('the shared check, whichDecisionOfTheOwnersTheseWordsStandOn', () => {
  it('answers the earliest live decision of the owner on the message, or null and why', async () => {
    const { whichDecisionOfTheOwnersTheseWordsStandOn } = await import('../src/server/lib/warrants.ts')
    const words = 'Made-up words: two decisions rest on this.'
    const message = await thePersonsMessage(words)
    expect(whichDecisionOfTheOwnersTheseWordsStandOn({ words, where: `message:${message}` })).toEqual({
      decision: null,
      because:
        `${noLiveDecisionOn(message)} No live decision cites it. A decision of the owner's rests on it when its decided_by is "the owner", ` +
        `its authority is "the owner said so" and its authority_reference is ${message}, in any project.`,
    })
    const first = await aDecision(message, 'the owner', 'the owner said so')
    // A SECOND LATER. The check reads "earliest" from created_at, which is stored to the second, and breaks a tie by
    // the record's id, so two decisions filed in one second are answered in the order of their random ids. That is
    // reported, not changed here; this case measures two decisions whose times differ.
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    await aDecision(message, 'the owner', 'the owner said so')
    expect(whichDecisionOfTheOwnersTheseWordsStandOn({ words, where: `message:${message}` })).toEqual({ decision: first })
    const terminal = whichDecisionOfTheOwnersTheseWordsStandOn({ words, where: 'terminal' })
    expect(terminal.decision).toBeNull()
  })
})

describe('what stays free', () => {
  it("lets an agent change a rule's text and Chinese, the title and conclusion, the twins, the label and the parts, and move the chapter", async () => {
    const chapter = await aChapter(7)
    const text = RULES.map((rule) => (rule.id === 'r-1' ? { ...rule, text: 'Made-up words of rule 1, reworded.' } : { ...rule }))
    for (const write of [
      { dataPatch: { summaryBlocks: text } },
      { dataPatch: { summaryBlocks: text.map((rule) => ({ ...rule, zh: { heading: '测试条文', text: '测试条文的文字。', from: englishHash([rule.heading, rule.text]) } })) } },
      { title: 'Made-up chapter 7, retitled', summary: 'Made-up conclusion, reworded.' },
    ]) {
      const done = await ask('PATCH', `/api/records/${chapter}`, worker, write)
      expect(done.status, done.said).toBe(200)
    }
    const twins = (await blocks(chapter)).map((rule) => ({ ...rule, neutral: { heading: 'Made-up neutral heading', text: 'Made-up neutral words.', zh: { heading: '测试', text: '测试的文字。', from: englishHash(['Made-up neutral heading', 'Made-up neutral words.']) }, zhFrom: 'written for the default set', from: englishHash([String(rule['heading']), String(rule['text'])]) } }))
    const withTwins = await ask('PATCH', `/api/records/${chapter}`, worker, { dataPatch: { summaryBlocks: twins } })
    expect(withTwins.status, withTwins.said).toBe(200)
    const revision = (await ask('GET', `/api/records/${chapter}/revisions`, worker)).body['revisions'] as { seq: number; contentHash: string }[]
    const latest = revision.reduce((a, b) => (b.seq > a.seq ? b : a))
    const label = await ask('POST', `/api/records/${chapter}/short-forms`, worker, { madeFrom: { seq: latest.seq, contentHash: latest.contentHash }, forms: { label: 'Made-up kiln rules' } })
    expect(label.status, label.said).toBe(200)
    const part = await ask('POST', `/api/records/${chapter}/parts`, worker, { id: 'made-up-part', name: 'Made-up part' })
    expect(part.status, part.said).toBe(201)
    const moved = await ask('POST', `/api/records/${chapter}/workspace`, worker, { to: OTHER_PROJECT })
    expect(moved.status, moved.said).toBe(200)
  })

  it("lets the person change the outline with no warrant, by the person's own key", async () => {
    const chapter = await aChapter(7)
    const done = await ask('PATCH', `/api/records/${chapter}`, person, { dataPatch: { summaryBlocks: [RULES[2]!, RULES[0]!] } })
    expect(done.status, done.said).toBe(200)
  })
})

describe('deleting a chapter record and bringing one back', () => {
  it('is refused to an agent and to a raised secretary, and the person deletes one', async () => {
    const chapter = await aChapter(7)
    await refusedAndNothingWritten(() => ask('DELETE', `/api/records/${chapter}`, worker), DELETE_REFUSED)
    await refusedAndNothingWritten(() => ask('DELETE', `/api/records/${chapter}`, secretary), DELETE_REFUSED)
    expect((await ask('DELETE', `/api/records/${chapter}`, person)).status).toBe(200)
  })

  it('is refused to an agent bringing one back, and the person brings it back', async () => {
    const chapter = await aChapter(7)
    expect((await ask('DELETE', `/api/records/${chapter}`, person)).status).toBe(200)
    await refusedAndNothingWritten(() => ask('POST', `/api/records/${chapter}/restore`, worker), DELETE_REFUSED)
    const back = await ask('POST', `/api/records/${chapter}/restore`, person)
    expect(back.status, back.said).toBe(200)
  })

  it('leaves a module that is not a chapter to the ordinary rules', async () => {
    const module = await file(worker, 'module', 'Made-up subsystem to delete', { state: 'active', parts: [] })
    expect((await ask('DELETE', `/api/records/${module}`, worker)).status).toBe(200)
  })
})
