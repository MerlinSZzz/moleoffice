// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY STORED PART TEXTS THE CUT RULE WOULD REFUSE, over every report of a corpus.
 *
 * It runs the real door — `checkPartsAgainstBody` in src/server/lib/summary.ts — over one part text
 * at a time, so the answer is per text and not per report. The two texts not under test are
 * replaced by a fixed sentence that is in no report, and the part's own `covers` is kept, so the
 * only thing that can refuse is the cut rule. A refusal about coverage is expected and ignored:
 * the cut arms run before the coverage arms, so a coverage message means the cut arms passed.
 *
 * Run it against a COPY of a database, never the live one:
 *
 *     MOLE_OFFICE_DB=<copy> npx tsx scripts/corpus-cut-sweep.ts
 */
import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import Database from 'better-sqlite3'
import type { SummaryBlock } from '@shared/types.ts'
import { checkPartsAgainstBody } from '../src/server/lib/summary.ts'
import { proseFieldsOfBlocks } from '@shared/waitingclaims.ts'
import { readStoredParts } from '@shared/zoom.ts'
import { settingValue, settingWasSet } from '../src/config/settings.mjs'

const path = settingWasSet('MOLE_OFFICE_DB') ? String(settingValue('MOLE_OFFICE_DB')) : ''
if (path === '') throw new Error('MOLE_OFFICE_DB must name the database copy to read')
if (path.includes('test_claude/panelx/data')) throw new Error('that is the live database; copy it first')

/** Words no report in this corpus holds, so a text that is not under test can never be the copy. */
const NOT_IN_ANY_REPORT = 'Kumquat lantern gearbox velvet sweeps the marmalade quarry sideways every second Tuesday.'

const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(path)
if (pairingRefusal !== null) throw new Error(pairingRefusal)
const db = new Database(path, { readonly: true })
const rows = db
  .prepare(`SELECT id, workspace_id AS workspace, title, data FROM records WHERE kind = 'report' AND deleted_at IS NULL`)
  .all() as { id: string; workspace: string; title: string; data: string }[]

let reports = 0
let texts = 0
const refused: { record: string; part: string; which: string; said: string }[] = []

for (const row of rows) {
  const data = JSON.parse(row.data) as { blocks?: SummaryBlock[]; shortForms?: unknown }
  const blocks = data.blocks
  if (!Array.isArray(blocks) || blocks.length === 0) continue
  const stored = readStoredParts(data.shortForms)
  if (stored === null) continue
  reports += 1
  for (const part of stored.parts) {
    for (const which of ['heading', 'text30', 'text120'] as const) {
      texts += 1
      const one = {
        parts: {
          madeFrom: { seq: 1, contentHash: 'x' },
          writtenBy: 'agent',
          parts: [
            {
              id: part.id,
              heading: which === 'heading' ? part.heading : NOT_IN_ANY_REPORT,
              text30: which === 'text30' ? part.text30 : NOT_IN_ANY_REPORT,
              text120: which === 'text120' ? part.text120 : NOT_IN_ANY_REPORT,
              covers: part.covers,
            },
          ],
        },
      }
      try {
        checkPartsAgainstBody(one, blocks, 'report')
      } catch (error) {
        const said = error instanceof Error ? error.message : String(error)
        if (said.includes('cutting rather than written')) {
          refused.push({ record: row.id, part: part.id, which, said: said.slice(0, 200) })
        }
      }
    }
  }
}

/**
 * THE CONTROL: a text this sweep KNOWS is a copy, run the same way.
 *
 * A run that checked nothing prints 0 refusals and a run that refuses nothing prints 0 refusals,
 * and they are different facts. So one block's SECOND prose field — the case problem `PaZ8ijY_4moz`
 * was filed for — has its own opening words fed back in as a part text, through the same call. If
 * that is not refused, the sweep is not measuring the rule and the number above means nothing.
 */
const control = (() => {
  for (const row of rows) {
    const data = JSON.parse(row.data) as { blocks?: SummaryBlock[]; shortForms?: unknown }
    const blocks = data.blocks
    const stored = readStoredParts(data.shortForms)
    if (!Array.isArray(blocks) || blocks.length === 0 || stored === null) continue
    const part = stored.parts[0]
    if (part === undefined) continue
    // NOT THE FIRST FIELD OF ITS BLOCK, and not the first field of the report either, so neither of
    // the two arms that were there before this fix can be the one that catches it.
    const fields = proseFieldsOfBlocks(blocks)
    const second = fields.find(
      (one, at) => at > 0 && fields[at - 1]?.blockId === one.blockId && one.text.split(/\s+/).length >= 12,
    )
    if (second === undefined) continue
    const copied = second.text.split(/\s+/).slice(0, 12).join(' ')
    const one = {
      parts: {
        madeFrom: { seq: 1, contentHash: 'x' },
        writtenBy: 'agent',
        parts: [{ id: part.id, heading: NOT_IN_ANY_REPORT, text30: copied, text120: NOT_IN_ANY_REPORT, covers: part.covers }],
      },
    }
    try {
      checkPartsAgainstBody(one, blocks, 'report')
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error)
      if (said.includes('cutting rather than written')) return `refused, on ${row.id}: ${said.slice(0, 140)}`
    }
    return `NOT REFUSED on ${row.id}, ${second.blockId}.${second.field} — this sweep is not measuring the rule`
  }
  return 'no report in this corpus could carry the control'
})()

console.log(`database: ${path}`)
console.log(`reports with a stored by-part structure: ${String(reports)} (of ${String(rows.length)} report records)`)
console.log(`stored part texts checked: ${String(texts)}`)
console.log(`refused by the cut rule: ${String(refused.length)}`)
console.log(`control (a text that IS a copy): ${control}`)
for (const one of refused) console.log(`  ${one.record} ${one.part}.${one.which}: ${one.said}`)
db.close()
