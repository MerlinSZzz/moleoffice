// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENTENCE THE SERVER WRITES FROM ONE OF ITS CONSTANTS, IN THE PAGE'S LANGUAGE (wave 13k round 35).
 *
 * An agent's profile draws several sentences the server picks from a fixed set: the presence sentences
 * (`PRESENCE` in src/shared/lifecycle.ts), the runs panel's (`AGENT_RUNS_WORDS` in src/shared/profile.ts) and the
 * trips' (`VISITS_SAY`). A Chinese page drew them in English, as they came. Each has a word whose English IS that
 * constant (src/shared/words/en.ts reads the constant), so a sentence that arrives as one of them is drawn from
 * its word. A sentence that is none of them is drawn as it came, as `saidOnThePage` draws a code it cannot read:
 * a server newer than this page may say something this table does not know yet.
 *
 * The sentences that carry values (who is answering, the run models) do not come here: the server sends them as
 * codes with their values, and `saidOnThePage` in src/shared/dev-sayings.ts draws those.
 */
import { t, type WordKey } from '@shared/i18n.ts'
import { PRESENCE } from '@shared/lifecycle.ts'
import { IN_A_TERMINAL_WORD } from '@shared/terminals.ts'
import { agentMadeWorldNameRead } from '@shared/worlds.ts'
import { AGENT_RUNS_WORDS, VISITS_SAY, SEEN_FROM_SAYS, FILED_LATELY_SAYS, CITIZENSHIP_SAYS } from '@shared/profile.ts'

/** Each constant sentence, and the word it is drawn from. */
const WORD_OF: ReadonlyMap<string, WordKey> = new Map<string, WordKey>([
  [PRESENCE.online.sentence, 'g6b.presence.says.online'],
  [PRESENCE.stale.sentence, 'g6b.presence.says.stale'],
  [PRESENCE.offline.sentence, 'g6b.presence.says.offline'],
  [PRESENCE.inactive.sentence, 'g6b.presence.says.inactive'],
  [AGENT_RUNS_WORDS.runsSay, 'g6b.runs.says'],
  [AGENT_RUNS_WORDS.noRecordHere, 'g6b.runs.noRecordHere'],
  [AGENT_RUNS_WORDS.noRunsBound, 'g6b.runs.noRunsBound'],
  [AGENT_RUNS_WORDS.timeline, 'g6b.profile.timelineSays'],
  [AGENT_RUNS_WORDS.notReportedByThisRuntime, 'g6b.runs.notReported'],
  [AGENT_RUNS_WORDS.reportedByTheSessionHook, 'g6b.runs.reportedByHook'],
  [AGENT_RUNS_WORDS.noneRecordedOnClaudeCode, 'g6b.runs.noneRecorded'],
  [AGENT_RUNS_WORDS.runtimeNotSaid, 'g6b.runs.runtimeNotSaid'],
  [AGENT_RUNS_WORDS.noReceipt, 'g6b.runs.noReceipt'],
  [SEEN_FROM_SAYS.agent, 'g6b.profile.seenFromAgentSays'],
  [SEEN_FROM_SAYS.person, 'g6b.profile.seenFromPersonSays'],
  [FILED_LATELY_SAYS, 'g6b.profile.filedLatelySays'],
  [CITIZENSHIP_SAYS.unrecorded, 'g6b.profile.worldUnrecorded'],
  [CITIZENSHIP_SAYS.here, 'g6b.profile.worldHere'],
  [CITIZENSHIP_SAYS.named, 'g6b.profile.worldNamed'],
  [CITIZENSHIP_SAYS.officeHasNoRow, 'g6b.profile.worldOfficeHasNoRow'],
  [VISITS_SAY.everyTrip, 'g6b.profile.visitsEveryTrip'],
  [VISITS_SAY.thisWorldsTrips, 'g6b.profile.visitsThisWorld'],
])

export function sentenceOnThePage(english: string): string {
  const key = WORD_OF.get(english)
  return key === undefined ? english : t(key)
}

/** A newer server may name a presence this page does not know. Its colour cannot name it. */
export function presenceWord(reading: { word: string; colour: string }): string {
  switch (reading.word.toLowerCase()) {
    case 'answering': return t('g6b.profile.answeringWord')
    case 'inactive': return t('g6b.profile.inactive')
    case 'online': return t('g6b.profile.online')
    case 'offline': return t('g6b.profile.offline')
    case 'gone': return t('g6b.profile.gone')
    case 'stale': return t('home.agentPresence.stale')
    case IN_A_TERMINAL_WORD.toLowerCase(): return t('presence.inATerminal')
    default: return reading.word
  }
}

/**
 * A WORLD'S NAME IN THE PAGE'S LANGUAGE. A server names its own world in English from its agent's
 * handle (`agentMadeWorldName`), and a Chinese page drew "mole-office/the-api-server's world" as it
 * was stored (problem E73Do6DbqZCH, item 6). Developer mode shows the stored name, which is what the
 * API and the worlds list carry; a name the server did not make is drawn as it was written.
 */
export function worldNameOnThePage(name: string, kind: string | null, inspect: boolean): string {
  const read = inspect || kind !== 'agent-made' ? null : agentMadeWorldNameRead(name)
  if (read === null) return name
  return read.purpose === null
    ? t('g6b.profile.agentsWorld', { who: read.who })
    : t('g6b.profile.agentsWorldFor', { who: read.who, what: read.purpose })
}
