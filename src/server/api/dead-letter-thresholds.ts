// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { deadLetterThresholdWarrantFor, type DeadLetterThresholds } from '@shared/dead-letter-thresholds.ts'
import { readSettingHere } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { deadLetterAfterDays, deadLetterAfterCount } from '../lib/env.ts'
import { actorFrom, actorWithTheWordsItActsOn } from '../lib/http.ts'
import { theSecretaryActingForThePerson, theLastChangeOfASetting, writeDownASettingChange, getRecord } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { readParticipant } from '../db/read-participant.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { sayASecretaryChangedItForThem } from '../lib/changed-from-another-computer.ts'
import { warrantBody } from './records.ts'

const positiveWhole = z.number().refine((value) => Number.isInteger(value) && value > 0).nullable()
const bodyShape = z.strictObject({ days: positiveWhole, count: positiveWhole, because: z.string().trim().min(1).max(500),
  decision: z.string().trim().min(1).nullable().default(null), warrant: warrantBody.optional() })
const setting = 'dead-letter-thresholds'

function reading(): DeadLetterThresholds {
  const row = sqlite.prepare('SELECT dead_letter_after_days AS days, dead_letter_after_count AS count FROM installation WHERE only_row = 1').get() as
    { days: number | null; count: number | null } | undefined
  const last = theLastChangeOfASetting(setting)
  const metadata = last?.to == null ? null : JSON.parse(last.to) as { because?: string; decision?: string | null }
  const decisionId = metadata?.decision ?? null
  const decision = decisionId === null ? null : getRecord(decisionId)
  const who = last === null ? null : last.by.type === 'human'
    ? readParticipant({ kind: 'person', id: last.by.id })
    : last.by.type === 'agent' ? readParticipant({ kind: 'agent', id: last.by.id }) : null
  return {
    days: { value: deadLetterAfterDays(), chosen: row?.days ?? null, source: readSettingHere('MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS').source },
    count: { value: deadLetterAfterCount(), chosen: row?.count ?? null, source: readSettingHere('MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT').source },
    restartRequired: false,
    // These built-in values are owner-decided. No installation's personal record id is shipped.
    // The default choice follows a decision. A stored reference is supplied, never
    // guessed.
    ownerDecided: true,
    decision: decisionId === null ? null : { id: decisionId, title: decision?.title ?? null, live: decision?.kind === 'decision' && decision.deletedAt === null },
    because: metadata?.because ?? null,
    lastChange: last === null ? null : { ...last, by: { ...last.by, name: who?.name ?? null } },
  }
}

export async function deadLetterThresholdsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/dead-letter-thresholds', route('office.dead-letter-thresholds', 'remote',
    'Read the dead-letter thresholds: effective values, stored choices, sources, reason, decision reference or null when not recorded, and last change. Owner-decided values require the owner or words for the exact values. No restart is needed. Writes nothing.'), async () => reading())
  app.post('/office/dead-letter-thresholds', route('office.set-dead-letter-thresholds', 'remote',
    'Choose the dead-letter thresholds. Body {days, count, because, decision?, warrant?}: positive whole numbers or null to remove choices, a required reason, and an optional live decision reference. The owner may press; a secretary needs its own key and either a warrant or the person’s grant where this office’s list of what the grant carries says may-press. The warrant for reference is office.set-dead-letter-thresholds: followed by JSON {days:effectiveDays,count:effectiveCount,chosenDays:days,chosenCount:count,decision:decisionOrNull}. It binds the exact values, including values inherited when choices are removed. Saved choices win the legacy environment and the next check reads them; no restart is needed.'), async (req) => {
    let actor = actorFrom(req)
    const owner = thePersonIsProved(actor) || actor.theOwnersAuthority?.holds === true
    // Check identity before accepting a body. A secretary goes further only with its own key.
    if (!owner && actor.provedBy !== 'an-agent-key') {
      throw new PanelError('Only the owner, or a secretary carrying the person\'s words for these exact values, may change the dead-letter thresholds. A raise alone is not enough. Nothing was changed.', 403, undefined, undefined, undefined,
        { code: 'deadLetterThresholdsNotAllowed', values: {} })
    }
    const sent = bodyShape.safeParse(req.body)
    if (!sent.success) {
      throw new PanelError('Send days and count as positive whole numbers or null, a reason of 1 to 500 characters, and optionally a live decision reference and warrant. No other fields are accepted. Nothing was changed.', 400, undefined, undefined, undefined,
        { code: 'deadLetterThresholdsBadValue', values: {} })
    }
    const body = sent.data
    // An explicit environment bypasses database choices to read the values removal would inherit.
    const inherited = { ...process.env }
    const effective = {
      days: body.days ?? Number(readSettingHere('MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', inherited).value),
      count: body.count ?? Number(readSettingHere('MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT', inherited).value),
    }
    if (!Object.values(effective).every((value) => Number.isInteger(value) && value > 0)) {
      throw new PanelError('Removing the choices would use invalid legacy thresholds. Nothing was changed. Set positive whole numbers instead.', 400, undefined, undefined, undefined,
        { code: 'deadLetterThresholdsBadValue', values: {} })
    }
    try { actor = actorWithTheWordsItActsOn(req, body.warrant, deadLetterThresholdWarrantFor(body, effective)) }
    catch (error) {
      if (!(error instanceof PanelError)) throw error
      throw new PanelError(error.message, error.status, undefined, undefined, undefined,
        { code: 'deadLetterThresholdsBadWarrant', values: {} })
    }
    if (!owner && !theSecretaryActingForThePerson(actor)) {
      throw new PanelError('A secretary needs the person\'s words for these exact values. A key or a raise alone is not enough. Nothing was changed.', 403, undefined, undefined, undefined,
        { code: 'deadLetterThresholdsNotAllowed', values: {} })
    }
    if (body.decision !== null) {
      const decision = getRecord(body.decision)
      if (decision === null || decision.kind !== 'decision' || decision.deletedAt !== null) {
        throw new PanelError('The reference must name a live decision. Nothing was changed.', 400, undefined, undefined, undefined,
          { code: 'deadLetterThresholdsBadDecision', values: {} })
      }
    }
    sqlite.transaction(() => {
      const before = reading()
      const written = sqlite.prepare('UPDATE installation SET dead_letter_after_days = ?, dead_letter_after_count = ? WHERE only_row = 1').run(body.days, body.count)
      if (written.changes !== 1) {
        throw new PanelError('The installation row is missing. Nothing was changed. Prepare the office database before changing its settings.', 409, undefined, undefined, undefined,
          { code: 'deadLetterThresholdsNoInstallation', values: {} })
      }
      // Decision and reason live once, on the change ledger alongside the values and any warrant.
      writeDownASettingChange(actor, { setting, field: 'the dead-letter summary thresholds',
        before: { days: before.days.chosen, count: before.count.chosen, effective: { days: before.days.value, count: before.count.value }, because: before.because, decision: before.decision?.id ?? null },
        after: { days: body.days, count: body.count, effective, because: body.because, decision: body.decision }, workspaceId: workspaceOf(req) })
      sayASecretaryChangedItForThem(req, actor, 'The dead-letter summary thresholds were changed')
    })()
    return reading()
  })
}
