// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Every candidate part is ordered from the cursor and capped before the union. Returned outer rows alone cannot
 * expose work hidden inside SQLite, so this criterion inspects the executed compound statement as well as comparing
 * pages with the whole conversation. The SQL observation checks the bound and order, not a copied source sentence.
 */
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
let t: TestDb
let built: Awaited<ReturnType<typeof apiApp>>
let M: typeof import('../src/server/lib/messages.ts')
const PAGE = 7
const at = '2026-10-23 11:00:00'
const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
const pairs: [ParticipantRef, ParticipantRef][] = []
const cases: { a: ParticipantRef; b: ParticipantRef; asked: { limit: number; before?: string; after?: string }; expected: string[]; older: boolean; continues: boolean | null }[] = []
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

beforeAll(async () => {
  t = await freshDb()
  built = await apiApp()
  await built.app.ready()
  const shape = buildTheChatOffice(t.client.sqlite, THE_PERSON, {
    agents: 12, retired: 4, theConversation: 180, otherContacts: 3, otherPersonMessages: 36, betweenAgents: 300,
    groups: 4, groupsWithThePerson: 2, membersPerGroup: 4, groupMessages: 200, officeLines: 40, sessions: 40, otherRecords: 0,
  })
  M = await import('../src/server/lib/messages.ts')
  const sqlite = t.client.sqlite
  const notice = sqlite.prepare("SELECT json_extract(data, '$.sentBy') AS sender FROM records WHERE kind='message' AND json_extract(data,'$.aboutMessage') IS NOT NULL LIMIT 1").get() as { sender: string }
  const office = JSON.parse(notice.sender) as ParticipantRef
  const a: ParticipantRef = { kind: 'agent', id: shape.theAgent }
  const group = (sqlite.prepare('SELECT x.group_id AS id FROM group_members x JOIN group_members y ON y.group_id=x.group_id WHERE x.member_id=? AND y.member_id=? LIMIT 1').get(person.id, a.id) as { id: string }).id
  const other = (sqlite.prepare("SELECT member_id AS id FROM group_members WHERE group_id=? AND member_kind='agent' AND member_id<>? AND member_id<>? LIMIT 1").get(group, a.id, office.id) as { id: string }).id
  const b: ParticipantRef = { kind: 'agent', id: other }
  pairs.push([person, a], [person, b], [a, b], [a, person])
  const record = sqlite.prepare("INSERT INTO records (id,workspace_id,owner_id,created_at,updated_at,kind,title,data,origin) VALUES (?,'message-centre',?,?,?,'message','Made-up tied line',?,'authored')")
  const delivery = sqlite.prepare("INSERT INTO message_delivery (id,message_id,recipient_kind,recipient_id,mark,at) VALUES (?,?,?,?,'seen',?)")
  const say = (id: string, sender: ParticipantRef, to: ParticipantRef[], extra: Record<string, unknown> = {}) => {
    record.run(id, THE_TEST_OFFICES_OWNER.id, at, at, JSON.stringify({ body: 'Made-up words without an address.', sentBy: sender, writtenIn: { project: 'default' }, ...extra }))
    for (const [i, who] of to.entries()) delivery.run(`${id}-delivery-${i}`, id, who.kind, who.id, at)
  }
  sqlite.transaction(() => {
    // Reverse lexical ids at one instant make id order disagree with the stored rowid tie order.
    for (let i = 0; i < 90; i++) {
      say(`placed-person-${9999 - i}`, i % 2 ? person : a, [i % 2 ? a : person])
      say(`placed-other-${9999 - i}`, i % 2 ? person : b, [i % 2 ? b : person])
      say(`placed-agents-${9999 - i}`, i % 2 ? b : a, [i % 2 ? a : b])
    }
    // These candidates do not name the other participant. A walk must refill past them.
    for (let i = 0; i < 240; i++) say(`placed-group-${9999 - i}`, a, [person], { toGroup: group })
    // New notices still belong to the pair of an old message, outside a bounded newest direct-message part.
    for (let i = 0; i < 12; i++) say(`placed-notice-${9999 - i}`, office, [person], { aboutMessage: 'placed-person-9999' })
    for (let i = 0; i < 3; i++) {
      say(`placed-tail-person-${i}`, a, [person])
      say(`placed-tail-other-${i}`, b, [person])
      say(`placed-tail-agents-${i}`, a, [b])
    }
    for (let i = 0; i < 240; i++) {
      say(`placed-forward-a-${i}`, a, [person, b], { toGroup: group })
      say(`placed-forward-b-${i}`, b, [person, a], { toGroup: group })
    }
  })()
  const everyone = M.everybodyRegistered()
  for (const [left, right] of pairs) {
    const whole = M.conversationBetween(left, right, M.EVERY_PROJECT, everyone, M.everyMessageOfTheProjects(M.EVERY_PROJECT)).messages.map(m => m.id)
    expect(whole.length).toBeGreaterThan(PAGE * 3)
    expect(whole.some(id => id.startsWith('placed-forward-'))).toBe(false)
    cases.push({ a: left, b: right, asked: { limit: PAGE }, expected: whole.slice(-PAGE), older: true, continues: null })
    const middle = Math.floor(whole.length / 2)
    cases.push({ a: left, b: right, asked: { limit: PAGE, before: whole[middle]! }, expected: whole.slice(middle - PAGE, middle), older: true, continues: true })
    cases.push({ a: left, b: right, asked: { limit: PAGE, after: whole.at(-4)! }, expected: whole.slice(-3), older: false, continues: true })
    cases.push({ a: left, b: right, asked: { limit: PAGE, after: whole[0]! }, expected: whole.slice(-PAGE), older: true, continues: false })
    cases.push({ a: left, b: right, asked: { limit: PAGE, before: 'a-missing-cursor' }, expected: whole.slice(-PAGE), older: true, continues: false })
  }
})
afterAll(async () => { await built?.app.close(); t?.close() })
const read = (one: typeof cases[number]) => M.aPageOfTheConversation(one.a, one.b, M.everybodyRegistered(), M.EVERY_PROJECT, one.asked, list => list, at)

it('keeps whole-read rows and rowid ties for four pairs, older and opposite cursors, invalid cursors, group refills and notices', () => {
  for (const one of cases) {
    const got = read(one)
    expect(hash(got.messages.map(m => m.id)), JSON.stringify(one.asked)).toBe(hash(one.expected))
    expect(got.page.continuesFromTheCursor).toBe(one.continues)
    expect(got.page.olderRemain).toBe(true)
  }
})

/** Parentheses and top-level UNION boundaries of executed SQL, ignoring quoted strings and identifiers. */
function nodes(sql: string): { start: number; end: number }[] {
  const stack: number[] = [], out: { start: number; end: number }[] = []
  let quote = ''
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!
    if (quote) { if (c === quote) { if (sql[i + 1] === quote) i++; else quote = '' }; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(') stack.push(i)
    if (c === ')') out.push({ start: stack.pop()!, end: i })
  }
  return out
}
function parts(text: string, offset: number): { text: string; start: number }[] {
  const nested = nodes(text)
  const cuts = [...text.matchAll(/\bunion(?:\s+all)?\b/gi)].filter(m => !nested.some(n => n.start < m.index! && n.end > m.index!))
  let from = 0
  const out: { text: string; start: number }[] = []
  for (const cut of cuts) { out.push({ text: text.slice(from, cut.index), start: offset + from }); from = cut.index! + cut[0].length }
  out.push({ text: text.slice(from), start: offset + from })
  return out
}

it('bounds and orders every outer union part before merging, using the same window as the outer read', () => {
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as { all: (...args: unknown[]) => unknown }
  const original = proto.all
  const seen: { sql: string; args: unknown[] }[] = []
  proto.all = function (this: { source: string }, ...args: unknown[]) {
    if (/\)\s+"pair"\b/.test(this.source) || /\)\s+"pair"/.test(this.source)) seen.push({ sql: this.source, args })
    return original.apply(this, args)
  }
  try { for (const one of cases) read(one) } finally { proto.all = original }
  expect(seen.length, 'the candidate compound was observed').toBeGreaterThan(0)
  for (const { sql, args } of seen) {
    const root = nodes(sql).find(n => /^\s+"pair"/.test(sql.slice(n.end + 1)))!
    expect(root, sql).toBeDefined()
    const children = parts(sql.slice(root.start + 1, root.end), root.start + 1)
    expect(children.length, sql).toBeGreaterThan(1)
    const window = args.at(-1)
    for (const child of children) {
      const from = /\bfrom\s*\(/i.exec(child.text)
      expect(from, child.text).not.toBeNull()
      const opening = from!.index + from![0].lastIndexOf('(')
      const inner = nodes(child.text).find(n => n.start === opening)!
      const body = child.text.slice(inner.start + 1, inner.end)
      const capped = /\border by\b([\s\S]+)\blimit\s+\?\s*$/i.exec(body)
      expect(capped, body).not.toBeNull()
      expect(capped![1]).toMatch(/created_at/)
      expect(capped![1]).toMatch(/rowid/)
      const question = child.start + inner.start + 1 + body.lastIndexOf('?')
      const parameter = (sql.slice(0, question).match(/\?/g) ?? []).length
      expect(args[parameter], body).toBe(window)
    }
  }
})
