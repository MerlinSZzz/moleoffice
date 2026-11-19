#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILE A LINE'S REQUIREMENT FILE AS BACKLOG ITEMS, ONE RECORD PER ITEM, WITH EACH ITEM'S WORDS WHOLE.
 *
 *     node tools/file-backlog-items.mjs --line <line> --file <requirement file> --placed-by <person|agent>:<registry id> [--dry-run]
 *
 * HOW THE FILE IS READ. A line that starts with an item's number and a full stop ("2. ", "   10b. ") starts that item.
 * A line that starts with an item's number and a comma ("10b, ..."), or with "Item <number>", is a later word on that
 * item and goes to it, wherever it stands in the file. Any other line goes to the item the line above it went to. The
 * lines before the first item, and the blank lines, are not filed, and the tool says which they were. An item's words
 * are its lines, byte for byte, joined in the file's order.
 *
 * WHAT IS FILED. One backlog_item per item, as the run, through its own office tool (tools/office-request.mjs): the
 * title "Item <number> of line <line>", the words in why, the item's place in the file as order, who placed it, and a
 * source naming the file, the item's lines and the file's SHA-256. No state, done-when or date is written, since the
 * file does not say them; the office lists state and doneWhen as missing until somebody sets them.
 *
 * WHAT IS REFUSED, before anything is filed: a number used for two items, a later word on an item the file does not
 * hold, a file with no item, a line that already has items in this office, and an office with no backlog door. A
 * refusal part way names the records already filed. After filing, the line is read back and each item's words are
 * compared with the file's; a line too long to read back whole at the office tool's limit is refused as cut.
 * --dry-run says what each line would go to, and asks the office nothing.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NO_BACKLOG_DOOR } from '../src/shared/round-chapters/backlog.ts'
import { askTheOffice, withoutKeys } from './office-request.mjs'

const USAGE = 'Usage: node tools/file-backlog-items.mjs --line <line> --file <requirement file> --placed-by <person|agent>:<registry id> [--dry-run]'

const STARTS_AN_ITEM = /^\s*(\d+[a-z]?)\.(?:\s|$)/
const A_LATER_WORD = /^\s*(?:(\d+[a-z]?),\s|Item (\d+[a-z]?)\b)/

/** @param {string} why @returns {never} */
function refused(why) {
  throw new Error(`The requirement file was refused: ${why}. Nothing was filed.`)
}

/** @param {string} why @returns {never} */
function nothingFiled(why) {
  throw new Error(`Filing was refused: ${why}. Nothing was filed.`)
}

/**
 * The items of a requirement file, in its order, with the lines each holds, counted from 1.
 * @param {string} text
 * @returns {{ items: { number: string, lines: number[], words: string }[], notFiled: number[], blank: number[] }}
 */
export function readARequirementsFile(text) {
  const lines = text.split('\n')
  // A final newline ends the last line; it is not a line of its own.
  if (lines.at(-1) === '') lines.pop()
  /** @type {Map<string, number>} */
  const starts = new Map()
  for (const [i, line] of lines.entries()) {
    const number = STARTS_AN_ITEM.exec(line)?.[1]
    if (number === undefined) continue
    if (starts.has(number)) refused(`item ${number} is numbered twice, at lines ${String(starts.get(number))} and ${String(i + 1)}`)
    starts.set(number, i + 1)
  }
  if (starts.size === 0) refused('the file holds no numbered item')
  /** @type {Map<string, number[]>} */
  const held = new Map([...starts.keys()].map((number) => [number, []]))
  /** @type {number[]} */ const notFiled = []
  /** @type {number[]} */ const blank = []
  /** @type {string | null} */
  let current = null
  for (const [i, line] of lines.entries()) {
    if (line.trim() === '') {
      blank.push(i + 1)
      continue
    }
    const later = A_LATER_WORD.exec(line)
    const number = STARTS_AN_ITEM.exec(line)?.[1] ?? later?.[1] ?? later?.[2]
    if (number !== undefined && !held.has(number)) refused(`line ${String(i + 1)} names item ${number}, which the file does not hold`)
    if (number !== undefined) current = number
    if (current === null) notFiled.push(i + 1)
    else held.get(current)?.push(i + 1)
  }
  const items = [...held].map(([number, at]) => ({ number, lines: at, words: at.map((n) => lines[n - 1]).join('\n') }))
  return { items, notFiled, blank }
}

/** "line 10", "lines 4-5", "lines 3, 11", "lines 14, 25-30, 38". @param {number[]} lines */
export function whichLines(lines) {
  /** @type {string[]} */
  const runs = []
  for (let i = 0; i < lines.length; i++) {
    let j = i
    while (j + 1 < lines.length && lines[j + 1] === (lines[j] ?? 0) + 1) j++
    runs.push(i === j ? String(lines[i]) : `${String(lines[i])}-${String(lines[j])}`)
    i = j
  }
  return `${lines.length === 1 ? 'line' : 'lines'} ${runs.join(', ')}`
}

/**
 * @param {{ file: string, line: string, placedBy: { kind: string, id: string }, dryRun?: boolean,
 *   env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, say?: (line: string) => void }} input
 * @returns {Promise<{ filed: { number: string, id: string }[] }>}
 */
export async function fileBacklogItems({ file, line, placedBy, dryRun = false, env = process.env, fetchImpl = fetch, say = (one) => process.stdout.write(`${one}\n`) }) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    return refused(`${file} could not be read (${error instanceof Error ? error.message : String(error)})`)
  }
  const read = readARequirementsFile(text)
  const sha = createHash('sha256').update(text).digest('hex')
  const ask = (/** @type {import('./office-request.mjs').ARequest} */ request) => askTheOffice(request, { fetchImpl, env })
  const the = (/** @type {{ body: string }} */ answer) => {
    try {
      return JSON.parse(answer.body)
    } catch {
      return { error: answer.body.slice(0, 500) }
    }
  }

  say(`Line ${line}, from ${file} (SHA-256 ${sha}, ${String(Buffer.byteLength(text))} bytes):`)
  if (read.notFiled.length > 0) say(`Not filed: ${whichLines(read.notFiled)}, before the first item.`)
  if (read.blank.length > 0) say(`Not filed, as blank: ${whichLines(read.blank)}.`)
  if (dryRun) {
    for (const item of read.items) say(`- item ${item.number}: ${whichLines(item.lines)} (${String(Buffer.byteLength(item.words))} bytes)`)
    say('This was a dry run: the office was asked nothing, and nothing was filed.')
    return { filed: [] }
  }

  const path = `/api/backlog?line=${encodeURIComponent(line)}`
  const before = await ask({ method: 'GET', path })
  const answered = the(before)
  if (before.status === 404 && String(answered.error ?? '').startsWith(NO_BACKLOG_DOOR)) {
    nothingFiled('this office has no backlog door (it answered GET /api/backlog with 404)')
  }
  if (before.status !== 200 || !Array.isArray(answered.items)) nothingFiled(`the office answered ${String(before.status)} for line ${line}'s backlog: ${String(answered.error ?? before.body.slice(0, 500))}`)
  if (answered.items.length > 0) nothingFiled(`line ${line} already has ${String(answered.items.length)} item${answered.items.length === 1 ? '' : 's'} in this office`)

  /** @type {{ number: string, id: string }[]} */
  const filed = []
  for (const [i, item] of read.items.entries()) {
    const data = { line, number: item.number, placedBy, why: item.words, order: i + 1, source: `${file} ${whichLines(item.lines)}, SHA-256 ${sha}` }
    const sent = await ask({ method: 'POST', path: '/api/records', body: { kind: 'backlog_item', title: `Item ${item.number} of line ${line}`, data } })
    const record = the(sent)
    if (sent.status !== 201 || typeof record.record?.id !== 'string') {
      const left = read.items.slice(i).map((one) => one.number)
      throw new Error(
        `Filing line ${line} stopped part way: item ${item.number} was refused (${String(sent.status)}): ${String(record.error ?? sent.body.slice(0, 500))} ` +
          `Filed before it: ${filed.length === 0 ? 'nothing' : filed.map((one) => `item ${one.number} as record ${one.id}`).join(', ')}. ` +
          `${left.length === 1 ? 'Item' : 'Items'} ${left.join(left.length === 2 ? ' and ' : ', ')} ${left.length === 1 ? 'was' : 'were'} not filed.`,
      )
    }
    filed.push({ number: item.number, id: record.record.id })
    say(`- item ${item.number}: ${whichLines(item.lines)} (${String(Buffer.byteLength(item.words))} bytes), record ${String(record.record.id)}`)
  }

  // READ BACK: the line in the office's order, each item's words as the file has them. The office tool hides every run
  // of 64 hex characters in what it hands back, so the file's words are compared with the same runs hidden. It is read
  // at the office tool's own limit: a line whose answer is longer comes back cut, and is refused as cut.
  const after = await ask({ method: 'GET', path })
  const back = the(after)
  const got = Array.isArray(back.items) ? back.items.map((/** @type {any} */ one) => [one.id, one.data?.why]) : null
  const want = filed.map((one, i) => [one.id, withoutKeys(read.items[i]?.words ?? '')])
  if (after.status !== 200 || after.cut || JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`Line ${line} was filed, but reading it back did not give the file's items in the file's order with their words whole (${String(after.status)}${after.cut ? ', cut' : ''}). Filed: ${filed.map((one) => `item ${one.number} as record ${one.id}`).join(', ')}.`)
  }
  say(`Filed ${String(filed.length)} items, read back in the file's order with their words whole. No state, done-when or date was written, since the file does not say them; set them on each record.`)
  return { filed }
}

/**
 * The command. Answers its exit code: 0 filed or a dry run, 1 refused, 2 a command it does not take.
 * @param {string[]} argv
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, say?: (line: string) => void }} [options]
 */
export async function main(argv, { env = process.env, fetchImpl = fetch, say = (one) => process.stderr.write(`${one}\n`) } = {}) {
  /** @type {Record<string, string>} */
  const given = {}
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]
    if (word === '--dry-run') dryRun = true
    else if ((word === '--line' || word === '--file' || word === '--placed-by') && argv[i + 1] !== undefined) given[word] = argv[++i] ?? ''
    else {
      say(`The command does not take ${String(word)}.\n${USAGE}`)
      return 2
    }
  }
  for (const flag of ['--line', '--file', '--placed-by']) {
    if (!given[flag]?.trim()) {
      say(`Give ${flag}.\n${USAGE}`)
      return 2
    }
  }
  const placed = /^(person|agent):(\S+)$/.exec(given['--placed-by'] ?? '')
  if (placed === null) {
    say(`--placed-by is who placed the items, as kind:id, the kind person or agent and the id their registry row answers to.\n${USAGE}`)
    return 2
  }
  try {
    await fileBacklogItems({ file: given['--file'] ?? '', line: given['--line'] ?? '', placedBy: { kind: placed[1] ?? '', id: placed[2] ?? '' }, dryRun, env, fetchImpl, say })
    return 0
  } catch (error) {
    say(error instanceof Error ? error.message : String(error))
    return 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2), { say: (one) => process.stdout.write(`${one}\n`) }))
