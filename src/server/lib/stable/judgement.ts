// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE JUDGEMENT DOOR (wave 13q item 6): POST /api/office/upgrades/judgements writes a judgement of a whole-suite receipt.
 * In one transaction it writes the note, opens a problem for each judged file (or links the one still open for it), and
 * tells each line about its files. It refuses before any write everything the release check would refuse later, except
 * the author test against the authorization note: that note is written afterwards, because it pins the judgement's hash.
 * Whether a pinned judgement lets an upgrade in is the one rule in src/shared/receipt-judgement.ts.
 */
import { sqlite } from '../../db/client.ts'
import { createLink, createRecord, type Actor } from '../records.ts'
import { PanelError } from '../panel-error.ts'
import { getRevisionRow } from '../get-revision-row.ts'
import { type RegisteredAgent } from '../participants.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { theRoleCards } from '../roles.ts'
import { authoredCreate } from '../stable-upgrade-notices.ts'
import { parseWholeSuiteReceipt, wholeSuiteReceiptIsGreen } from '@shared/whole-suite-receipt.ts'
import type { StableUpgradeOriginal } from '@shared/stable-upgrade-notices.ts'
import {
  JUDGED_FILE, JUDGEMENT_REASON_MOST, RECEIPT_JUDGEMENT, RECEIPT_VERDICTS, VERDICT_WORDS, receiptJudgementRequestSchema,
  theFilesThatTakeAVerdict, whyTheVerdictsDoNotFit, whyThisReceiptCannotBeJudged, type ReceiptJudgement, type ReceiptVerdict,
  type VerdictAloneOutcome,
} from '@shared/receipt-judgement.ts'

const fail = (message: string, status = 400): never => { throw new PanelError(message, status) }

/** How the door says a file ran alone, in a problem's title and in every sentence written about the file. */
const RAN_ALONE_WORDS: Record<VerdictAloneOutcome, { title: string; says: string }> = {
  red: { title: 'Red when run alone', says: 'was red when run alone' },
  'not run': { title: 'Failed in the whole run and not run alone', says: 'failed in the whole run and was not run alone' },
  'no result': { title: 'Failed in the whole run with no result alone', says: 'failed in the whole run and gave no result when run alone' },
}

/** The door's own refusals. What the release check refuses as well is in JUDGEMENT_REFUSALS, and the door says it the same way. */
export const JUDGEMENT_DOOR_REFUSALS = {
  shape: `A judgement names the receipt and, for each file, its verdict (${RECEIPT_VERDICTS.map(one => `"${one}"`).join(' or ')}), ` +
    `a reason of at most ${JUDGEMENT_REASON_MOST.toLocaleString('en')} characters and the line that owns it, each file once, and nothing else.`,
  writer: "A judgement is written by the person, with the person's key, or by an agent holding the secretary card, with its own key.",
  receipt: 'The receipt named is not an authored original whole-suite receipt in this project.',
  green: 'The receipt is green, so it needs no judgement.',
  line: (file: string) => `The line named for ${file} is not a registered agent who is still working.`,
  anotherLine: (file: string) => `The problem still open for ${file} names another line. Name that line, or close that problem first.`,
} as const

export interface FiledJudgement {
  judgement: StableUpgradeOriginal
  files: { file: string; verdict: ReceiptVerdict; problem: string; opened: 'now' | 'already' }[]
  told: { line: string; message: string }[]
}

/** The person with the person's key, or an agent holding the secretary card with its own key. */
function mayJudge(actor: Actor): boolean {
  if (actor.type === 'human') return actor.provedBy === 'the-person-key'
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key') return false
  const who = participantForActor(actor)
  const agent = who?.kind === 'agent' ? readParticipant(who) as RegisteredAgent | null : null
  return agent !== null && (actor.provedHolder === undefined || actor.provedHolder.id === agent.id) &&
    agent.role === theRoleCards().elevation.onlyThisCardCanHoldIt && agent.retired !== true
}

/** The open problem a judged file opened earlier in this project, if there is one. */
function theOpenProblemFor(project: string, file: string): { id: string; line: unknown } | null {
  const row = sqlite.prepare(`SELECT id, json_extract(data, '$.extra.${JUDGED_FILE}.line') AS line FROM records
    WHERE workspace_id = ? AND kind = 'problem' AND deleted_at IS NULL AND json_extract(data, '$.state') = 'open'
    AND json_extract(data, '$.extra.${JUDGED_FILE}.file') = ? ORDER BY created_at, id LIMIT 1`).get(project, file) as { id: string; line: unknown } | undefined
  return row ?? null
}

export function fileAReceiptJudgement(project: string, input: unknown, actor: Actor): FiledJudgement {
  const parsed = receiptJudgementRequestSchema.safeParse(input)
  if (!parsed.success) return fail(JUDGEMENT_DOOR_REFUSALS.shape)
  if (!mayJudge(actor)) return fail(JUDGEMENT_DOOR_REFUSALS.writer, 403)
  const asked = parsed.data
  let row: ReturnType<typeof getRevisionRow> | null
  try { row = getRevisionRow(asked.receipt.id, asked.receipt.seq) } catch { row = null }
  if (row === null || !authoredCreate(row) || row.workspaceId !== project || row.kind !== 'whole_suite_receipt' || row.contentHash !== asked.receipt.contentHash) {
    return fail(JUDGEMENT_DOOR_REFUSALS.receipt)
  }
  const receipt = row.data
  if (wholeSuiteReceiptIsGreen(receipt)) return fail(JUDGEMENT_DOOR_REFUSALS.green)
  const why = whyThisReceiptCannotBeJudged(receipt) ?? whyTheVerdictsDoNotFit(receipt, asked.verdicts)
  if (why !== null) return fail(why)
  const takes = theFilesThatTakeAVerdict(receipt)
  const ranAlone = new Map(takes.map(one => [one.file, one.ranAlone]))
  const order = takes.map(one => one.file)
  // Stored in the receipt's order, whatever order they were sent in.
  const verdicts = [...asked.verdicts].sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file))
  for (const one of verdicts) {
    const line = readParticipant({ kind: 'agent', id: one.line }) as RegisteredAgent | null
    if (line === null || line.retired) return fail(JUDGEMENT_DOOR_REFUSALS.line(one.file))
    const open = theOpenProblemFor(project, one.file)
    if (open !== null && open.line !== one.line) return fail(JUDGEMENT_DOOR_REFUSALS.anotherLine(one.file))
  }
  const commit = parseWholeSuiteReceipt(receipt).commit
  return sqlite.transaction((): FiledJudgement => {
    const files: FiledJudgement['files'] = []
    for (const one of verdicts) {
      const open = theOpenProblemFor(project, one.file)
      const how = RAN_ALONE_WORDS[ranAlone.get(one.file)!]
      const problem = open?.id ?? createRecord({ kind: 'problem', title: `${how.title}: ${one.file}`, workspaceId: project, actor, data: {
        state: 'open', whose_move: 'agent', seen_in: [one.file], found_by: 'A judgement of a whole-suite receipt, at a stable upgrade.',
        symptom: `${one.file} ${how.says} in whole-suite receipt ${asked.receipt.id}, at commit ${commit}. It was judged ${VERDICT_WORDS[one.verdict]}: ${one.reason}`,
        extra: { [JUDGED_FILE]: { receipt: asked.receipt, file: one.file, verdict: one.verdict, line: one.line } },
      } }).id
      files.push({ file: one.file, verdict: one.verdict, problem, opened: open === null ? 'now' : 'already' })
    }
    const kept: ReceiptJudgement = { version: 2, receipt: asked.receipt,
      verdicts: verdicts.map((one, i) => ({ file: one.file, ranAlone: ranAlone.get(one.file)!, verdict: one.verdict, reason: one.reason, problem: files[i]!.problem })) }
    const body = [
      `This judges whole-suite receipt ${asked.receipt.id}, at commit ${commit}. ${verdicts.length === 1 ? 'One file takes' : `${verdicts.length} files take`} a verdict.`,
      '',
      ...verdicts.map((one, i) => `- ${one.file} ${RAN_ALONE_WORDS[ranAlone.get(one.file)!].says}. It was judged ${VERDICT_WORDS[one.verdict]}: ${one.reason} Its problem is ${files[i]!.problem}.`),
    ].join('\n')
    const note = createRecord({ kind: 'note', title: 'Judgement of a whole-suite receipt', workspaceId: project, actor,
      data: { body, extra: { [RECEIPT_JUDGEMENT]: kept } } })
    for (const one of files) createLink({ fromId: one.problem, toId: note.id, type: 'about', actor })
    const told: FiledJudgement['told'] = []
    for (const line of [...new Set(verdicts.map(one => one.line))]) {
      const mine = files.filter((_, i) => verdicts[i]!.line === line)
      const message = createRecord({ kind: 'message', title: 'A test file of your line was judged at a stable upgrade', workspaceId: project, actor, data: {
        body: [`Judgement ${note.id} judged ${mine.length === 1 ? 'a file' : `${mine.length} files`} your line owns in whole-suite receipt ${asked.receipt.id}.`, '',
          ...mine.map(one => `- ${one.file} ${RAN_ALONE_WORDS[ranAlone.get(one.file)!].says}. It was judged ${VERDICT_WORDS[one.verdict]}. Problem ${one.problem}${one.opened === 'already' ? ', which was open already' : ''}.`)].join('\n'),
        to: [{ kind: 'agent', id: line }],
        lead: { target: { kind: 'record', recordId: note.id, workspaceId: project } },
      } })
      told.push({ line, message: message.id })
    }
    return { judgement: { id: note.id, seq: 1, contentHash: getRevisionRow(note.id, 1).contentHash }, files, told }
  })()
}
