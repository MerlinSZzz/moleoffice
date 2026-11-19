// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { BACKLOG_ITEM_KIND, BACKLOG_ITEM_STATES } from '../backlog.ts'
import { roundDeclaration } from './delivery.ts'
import { bytes, givesWhole, REQUIREMENTS_FILE, type BacklogEntry, type RoundBacklog } from './manifest.ts'

/** The launcher's own ask: `status` is null when nothing answered, and `why` then says why. */
export type AskTheOffice = (path: string) => Promise<{ status: number | null; body?: unknown; why?: string }>

function fail(why: string): never { throw new Error(`Round backlog: ${why}. Nothing was started.`) }
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * WHERE AN ITEM STANDS, in the words the office prints for its state, or that nobody recorded one. The word lists are
 * loaded here and not at the top: they bring about 170 modules, and the launcher imports this file at every start, so a
 * command started while the office restarts asked for its process row only after the office was listening again.
 */
async function theStandingOf(): Promise<(item: { state?: BacklogEntry['state'] }) => string> {
  const { stateWord } = await import('../words.ts')
  return item => (item.state === undefined ? 'state not recorded' : stateWord(item.state, 'normal', BACKLOG_ITEM_KIND).text)
}

/** What an office from before the backlog door answers for it: a 404 that names the door it does not have. */
export const NO_BACKLOG_DOOR = 'No such endpoint: GET /api/backlog'

/**
 * A ROUND READS ONLY ITS OWN ITEMS. When the brief's declaration names a line, the round start asks the office for that
 * line's backlog, before anything is filed or started, and the round is given the items in the line's order in place
 * of the requirement file. A declaration that names items gets those items whole and every other item in one line; one
 * that names none gets every item that is not done or dropped whole. Null when the declaration names no line, and then
 * nothing is asked.
 *
 * An office that holds no items for the line, or has no backlog door, is said in one sentence that points to the file,
 * and the round starts. Any other answer stops the start, by name.
 */
export async function readTheRoundsBacklog(input: { brief: string; request: AskTheOffice }): Promise<RoundBacklog | null> {
  const { line, items: named } = roundDeclaration(input.brief)
  if (line === null) return null
  const reply = await input.request(`/api/backlog?line=${encodeURIComponent(line)}`)
  const said = (body: unknown) => (object(body) && typeof body['error'] === 'string' ? body['error'] : JSON.stringify(body ?? null))
  if (reply.status === null) fail(`nothing answered for the backlog of line ${line}: ${reply.why ?? 'no reason was given'}`)
  if (reply.status === 404 && said(reply.body).startsWith(NO_BACKLOG_DOOR)) {
    return theFile(line, named, `This office has no backlog door (it answered GET /api/backlog with 404), so this round reads its items in ${REQUIREMENTS_FILE} as before.`)
  }
  if (reply.status !== 200) fail(`the office refused the backlog of line ${line} (${reply.status}): ${said(reply.body)}${reply.why === undefined ? '' : ` (${reply.why})`}`)
  const items = readTheItems(line, reply.body)
  if (items.length === 0) return theFile(line, named, `The office holds no backlog items for line ${line}, so this round reads its items in ${REQUIREMENTS_FILE} as before.`)
  for (const number of named) {
    if (!items.some(item => item.number === number)) fail(`the declaration names item ${number}, which the office's backlog of line ${line} does not hold`)
  }
  const standing = await theStandingOf()
  const entries: BacklogEntry[] = items.map(item => ({ id: item.id, number: item.number, ...(item.state === undefined ? {} : { state: item.state }), given: givesWhole(named, item) }))
  const whole = items.filter((_, i) => entries[i]!.given)
  const others = entries.filter(entry => !entry.given)
  const text = [
    `This round's items come from the office's backlog of line ${line}, in the line's order, in place of ${REQUIREMENTS_FILE}: ` +
      (named.length > 0 ? 'the items its declaration names are given whole, and every other item of the line is named in one line.' : 'every item that is not done or dropped is given whole, and the others are named in one line.'),
    ...whole.map(item => [
      `Item ${item.number} (${standing(item)}, record ${item.id}):`,
      item.why ?? 'No words are recorded for this item.',
      ...(item.doneWhen === undefined ? [] : [`Done when: ${item.doneWhen}`]),
      ...(item.files === undefined ? [] : [`Files: ${item.files.join(', ')}`]),
    ].join('\n')),
    ...(others.length === 0 ? [] : [[`The other items of line ${line}:`, ...others.map(one => `- ${one.number}: ${standing(one)}, record ${one.id}`)].join('\n')]),
  ].join('\n\n')
  return { line, named, from: 'the office', items: entries, text, bytes: bytes(text) }
}

function theFile(line: string, named: string[], text: string): RoundBacklog {
  return { line, named, from: 'the file', items: [], text, bytes: bytes(text) }
}

interface AnItem { id: string; number: string; state?: BacklogEntry['state']; why?: string; doneWhen?: string; files?: string[] }

/** The door's answer, read strictly: anything not in its shape, or of another line, is not guessed at. */
function readTheItems(line: string, body: unknown): AnItem[] {
  const unreadable = (why: string): never => fail(`the office's answer for the backlog of line ${line} could not be read (${why})`)
  if (!object(body) || body['line'] !== line || !Array.isArray(body['items'])) unreadable('it is not {line, items} for this line')
  const items = (body as { items: unknown[] }).items.map((record, i): AnItem => {
    const data = object(record) ? record['data'] : undefined
    if (!object(record) || typeof record['id'] !== 'string' || !object(data) || data['line'] !== line) unreadable(`item ${i + 1} is not a record of this line`)
    const d = data as Record<string, unknown>
    const optional = (key: string, ok: (value: unknown) => boolean) => {
      if (d[key] !== undefined && !ok(d[key])) unreadable(`item ${i + 1} has an unreadable ${key}`)
      return d[key]
    }
    const number = d['number']
    if (typeof number !== 'string' || number.trim() === '' || number !== number.trim()) unreadable(`item ${i + 1} has no number`)
    return {
      id: (record as Record<string, unknown>)['id'] as string,
      number: number as string,
      state: optional('state', value => (BACKLOG_ITEM_STATES as readonly unknown[]).includes(value)) as AnItem['state'],
      why: optional('why', value => typeof value === 'string') as string | undefined,
      doneWhen: optional('doneWhen', value => typeof value === 'string') as string | undefined,
      files: optional('files', value => Array.isArray(value) && value.every(one => typeof one === 'string')) as string[] | undefined,
    }
  })
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.number)) fail(`the office's backlog of line ${line} holds item ${item.number} twice`)
    seen.add(item.number)
  }
  return items
}
