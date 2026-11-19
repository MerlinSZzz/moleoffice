// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MARK THE WORK-AREA OVERLAP GROUPS THAT ARE INSIDE ONE STARTER CHAIN. Run once, by hand.
 *
 *     npx tsx scripts/mark-overlap-groups-inside-one-chain.ts                      # say what it would write
 *     npx tsx scripts/mark-overlap-groups-inside-one-chain.ts --do-it               # write the line
 *     npx tsx scripts/mark-overlap-groups-inside-one-chain.ts --workspace robotics --do-it
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A decision on problem `Zf1M163BAOdk` stops the office opening a group for an overlap between an
 * agent and one in its own starter chain. Eight groups had
 * already been opened that way in one hour, each dragging the secretary in as "above" a second agent
 * by the starter chain that agent had outgrown when it was made a secretary. B stops the next ones; it
 * cannot un-open the ones already there, and there is no closed column and no migration.
 *
 * So the office says so in the group, with the one line it already uses when an overlap is over:
 * `theOverlapEnded` in src/shared/groups.ts, carrying `THE_OVERLAP_WAS_INSIDE_ONE_CHAIN` from
 * src/server/lib/claims.ts. One line per group, and running this twice writes nothing the second
 * time — it asks the group's own messages whether it has already been told.
 *
 * ---------------------------------------------------------------------------------------
 * IT NAMES BEFORE IT ACTS
 * ---------------------------------------------------------------------------------------
 *
 * With no `--do-it` it prints the groups it would mark and writes nothing. With `--do-it` it writes
 * through the office's own writer, so the line is a message record with its change row and its
 * revision like every other system line. It opens the database the operator configured, the way
 * every other `scripts/` command does, and it is meant to be run by the secretary after the merge.
 */

import { sqlite } from '../src/server/db/client.ts'
import {
  markTheWorkAreaGroupsInsideOneChain,
  theWorkAreaGroupsInsideOneChain,
} from '../src/server/lib/claims.ts'
import { moleOffice } from '../src/shared/participants.ts'

const doIt = process.argv.includes('--do-it')
const workspaceFlag = process.argv.find((one) => one.startsWith('--workspace='))
const workspace = workspaceFlag?.slice('--workspace='.length) || undefined

// THE DATABASE IS OPENED BY THE IMPORT ABOVE, and the path is the operator's own. Saying it out
// loud is what tells a reader this command is about to write into the corpus rather than a copy.
console.log(`Database: ${sqlite.name}`)
if (workspace === undefined) console.log('Project: every project')
else console.log(`Project: ${workspace}`)

const wouldMark = theWorkAreaGroupsInsideOneChain(workspace)
if (wouldMark.length === 0) {
  console.log('Nothing to mark. Every work-area group is either in one chain already told, or two chains.')
} else {
  console.log(`Would mark ${String(wouldMark.length)} group(s):`)
  for (const group of wouldMark) console.log(`  ${group.id}  (${group.workspaceId})`)
}

if (!doIt) {
  console.log('Nothing was written. Pass --do-it to write the line.')
} else {
  const marked = markTheWorkAreaGroupsInsideOneChain(
    { type: 'system', id: moleOffice().id },
    workspace,
  )
  console.log(`Wrote the line into ${String(marked.length)} group(s): ${marked.join(', ')}`)
}
