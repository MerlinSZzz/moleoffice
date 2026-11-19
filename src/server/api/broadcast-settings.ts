// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S OWN BROADCAST SETTINGS, OVER HTTP.
 *
 *   GET  /api/participants/agent/:id/broadcast-settings   the four settings, each with whose it is and its last change
 *   POST /api/participants/agent/:id/broadcast-settings   {"on"?,"leadMinutes"?,"reminderWords"?,"because"}
 *
 * A secretary sets for itself whether it broadcasts, how many minutes before each of its times the reminder goes,
 * and its own words in place of the reminder's check and tidy. Its times have their own door, POST
 * /api/participants/agent/:id/broadcast-times, and the GET here reads them back beside the other three.
 *
 * WHO MAY SET THEM is who may change an agent's areas: the person, the agent that started it, or a holder of the
 * secretary card, so a secretary sets its own with its own key. The rule is `whoMayChangeItsAreas` in
 * lib/participants.ts, and nothing here repeats it. The values and their refusals are `writeTheBroadcastSettings`
 * in lib/broadcast.ts; what is here is the door.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import {
  THE_BROADCAST_SETTINGS,
  theBroadcastSettingsOf,
  writeTheBroadcastSettings,
  type ABroadcastSetting,
  type TheBroadcastSettings,
} from '../lib/broadcast.ts'
import { readParticipant } from '../db/read-participant.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { whoMayChangeItsAreas, type RegisteredAgent } from '../lib/participants.ts'
import { nothingWrittenSentence } from '../lib/records.ts'
import { route } from '../lib/route.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { nowStamp } from '@shared/time.ts'
import { readStoredWord } from '@shared/i18n.ts'

const READ_NOTE =
  'Read one secretary’s four broadcast settings: whether it broadcasts ("on"), its times, how many minutes before ' +
  'each time its reminder goes ("leadMinutes"), and its own words in place of the reminder’s check and tidy ' +
  '("reminderWords"). Each says what the reminders use, whether that is its own ("its-own") or the office’s ' +
  'default ("the-offices-default"), the default, what is wrong with a stored value that cannot be read, and the ' +
  'last change with who, how, when and why, and what the setting stored before and after it: {"stored":true,' +
  '"value":…}, or {"stored":false} when it stored nothing and read the office’s. Every earlier change is in the agent ' +
  'record’s revisions, named in ' +
  '"earlierChanges". "settings" is null when the office holds no broadcast schedule for the agent.'

const WRITE_NOTE =
  'The person, the starter or a holder of the secretary card, which includes the secretary itself with its own key, ' +
  'sets one secretary’s own broadcast settings, recording who, how, when and why. Body ' +
  '{"on"?:true|false,"leadMinutes"?:1-720,"reminderWords"?:"…","because":"…"}, naming at least one setting. ' +
  '"on":false sends it no reminder and never pauses it, and keeps its times for when it is turned on again. ' +
  '"leadMinutes" is how many minutes before each time its reminder goes, and how long the one more reminder waits ' +
  'after it. "reminderWords" (at most 2,000 characters) replace the reminder’s check and tidy and nothing else: ' +
  'the slot, the report template and how a report is recognised, unreadable times, open checklist items, untold ' +
  'hand-backs and the backup sentence all stay. null for any of the three reads the office’s again. A setting ' +
  'that already holds the value asked is not written, and when none changes the reply says nothing was written. ' +
  'Refused: another agent, a request naming no setting, a value that is wrong, and an agent with no running ' +
  'broadcast schedule. The times have their own door, POST /api/participants/agent/:id/broadcast-times.'

const idParams = z.object({ id: z.string().min(1) })
// THE VALUES ARE CHECKED BY `writeTheBroadcastSettings`, so a wrong one is refused in the sentence the reminders also
// use when a stored value cannot be read, and not in the schema's own words.
const settingsBody = z.strictObject({
  on: z.unknown().optional(),
  leadMinutes: z.unknown().optional(),
  reminderWords: z.unknown().optional(),
  because: z.string().min(1),
})

/** What one setting now is, in a sentence, read from the same reading the GET answers. */
function whatItNowIs(name: ABroadcastSetting, read: NonNullable<TheBroadcastSettings['settings']>): string {
  switch (name) {
    case 'on':
      return read.on.value
        ? `This secretary broadcasts at its times${read.on.whose === 'its-own' ? '' : ', which is the office’s default'}.`
        : readStoredWord('broadcast.says.off')
    case 'leadMinutes':
      return read.leadMinutes.whose === 'its-own'
        ? `Its reminder comes ${read.leadMinutes.value} minutes before each of its times.`
        : `Its reminder comes the office’s ${read.leadMinutes.value} minutes before each of its times, the setting MOLE_OFFICE_BROADCAST_LEAD_MINUTES.`
    case 'reminderWords':
      return read.reminderWords.whose === 'its-own'
        ? 'Its reminder says its own words in place of the office’s check and tidy, and every sentence of fact stays.'
        : 'Its reminder says the office’s check and tidy.'
  }
}

export async function broadcastSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/participants/agent/:id/broadcast-settings', route('participant.read', 'remote', READ_NOTE), async (req) => {
    const { id } = parse(idParams, req.params, 'The agent')
    const named = theAgentAnArrivingReferenceNames(id, 'reading')
    if (named === null) throw new PanelError(`No agent answers to "${id}".`, 404)
    return { agent: named.agent.id, ...theBroadcastSettingsOf(named.agent.id) }
  })

  app.post('/participants/agent/:id/broadcast-settings', route('participant.change', 'remote', WRITE_NOTE), async (req) => {
    const { id } = parse(idParams, req.params, 'The agent')
    const body = parse(settingsBody, req.body ?? {}, 'The broadcast settings')
    const actor = actorFrom(req)
    const named = theAgentAnArrivingReferenceNames(id, 'writing')
    if (named === null) throw new PanelError(`No agent answers to "${id}". Nothing was written.`, 404)
    const row = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
    const how = whoMayChangeItsAreas(row, actor, 'broadcast settings')
    if (body.because.trim() === '') throw new PanelError('Say why the broadcast settings changed. Nothing was written.', 400)
    const caller = participantForActor(actor)
    const { because, ...asked } = body
    const done = writeTheBroadcastSettings(row.id, asked, { by: { type: actor.type, id: caller?.id ?? actor.id }, how, at: nowStamp(), because }, actor)
    const read = theBroadcastSettingsOf(row.id)
    if (done.changed.length === 0) {
      // A REPEAT WRITES NOTHING, and says so in the sentence the times door and the other settings doors give.
      const nothingWritten = nothingWrittenSentence({ kind: 'already-stored' })
      return { agent: row, changed: [], changes: {}, settings: read.settings, nothingWritten, says: nothingWritten }
    }
    const settings = read.settings as NonNullable<TheBroadcastSettings['settings']>
    const said = THE_BROADCAST_SETTINGS.filter((name) => done.changed.includes(name)).map((name) => whatItNowIs(name, settings))
    if (done.alreadyHeld.length > 0) said.push(`${done.alreadyHeld.join(', ')} already held the value asked, so nothing was written for ${done.alreadyHeld.length === 1 ? 'it' : 'them'}.`)
    return { agent: row, changed: done.changed, changes: done.changes, settings, says: said.join(' ') }
  })
}
