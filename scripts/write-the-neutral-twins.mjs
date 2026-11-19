// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITE EACH RULE'S NEUTRAL TWIN INTO THE CHAPTER RECORDS, FROM TODAY'S DEFAULT REGULATIONS. One command, run once,
 * after the change that brings the twins lands:
 *
 *   node scripts/write-the-neutral-twins.mjs              writes them
 *   node scripts/write-the-neutral-twins.mjs --check      says what it would write, and writes nothing
 *
 * A decision says each rule of a chapter record carries its neutral twin, beside the
 * rule's own words, and tools/rules-chapters.mjs writes src/config/rules/default-regulations.json
 * from the twins. The first twins
 * are the neutral words already in that file, so nothing new is written in the owner's name: for each chapter record,
 * the chapter's `neutral` and each rule's `neutral` are copied from the file's entry for that chapter and rule. Then
 * `node tools/rules-chapters.mjs` writes the same 63 rules back (tests/the-default-set-is-made-from-the-chapter-records.test.ts
 * proves it on a test world).
 *
 * EACH TWIN KNOWS THE ENGLISH IT WAS WRITTEN FROM. With each twin it writes `from`, the hash of the owner's English
 * beside it as the record holds it now (theEnglishHashOfARule, theEnglishHashOfAChapter in src/shared/office-rules.ts),
 * so a later change to the owner's rule leaves the twin visibly stale and the default regulations refuse it. Each
 * twin's Chinese carries `from` too, the hash of the twin's own English, so a twin whose English changes without its
 * Chinese is refused at the record door. A twin already on a record is never written over. One that is not today's
 * file's twin of the English as it reads now is stale: the run, with --check or without, names every stale twin,
 * writes nothing, and ends with exit code 1. A twin written before its Chinese named its English, and otherwise the
 * file's, is kept and is not stale.
 *
 * WHAT IT WRITES AND WHAT IT LEAVES. Only `neutral` on each chapter record and on each rule's text block; the owner's
 * heading, text, Chinese and every other field are sent back as they are stored. A record that already holds exactly
 * these twins is left alone, so running it twice writes nothing the second time. It refuses before writing anything
 * when a chapter of the records and the file do not agree rule for rule, and names the rules. It writes through the
 * record door, as the agent named by MOLE_OFFICE_AGENT with its own MOLE_AGENT_KEY, into the project
 * MOLE_OFFICE_WORKSPACE names, at the office MOLE_OFFICE_API names (tools/where-is-the-api.mjs reads those).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { theTwinsInTheDefaultSet, theWriteThatGivesARecordItsTwins } from '../src/shared/default-set.ts'
import { chapterNumberOf } from '../src/shared/office-rules.ts'
import { whereIsTheApi, whichWorkspace } from '../tools/where-is-the-api.mjs'
import { anAgentsToolHeaders } from '../tools/sandbox-common.mjs'
import { fetchAFullList } from '../tools/a-full-list-read.mjs'
import { THE_DEFAULT_REGULATIONS_FILE } from '../src/server/lib/read-the-default-regulations.ts'

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = whereIsTheApi()
const WORKSPACE = whichWorkspace()
const CHECKING = process.argv.includes('--check')
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  // The agent MOLE_OFFICE_AGENT names writes, with its own key when MOLE_AGENT_KEY is set; the record door refuses a name
  // nothing registered holds, so the script's own name is used only when no agent is named.
  ...anAgentsToolHeaders({ withoutAKey: process.env['MOLE_OFFICE_AGENT'] || 'scripts/write-the-neutral-twins.mjs' }),
  'x-mole-office-purpose': 'module-work',
  'x-mole-office-trace': 'the-neutral-twins',
}

const set = JSON.parse(readFileSync(join(CHECKOUT, THE_DEFAULT_REGULATIONS_FILE), 'utf8'))
const twins = theTwinsInTheDefaultSet(set)

const answer = await fetchAFullList(fetch, `${API}/api/records?kind=module&shape=full`, { headers: HEADERS })
if (!answer.ok) {
  throw new Error(`GET ${API}/api/records?kind=module&shape=full answered ${String(answer.status)}: ${(await answer.text()).slice(0, 600)} Nothing was written.`)
}
const body = await answer.json()
const records = (Array.isArray(body) ? body : (body.records ?? [])).filter((record) => chapterNumberOf(record.kind, record.data) !== null)
if (records.length === 0) {
  throw new Error(`No record in the ${WORKSPACE} project carries extra.chapter, so there is nothing to give twins to. Nothing was written.`)
}

// EVERY WRITE IS WORKED OUT BEFORE THE FIRST ONE IS SENT, so a chapter that does not agree stops the run with nothing written.
const writes = records
  .map((record) => ({ record, ...theWriteThatGivesARecordItsTwins(record, twins) }))
  .sort((a, b) => chapterNumberOf(a.record.kind, a.record.data) - chapterNumberOf(b.record.kind, b.record.data))

// A STALE TWIN STOPS THE RUN BEFORE ANYTHING IS WRITTEN, with --check or without: a twin already on a record that is not
// today's file's twin of the owner's English as it reads now. Each is named; none is written over, because rewriting it
// from the file would pin old neutral words to new English. Its neutral words are written again by hand, from the rule.
const stale = writes.flatMap(({ record, stale: names }) =>
  names.map((name) => `chapter ${String(chapterNumberOf(record.kind, record.data))} (${record.id}): ${name}`),
)
if (stale.length > 0) {
  process.stdout.write(
    `${String(stale.length)} twin(s) already on the records were written from English that has since changed, or differ ` +
      `from today's file, so nothing was written:\n${stale.map((one) => `  ${one}`).join('\n')}\n` +
      'Write each of these again from the rule as it reads now, with from set to the hash of that English.\n',
  )
  process.exit(1)
}

let written = 0
for (const { record, write } of writes) {
  const n = chapterNumberOf(record.kind, record.data)
  if (write === null) {
    process.stdout.write(`Chapter ${String(n)} (${record.id}): already holds its twins; nothing written.\n`)
    continue
  }
  const rules = write.summaryBlocks.filter((block) => block.neutral !== undefined).length
  if (CHECKING) {
    process.stdout.write(`Chapter ${String(n)} (${record.id}): would write the chapter's neutral words and ${String(rules)} rules' twins.\n`)
    continue
  }
  const sent = await fetch(`${API}/api/records/${record.id}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ dataPatch: write }) })
  if (!sent.ok) {
    throw new Error(
      `PATCH of chapter ${String(n)} (${record.id}) answered ${String(sent.status)}: ${(await sent.text()).slice(0, 600)} ` +
        `${String(written)} chapter(s) were written before it; running this again writes only what is still missing.`,
    )
  }
  written += 1
  process.stdout.write(`Chapter ${String(n)} (${record.id}): wrote the chapter's neutral words and ${String(rules)} rules' twins.\n`)
}
process.stdout.write(
  CHECKING
    ? `Checked ${String(writes.length)} chapter records in the ${WORKSPACE} project at ${API}; nothing was written.\n`
    : `Wrote twins to ${String(written)} of ${String(writes.length)} chapter records in the ${WORKSPACE} project at ${API}. ` +
        'Next: node tools/rules-chapters.mjs writes src/config/rules/default-regulations.json from them.\n',
)
