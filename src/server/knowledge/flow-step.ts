// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Send a step's attached entries and record the same answer as a knowledge query. */
import { SYSTEM_LINES } from '@shared/groups.ts'
import { KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import type { RecordOrigin } from '@shared/types.ts'
import { KNOWLEDGE_WORDS as w } from '@shared/words/en-wave-13u.ts'
import { sqlite } from '../db/client.ts'
import { fileTheProblem } from '../lib/flow-runs.ts'
import { writeASystemLineToOne } from '../lib/groups.ts'
import { listRecords, type Actor } from '../lib/records.ts'
import { placesOf } from './attachments.ts'
import { entryStatus } from './library.ts'
import { logQuery } from './query.ts'

export function sendKnowledgeForFlowStep(start: { project: string; flow: string; step: number; flowRun: string; run: string; to: () => ParticipantRef | null; origin?: RecordOrigin }): void {
  try {
    sqlite.transaction(() => {
      const entries = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_entry' }).filter(entry => placesOf(entry.data).some(place => place.project === start.project && place.flow === start.flow && place.step === start.step))
      if (entries.length === 0) return
      const to = start.to()
      if (to === null) { fileTheProblem(start.run, start.project, w.flowStepFailed, w.flowStepNoAgent, start.origin); return }
      const changes = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_change' })
      const parts = entries.map(entry => w.flowStepEntry(entry.title, entry.summary ?? '', entry.id, entryStatus(entry.id, changes) === 'waiting'))
      const actor: Actor = { type: 'system', id: moleOffice().id }
      writeASystemLineToOne(to, start.project, SYSTEM_LINES.knowledgeForAFlowStep([w.flowStepHead(start.flow, start.step, start.flowRun), ...parts].join('\n\n')), actor, { run: start.run }, { knowledgeForFlowStep: { flowRun: start.flowRun, flow: start.flow, step: start.step, entries: entries.map(entry => entry.id) } })
      logQuery('flow step', { flow: start.flow, step: start.step, flowRun: start.flowRun }, entries.map(entry => entry.id), actor, start.project, start.run)
    })()
  } catch (error) {
    fileTheProblem(start.run, start.project, w.flowStepFailed, error instanceof Error ? error.message : String(error), start.origin)
  }
}
