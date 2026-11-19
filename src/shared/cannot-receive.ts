// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A MESSAGE TO AN AGENT WOULD BE REFUSED, AS FACTS, AND THE ONE BUILDER THAT SAYS IT.
 *
 * The message door refuses a message to an agent that cannot get it (criterion M110). The server works out
 * the facts once, in `whatStopsAMessageTo` in src/server/lib/messages.ts. This file turns those facts into
 * a sentence. The server builds it with the English reader (`sayInEnglish`), and that English is the
 * door's refusal and the `cannotReceive` an agent reads. A page builds it again from the same facts with
 * `t`, so the picker says it in the page's language. One structure, one builder, two readers (problem
 * t_ox8XMOvu7a, the way a routed line carries `said` beside `line`).
 *
 * The sentence names the agent, says it cannot get messages now and gives its state in the presence
 * dot's own word. Where the setting refuses it, the sentence names the setting by the plain name the
 * Settings page draws and says where that line is in normal mode. Then it says whom to write to instead:
 * the person, the agent's starter and the secretaries, each by the name the registry holds.
 */
import { content, type Say } from './i18n.ts'
import { gapBetween, wordWithSpacedValues } from './spacing.ts'

/**
 * The agent's state, as the presence reading gives it. `retired` and `not registered` are the red dot,
 * which the door refuses with no setting. The grey dot can read Offline, Inactive or In a terminal;
 * the door refuses each only while the setting is on.
 */
export type CannotReceiveState = 'retired' | 'not registered' | 'offline' | 'inactive' | 'in a terminal'

/** The facts one refusal is built from. Names are taken from the registry when the door asks. */
export interface TheCannotReceiveSaid {
  /** The agent the message is addressed to, by the name on its row (its handle where the row holds no name), or the stored string when no row answers. */
  agent: string
  state: CannotReceiveState
  /** True when the setting is what refuses it: the agent's dot is grey, and the setting is on. */
  bySetting: boolean
  /** The person's name as the registry holds it, or null because no name is recorded. */
  person: string | null
  /** The agent's starter, by its name (its handle where its row holds no name), or null because nobody recorded one. */
  starter: string | null
  /** Every registered secretary that is not retired, by name (handle where no name), leaving out the agent and its starter. */
  secretaries: readonly string[]
}

/** Each state's clause, as a word key. */
const STATE_WORDS = {
  retired: 'cannotReceive.state.retired',
  'not registered': 'cannotReceive.state.notRegistered',
  offline: 'cannotReceive.state.offline',
  inactive: 'cannotReceive.state.inactive',
  'in a terminal': 'cannotReceive.state.inATerminal',
} as const satisfies Record<CannotReceiveState, string>

/** "a, b or c" in the reader's language. */
function oneOf(items: readonly string[], say: Say): string {
  if (items.length <= 1) return items[0] ?? ''
  // EACH JOIN IS SPACED BY THE ONE RULE (src/shared/spacing.ts), so a Latin name beside a Chinese word
  // takes its space ("owner 或它的启动者") and two Chinese words take none.
  // Only where a Chinese character meets the join: an English mark such as ", " or " or " carries its own spaces.
  const han = /[\u3400-\u9fff\uf900-\ufaff]/u
  const gap = (before: string, after: string): string =>
    han.test(before.slice(-1)) || han.test(after.slice(0, 1)) ? gapBetween(before, after) : ''
  const join = (parts: readonly string[], mark: string): string =>
    parts.reduce((line, part) => (line === '' ? part : line + gap(line, mark) + mark + gap(mark, part) + part), '')
  const last = items[items.length - 1] ?? ''
  return join([join(items.slice(0, -1), say('cannotReceive.listJoin')), last], say('cannotReceive.listLast'))
}

/**
 * THE FIRST SENTENCE ALONE: the agent, and its state. A person's own send that answers 409 says only this, because
 * the whole line would tell the person who sent it to write to the person.
 */
export function whyTheAgentCannotReceive(said: Pick<TheCannotReceiveSaid, 'agent' | 'state'>, say: Say): string {
  return say('cannotReceive.first', { agent: content(said.agent), state: say(STATE_WORDS[said.state]) })
}

/**
 * THE ONE BUILDER. `say` is `sayInEnglish` on the server and `t` on a page.
 *
 * The person is in the list of whom to write to instead unless `withoutThePerson` is set, which the contact
 * picker sets because it draws the line for the person. A starter or a secretary nobody recorded is left out.
 * With nobody left to name, the line has no clause saying whom to write to instead.
 */
export function theCannotReceiveLine(said: TheCannotReceiveSaid, say: Say, withoutThePerson = false): string {
  const first = whyTheAgentCannotReceive(said, say)
  const setting = said.bySetting
    ? say('cannotReceive.setting', {
        setting: say('settingsPanel.computer.refuseUnanswered'),
        place: say('cannotReceive.place', { settings: say('nav.settings'), category: say('settingsCats.cat.chat') }),
      })
    : null
  const whom = withoutThePerson ? [] : [said.person === null ? say('cannotReceive.person.unnamed') : content(said.person)]
  if (said.starter !== null) whom.push(say('cannotReceive.starter', { name: content(said.starter) }))
  if (said.secretaries.length === 1) whom.push(say('cannotReceive.secretary', { name: content(said.secretaries[0] ?? '') }))
  if (said.secretaries.length > 1) {
    whom.push(say('cannotReceive.secretaries', { names: said.secretaries.map((one) => say('cannotReceive.quoted', { name: content(one) })).join(say('cannotReceive.namesJoin')) }))
  }
  const instead = whom.length === 0 ? null : wordWithSpacedValues(say, 'cannotReceive.instead', { whom: oneOf(whom, say) })
  return [first, ...(setting === null ? [] : [setting]), ...(instead === null ? [] : [instead])].join(say('cannotReceive.between'))
}
