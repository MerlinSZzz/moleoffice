// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITE THE DELIVERY ROWS A COMMENT SHOULD ALWAYS HAVE HAD. Run once.
 *
 *   npx tsx scripts/deliver-what-was-addressed-and-never-delivered.ts            # say what it would do
 *   npx tsx scripts/deliver-what-was-addressed-and-never-delivered.ts --do-it    # do it
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A conversation is built from delivery rows. Two faults meant some messages carried a recipient
 * and no rows, so they sat in no conversation at all:
 *
 * 1. Until commit `23f271f` on 4 September 2026, `theAgentAChoiceNames` looked for a durable agent
 *    in the wrong id space, so a comment addressed by picking a run resolved to nobody. Problem
 *    `HtITS-9Xk_Vk`. Their own comment, written on 4 September at 16:24 to the POINTING agent, is the
 *    one their complaint names.
 * 2. Until 5 September 2026, who a message was to was worked out only on create, so a recipient
 *    chosen afterwards — which is what the review column does — wrote no rows either. Problem
 *    `fhxBfI7wb1nz`.
 *
 * Both are fixed in the doors. This is the rows that were never written while they were broken.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE PRODUCT'S OWN ACT, NOT A HAND EDIT
 * ---------------------------------------------------------------------------------------
 *
 * It calls `keepTheDeliveryRowsInStep` — the one reader both write doors are made of — so a row it
 * writes is exactly the row the door would have written. No SQL of its own decides anything. If the
 * reader is wrong, this is wrong in the same way, which is the point: there is one answer, not two.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It touches only messages that carry a `chosenRecipient` and have NO delivery row at all. A
 * message somebody addressed to nobody keeps no rows, because there is nobody for a mark to be
 * about. A message that already has a row is left exactly as it is — nothing is moved, nothing is
 * deleted, and no mark is advanced: every row it writes starts at `queued`, which is the truth
 * about words nothing has picked up.
 *
 * IT NAMES EVERY MESSAGE IT TOUCHED, and says nothing was found rather than printing nothing.
 * Running it twice writes nothing the second time.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW IT WRITES WAKES THE AGENT, AND THAT COSTS MONEY
 * ---------------------------------------------------------------------------------------
 *
 * A `queued` row addressed to an agent is exactly what the message worker watches for, so a comment
 * this delivers is answered the way any other message to that agent is: the worker starts a run of
 * that agent's tool. That is the point — the comment was written to be answered and never was — but
 * it is a real model call on a real message from days ago, so the script says so before it writes.
 * Measured on a copy of the live database on 5 September 2026: one row written, one run started.
 */

import { sqlite } from '../src/server/db/client.ts'
import { keepTheDeliveryRowsInStep, whoAMessageIsTo } from '../src/server/lib/messages.ts'
import { participantWord } from '../src/shared/participants.ts'

const doIt = process.argv.includes('--do-it')

interface Row {
  id: string
  workspace_id: string
  created_at: string
  title: string
  data: string
}

const rows = sqlite
  .prepare(
    "SELECT id, workspace_id, created_at, title, data FROM records " +
      "WHERE kind = 'message' AND deleted_at IS NULL " +
      "AND json_extract(data, '$.chosenRecipient') IS NOT NULL " +
      'AND NOT EXISTS (SELECT 1 FROM message_delivery md WHERE md.message_id = records.id) ' +
      'ORDER BY created_at',
  )
  .all() as Row[]

if (rows.length === 0) {
  console.log('No message in this database carries a chosen recipient and no delivery row. Nothing to write.')
  process.exit(0)
}

console.log(
  `${String(rows.length)} message(s) carry a chosen recipient and no delivery row:` +
    (doIt ? '' : '\n(saying only — run again with --do-it to write the rows)'),
)
console.log(
  'Each row starts at queued, which is what the message worker watches for, so an agent given one ' +
    'of these answers it — a real run and a real model call on a message written days ago.',
)

let wrote = 0
let addressedToNobody = 0
for (const row of rows) {
  const data = JSON.parse(row.data) as Record<string, unknown>
  const reaches = whoAMessageIsTo(data, row.workspace_id)
  if (reaches.length === 0) {
    addressedToNobody += 1
    console.log(
      `  ${row.id}  ${row.created_at}  ${row.title}\n` +
        '      the choice on it names nobody this installation holds, so it stays addressed to nobody',
    )
    continue
  }
  const who = reaches.map((one) => `${participantWord(one.kind)} "${one.id}"`).join(', ')
  if (!doIt) {
    console.log(`  ${row.id}  ${row.created_at}  ${row.title}\n      would go to ${who}`)
    continue
  }
  const stepped = keepTheDeliveryRowsInStep(row.id, data, row.workspace_id, row.created_at)
  wrote += stepped.wrote
  console.log(`  ${row.id}  ${row.created_at}  ${row.title}\n      ${String(stepped.wrote)} row(s) written, to ${who}`)
}

console.log(
  doIt
    ? `${String(wrote)} delivery row(s) written. ${String(addressedToNobody)} message(s) name nobody and were left alone.`
    : `Nothing was written. ${String(addressedToNobody)} of the ${String(rows.length)} name nobody and would be left alone.`,
)
