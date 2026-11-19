// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ELEVEN COLUMNS THIS REPORT TAKES, RE-TAKEN, FOR ONE REPORT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Their evidence paragraph names eleven things: semantic level, visible words, visible regions,
 * compression ratio versus Full, source-region coverage, empty or not, right-click target
 * granularity, and whether identity, the critical conclusions, the important unfinished work and
 * the owner gates survive. They are published as a table inside report record `gGJ15W-f4sIY`.
 *
 * A PUBLISHED TABLE IS A CLAIM ABOUT A COMMIT, AND IT STOPS BEING TRUE. The one in that record was
 * taken at `fb98338`. Four commits later four of its six word counts had moved, and nothing said
 * so, because re-taking it meant reconstructing eleven columns by hand from two other instruments
 * and a definition written in the record's own prose. This file is that reconstruction, written
 * down once, so the table can be re-taken in a minute and the record corrected against a
 * measurement rather than against a memory.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO READINGS, AND WHY BOTH
 * ---------------------------------------------------------------------------------------
 *
 * WORDS, RIGHT-CLICK TARGETS AND THE DRAWN TEXT COME FROM THE BROWSER, through the JSON that
 * `tools/zoom-sweep.mjs` writes. Those are facts about a page and only a page can answer them.
 *
 * VISIBLE REGIONS AND COVERAGE COME FROM THE RESOLVER, and the definition is the record's own, §b-3:
 * a region is covered at a reading length when that length draws the region's OWN stored characters
 * — either because the block holding it is drawn whole, or because the outline copied it.
 *
 * AN OUTLINE LINE DRAWS ONE REGION AND NOT ITS CHILDREN, and this is the trap that makes coverage
 * easy to overstate by half. A `finding` region's line draws the finding's sentence; the detail
 * paragraph beneath it is a child region and is NOT on the screen. Counting descendants turns 3.8%
 * into 4.9% at reading length 2 on `OOOt4Kouc5dT` and reads as a better result. Checked against the
 * drawn text before this was written: the finding's own sentence is in it and its detail is not.
 * A BLOCK DRAWN WHOLE is the other case and there every descendant IS drawn, so its whole subtree
 * counts.
 *
 * AN AUTHORED SUMMARY COVERS NOTHING, and that is not a rounding choice. Nothing records which
 * regions a written summary stands for, so counting it would be claiming a fact nobody stored.
 * It is also why the coverage column is a floor and never a claim about understanding.
 *
 * ---------------------------------------------------------------------------------------
 * THE LAST FOUR COLUMNS ARE A SEARCH FOR ITEMS NAMED IN ADVANCE
 * ---------------------------------------------------------------------------------------
 *
 * `PRESERVED` below is the list, and it is per report because the items are. They come from
 * `design/problem-02/ACCEPTANCE.md` C10, C11 and C12 and were chosen before any of this was
 * measured. A needle is a phrase, matched case-insensitively against the words that length drew.
 *
 * THIS IS A FLOOR AND NOT A COMPREHENSION TEST. A page reading "199 199 199" would pass the 199
 * needle. C8 is a judgement the owner makes and no part of this file claims to answer it.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *     node tools/zoom-sweep.mjs tools/shots/zoom-<name>.json OOOt4Kouc5dT
 *     npx tsx tools/the-eleven-columns.ts OOOt4Kouc5dT tools/shots/zoom-<name>.json
 *
 * It prints one line of JSON per reading length and a markdown table underneath it. A report with
 * no entry in `PRESERVED` is refused rather than measured with an empty list, because zero items
 * found out of zero named would print as a clean sheet.
 */
import { readFileSync } from 'node:fs'
import { flatten, regionsOf, type Region } from '../src/shared/regions.ts'
import { reportAt } from '../src/shared/reportrungs.ts'
import { RUNGS, type Rung, type DetailSource } from '../src/shared/detail.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import { whereIsTheApiForACommand } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'

/** The items each report's low lengths are searched for, named before anything was measured. */
const PRESERVED: Record<string, { column: 'identity' | 'conclusions' | 'unfinished' | 'gates'; name: string; needles: string[] }[]> = {
  OOOt4Kouc5dT: [
    { column: 'identity', name: 'it is the round-ten report', needles: ['round ten', 'round-ten'] },
    { column: 'conclusions', name: '120 of 221 steps built whole', needles: ['120 landed whole', '120 of the 221', '120 of 221'] },
    { column: 'conclusions', name: 'six waves shipped work nobody could reach', needles: ['six waves in a row'] },
    { column: 'unfinished', name: '199 interface sentences unreviewed', needles: ['199'] },
    { column: 'unfinished', name: 'three servers still running, and the line that stops them', needles: ['kill -TERM'] },
    { column: 'gates', name: 'the twenty-seven proposals in the governance queue', needles: ['twenty-seven proposals'] },
    { column: 'gates', name: 'the three duplicate forks', needles: ['Wq2WNIJngXtd'] },
  ],
}

// THE OFFICE THIS COMMAND MEANS, through the one reader, which asks whether this copy may take the environment's
// address (problem JQ3yaANBi1JC); --api always wins.
const API = whereIsTheApiForACommand()
// WHO THIS TOOL ASKS AS, with MOLE_AGENT_KEY when set, as the other tools do (tools/sandbox-common.mjs). After the
// close a read that names nobody and carries no key is refused.
const HEADERS = { 'x-mole-office-workspace': 'panelx', ...anAgentsToolHeaders({ withoutAKey: process.env['MOLE_OFFICE_AGENT'] || 'the-eleven-columns' }) }
const id = process.argv[2] ?? 'OOOt4Kouc5dT'
const sweepPath = process.argv[3] ?? 'tools/shots/zoom-sweep.json'

const named = PRESERVED[id]
if (named === undefined) {
  throw new Error(`no items are named in advance for ${id}; add them to PRESERVED rather than measuring against an empty list`)
}

const got = (await (await fetch(`${API}/api/records/${id}`, { headers: HEADERS })).json()) as {
  record: DetailSource & { data?: { blocks?: SummaryBlock[] } }
}
const record = got.record
const blocks = record.data?.blocks ?? []
const root: Region = regionsOf({ field: 'blocks', blocks })
const all = flatten(root).filter((region) => region.id !== root.id)
const byId = new Map(all.map((region) => [region.id, region]))
const gates = all.filter((region) => region.forOwner)

interface SweepRow {
  rung: string
  words: number
  regions: number
  targets: number
  text: string
  summaryWritten: number
  summaryNone: number
  summaryUnrecorded: number
  summaryAbove: number
}
const rows = new Map((JSON.parse(readFileSync(sweepPath, 'utf8')) as SweepRow[]).filter((row) => row.rung !== undefined).map((row) => [row.rung, row]))
const fullRow = rows.get('full')
if (fullRow === undefined) throw new Error(`${sweepPath} has no row for the full reading length`)

const ON_SCREEN = ['1', '2', '3', '4', '5', 'Full (6)']
const table: string[] = [
  '| level | visible words | visible regions | ratio vs Full | source-region coverage | empty? | right-click targets | identity | conclusions | unfinished work | owner gates |',
  '|---|---:|---:|---:|---:|---|---:|---|---|---|---|',
]

for (const [at, rung] of (RUNGS as readonly Rung[]).entries()) {
  const row = rows.get(rung)
  if (row === undefined) throw new Error(`${sweepPath} has no row for ${rung}`)
  const drawing = reportAt(record, blocks, rung, 'drawn')

  const covered = new Set<string>()
  for (const index of drawing.blocks) {
    const blockId = blocks[index]?.id
    if (blockId === undefined) continue
    const prefix = `data.blocks[#${String(blockId)}]`
    for (const region of all) if (region.id === prefix || region.id.startsWith(prefix + '.')) covered.add(region.id)
  }
  const fromBlocks = covered.size

  const said = row.text.toLowerCase()
  const found = named.filter((item) => item.needles.some((needle) => said.includes(needle.toLowerCase())))
  const per = (column: string) => {
    const wanted = named.filter((item) => item.column === column)
    const hit = found.filter((item) => item.column === column)
    if (hit.length === wanted.length) return `yes — ${String(wanted.length)} of ${String(wanted.length)}`
    if (hit.length === 0) return `no — 0 of ${String(wanted.length)}`
    return `part — ${hit.map((item) => item.name).join('; ')}`
  }
  const gatesDrawn = gates.filter((gate) => flatten(gate).some((inside) => covered.has(inside.id))).length

  console.log(JSON.stringify({
    rung,
    words: row.words,
    visibleRegions: covered.size,
    fromBlocksWhole: fromBlocks,
    coverage: ((covered.size / all.length) * 100).toFixed(1) + '%',
    ratio: Number((row.words / fullRow.words).toFixed(3)),
    targets: row.targets,
    domRegionElements: row.regions,
    blocksDrawnWhole: drawing.blocks.length,
    gatesDrawn: `${String(gatesDrawn)} of ${String(gates.length)}`,
    summaryStanding: `written=${String(row.summaryWritten)} none=${String(row.summaryNone)} unrecorded=${String(row.summaryUnrecorded)} above=${String(row.summaryAbove)}`,
    missing: named.filter((item) => !found.includes(item)).map((item) => item.name),
  }))
  table.push(
    `| ${ON_SCREEN[at] ?? rung} | ${String(row.words)} | ${String(covered.size)} | ${(row.words / fullRow.words).toFixed(3)} | ${((covered.size / all.length) * 100).toFixed(1)}% | ${row.words === 0 ? '**EMPTY**' : 'non-empty'} | ${String(row.targets)} | ${per('identity')} | ${per('conclusions')} | ${per('unfinished')} | ${per('gates')} — ${String(gatesDrawn)} of ${String(gates.length)} blocks |`,
  )
}

console.log(`\n${id}: ${String(all.length)} regions under the report body, ${String(gates.length)} blocks marked forOwner\n`)
console.log(table.join('\n'))
