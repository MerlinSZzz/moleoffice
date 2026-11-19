// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LINK THE DECISIONS A LATER DECISION ALREADY REPLACED, FROM A LIST AND FROM NOTHING ELSE. Problem ZSWftCSVUP2r.
 *
 * Since wave 13n's round 25, recording a decision asks what it replaces and the office makes the `supersedes` link
 * itself. The decisions recorded before that carry no such link, even where the later decision's own words say it
 * changed or replaced an earlier one. The case that started it is an earlier decision that two later ones
 * changed.
 * A sweep read those words and wrote a list; a person checked it. This tool writes that list's links.
 *
 * IT WRITES ONLY WHAT THE LIST NAMES. It does not read the corpus to find more, and it never touches a decision the
 * list does not name. For each line it checks, through the office's reading doors, that both ends are live decisions
 * of the named project and that the link is not there yet; a line that fails a check is reported and skipped, never
 * guessed at. Then it asks POST /api/links for a `supersedes` link from the later decision to the earlier one, where
 * the office's own guards decide whether this caller may make it.
 *
 * RUNNING IT
 *
 *   node tools/link-replaced-decisions.mjs --list <file>            says what it would write, and writes nothing
 *   node tools/link-replaced-decisions.mjs --list <file> --write    writes it
 *
 *   --list <file>      JSON lines, one per link: {"later": "<id>", "earlier": "<id>", "project": "<workspace id>"}
 *   --api <url>        where the API is; otherwise `whereIsTheApi` answers
 *
 * It sends the caller's own key (MOLE_AGENT_KEY, under MOLE_OFFICE_AGENT). It is safe to run twice: a link that is
 * already there is reported as there and not asked for again.
 */

import { readFileSync } from 'node:fs'

import { whereIsTheApi } from './where-is-the-api.mjs'
import { anAgentsToolHeaders, askTheOffice } from './sandbox-common.mjs'

function flag(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

/** The list's lines, each checked for shape. A line that is not one is a fault of the list, and nothing is written. */
export function readTheList(text) {
  const lines = text.split('\n').map((one) => one.trim()).filter((one) => one !== '')
  return lines.map((line, index) => {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      throw new Error(`Line ${index + 1} of the list is not JSON. Nothing was written.`)
    }
    for (const key of ['later', 'earlier', 'project']) {
      if (typeof row[key] !== 'string' || row[key].trim() === '') {
        throw new Error(`Line ${index + 1} of the list has no "${key}". Nothing was written.`)
      }
    }
    if (row.later === row.earlier) throw new Error(`Line ${index + 1} names ${row.later} as replacing itself. Nothing was written.`)
    return { later: row.later.trim(), earlier: row.earlier.trim(), project: row.project.trim() }
  })
}

/** Each project's links, read once through GET /api/links, which answers the project's whole graph. */
const linksOf = new Map()
async function theLinksOf(api, headers, project) {
  if (!linksOf.has(project)) {
    const got = await askTheOffice(api, '/api/links', { headers, workspace: project })
    if (got.status !== 200 || !Array.isArray(got.body?.links)) {
      throw new Error(`The links of project ${project} could not be read (${String(got.status)}). Nothing more was written.`)
    }
    linksOf.set(project, got.body.links)
  }
  return linksOf.get(project)
}

/** What one line needs, read through the reading doors: both ends live decisions of the project, and no link yet. */
async function whatThisLineNeeds(api, headers, line) {
  const ends = []
  for (const id of [line.later, line.earlier]) {
    const got = await askTheOffice(api, `/api/records/${encodeURIComponent(id)}`, { headers, workspace: line.project })
    const record = got.body?.record
    if (got.status !== 200 || record === undefined) return { skip: `${id} could not be read (${String(got.status)})` }
    if (record.kind !== 'decision') return { skip: `${id} is a ${record.kind}, not a decision` }
    if (record.deletedAt !== null) return { skip: `${id} is deleted` }
    if (record.workspaceId !== line.project) return { skip: `${id} is in project ${record.workspaceId}, not ${line.project}` }
    ends.push(record)
  }
  const rows = await theLinksOf(api, headers, line.project)
  const there = rows.some((one) => one.type === 'supersedes' && one.fromId === line.later && one.toId === line.earlier)
  if (there) return { there: true }
  return { write: true, later: ends[0], earlier: ends[1] }
}

export async function linkTheReplacedDecisions({ api, list, write, headers, say = console.log }) {
  linksOf.clear()
  const done = { written: 0, there: 0, skipped: 0, refused: 0 }
  for (const line of list) {
    const needs = await whatThisLineNeeds(api, headers, line)
    if (needs.skip !== undefined) {
      done.skipped += 1
      say(`skipped  ${line.later} -> ${line.earlier}: ${needs.skip}`)
      continue
    }
    if (needs.there === true) {
      done.there += 1
      say(`there    ${line.later} -> ${line.earlier}`)
      continue
    }
    if (!write) {
      say(`would    ${line.later} ("${needs.later.title}") supersedes ${line.earlier} ("${needs.earlier.title}")`)
      continue
    }
    const made = await askTheOffice(api, '/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      workspace: line.project,
      body: { fromId: line.later, toId: line.earlier, type: 'supersedes' },
    })
    if (made.status === 201 || made.status === 200) {
      linksOf.get(line.project)?.push({ fromId: line.later, toId: line.earlier, type: 'supersedes' })
      done.written += 1
      say(`written  ${line.later} -> ${line.earlier}`)
    } else {
      done.refused += 1
      say(`refused  ${line.later} -> ${line.earlier}: ${String(made.status)} ${String(made.body?.error ?? made.why ?? '').slice(0, 300)}`)
    }
  }
  return done
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const path = flag('list')
  if (path === undefined) {
    console.error('Name the list: --list <file>. Nothing was written.')
    process.exit(2)
  }
  const list = readTheList(readFileSync(path, 'utf8'))
  const write = process.argv.includes('--write')
  const done = await linkTheReplacedDecisions({
    api: flag('api') ?? whereIsTheApi(),
    list,
    write,
    headers: anAgentsToolHeaders({}),
  })
  console.log(
    `${String(list.length)} lines: ${write ? `${String(done.written)} written` : 'nothing written (add --write)'}, ${String(done.there)} already there, ` +
      `${String(done.skipped)} skipped, ${String(done.refused)} refused.`,
  )
  process.exit(done.refused > 0 || done.skipped > 0 ? 1 : 0)
}
