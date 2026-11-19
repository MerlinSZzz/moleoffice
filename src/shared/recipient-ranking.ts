// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE RANKING OF THE AGENTS A COMMENT ON A RECORD COULD GO TO, at item 5 of a
 * decision.
 *
 * The order is `design/round-ten/design/review.md` §5.4: the agent that started the review comes
 * first, then the agent that filed the record, then the agents that wrote to it. Problem
 * Nu0y2IKdzPcw is why it exists: the person right-clicked a passage in a report an agent filed, the composer
 * opened with nobody chosen, and they had to press again to choose that agent.
 *
 * TWO SCREENS READ IT AND NEITHER KEEPS A COPY. The right-click composer preselects the first agent
 * on it (components/agent/TalkBox.tsx), and the review pane's recipient picker lists it in this order
 * (wave 13r). If the two kept an order each, changing one would leave the other wrong with nothing
 * failing, which is the ninth invariant.
 *
 * IT EXTENDS THE RANKING THAT ALREADY EXISTS RATHER THAN REPEATING IT. `RECIPIENT_GROUNDS` in
 * `./types.ts` is the owner's order for runs (design/ROUND-SEVEN.md §C18b): filed this record, said
 * it was on this work, wrote to this record, filed under the same work, wrote to something linked.
 * §5.4 says `started this review` is "a rung of its own, above the five that exist", so the rungs
 * here are that one rung followed by `RECIPIENT_GROUNDS` itself. Filed comes before wrote because
 * that array says so, not because this file says it again.
 *
 * IT NEEDS NO DATABASE. It takes the reasons somebody has already read — the change log on the
 * server, a review's `startedByAgent` in the pane — and puts them in order. The server's reading is
 * `agentRankingFor` in src/server/lib/recipients.ts, behind `GET /api/agent/recipients/agents`.
 *
 * IT CHOOSES NOBODY. Ranking makes choosing fast; whether the first entry is chosen for somebody is
 * a separate question, answered by `theAgentToPreselect` below for the composer only. §5.2 keeps
 * the review pane from turning a rank into an assignment.
 */
import { RECIPIENT_GROUNDS } from './types.ts'
import type { WordKey } from './i18n.ts'
import type { TheCannotReceiveSaid } from './cannot-receive.ts'

/** Every rung an agent can stand on, STRONGEST FIRST. This array is the order. */
export const AGENT_RECIPIENT_RUNGS = ['started-this-review', ...RECIPIENT_GROUNDS] as const

export type AgentRecipientRung = (typeof AGENT_RECIPIENT_RUNGS)[number]

/** One reason one agent is on the ranking, as whoever read it found it. */
export interface AgentRecipientReason {
  /** The registered agent's id, never its handle: a handle can come to name somebody else. */
  agentId: string
  rung: AgentRecipientRung
  /** How many pieces of evidence stand behind it, such as change rows. Breaks ties within a rung. */
  support: number
  /** When the newest piece of that evidence was written, or null when nobody recorded a time. */
  latest: string | null
}

/** One agent on the ranking: its strongest reason, and the weaker ones it also has. */
export interface RankedAgentRecipient {
  agentId: string
  rung: AgentRecipientRung
  support: number
  latest: string | null
  /** The agent's other rungs, strongest first, each named once. Empty when it has only one. */
  alsoRungs: AgentRecipientRung[]
}

/** Where a rung stands in the order: 0 is the strongest. */
export function agentRungStrength(rung: AgentRecipientRung): number {
  return AGENT_RECIPIENT_RUNGS.indexOf(rung)
}

/**
 * THE RANKING: each agent once, on its strongest rung, strongest rung first.
 *
 * Within a rung, more evidence comes first, then the newer evidence, then the agent id. The id is not
 * evidence about either agent; it is there so the same reasons read twice come out in the same order.
 * An empty list is a real answer: nothing that was read connects an agent to the record.
 */
export function rankAgentRecipients(reasons: readonly AgentRecipientReason[]): RankedAgentRecipient[] {
  const byAgent = new Map<string, AgentRecipientReason[]>()
  for (const reason of reasons) {
    if (reason.agentId === '') continue
    const found = byAgent.get(reason.agentId)
    if (found === undefined) byAgent.set(reason.agentId, [reason])
    else found.push(reason)
  }
  const strongerFirst = (a: AgentRecipientReason, b: AgentRecipientReason): number =>
    agentRungStrength(a.rung) - agentRungStrength(b.rung) ||
    b.support - a.support ||
    (b.latest ?? '').localeCompare(a.latest ?? '')
  const ranked: RankedAgentRecipient[] = []
  for (const [agentId, mine] of byAgent) {
    const sorted = [...mine].sort(strongerFirst)
    const best = sorted[0]
    if (best === undefined) continue
    const alsoRungs = [...new Set(sorted.slice(1).map((one) => one.rung))].filter((rung) => rung !== best.rung)
    ranked.push({ agentId, rung: best.rung, support: best.support, latest: best.latest, alsoRungs })
  }
  return ranked.sort(
    (a, b) =>
      agentRungStrength(a.rung) - agentRungStrength(b.rung) ||
      b.support - a.support ||
      (b.latest ?? '').localeCompare(a.latest ?? '') ||
      a.agentId.localeCompare(b.agentId),
  )
}

/** One ranked agent as the server answers it: the ranking's entry and whether a message can reach it. */
export interface AgentRecipientOnTheWire extends RankedAgentRecipient {
  /**
   * Why a message to this agent would be refused, in the message door's own sentence, or null when
   * it would be taken. It is asked of `whyThisAgentCannotReceiveAMessage`, the rule the message door
   * itself applies, so the ranking and the door cannot disagree about who can be written to.
   */
  cannotReceive: string | null
  /**
   * The facts that sentence was built from, so a page can say it in its own language with
   * `theCannotReceiveLine` (src/shared/cannot-receive.ts). Null exactly when `cannotReceive` is null.
   * Absent from an answer built before this field existed, and then a page draws the English sentence.
   */
  cannotReceiveSaid?: TheCannotReceiveSaid | null
}

/**
 * WHICH AGENT THE COMPOSER CHOOSES BEFORE ANYBODY PRESSES: the ranking's first entry, or nobody.
 *
 * Nobody when the ranking is empty, and nobody when its first agent cannot be written to. The second
 * is deliberate: passing over the first agent to choose the second would choose somebody the
 * ranking did not put first, and a person who reads the name has no way to tell that happened.
 * The person can change the choice in either case; this only saves the press when the answer is
 * the one the ranking gives.
 */
export function theAgentToPreselect(ranking: readonly AgentRecipientOnTheWire[]): AgentRecipientOnTheWire | null {
  const first = ranking[0]
  if (first === undefined) return null
  return first.cannotReceive === null ? first : null
}

/**
 * THE SHORT WORDS FOR EACH RUNG, as the word key a screen draws. Total over the rungs, so a rung
 * added above stops this file compiling until somebody says what it is called on screen. The
 * composer draws one beside a name it chose; the review pane draws one on every row (§5.4).
 */
export const AGENT_RECIPIENT_RUNG_WORDS = {
  'started-this-review': 'r20recipient.rung.startedThisReview',
  'filed-this-record': 'r20recipient.rung.filedThisRecord',
  'said-it-was-on-this-work': 'r20recipient.rung.saidItWasOnThisWork',
  'wrote-to-this-record': 'r20recipient.rung.wroteToThisRecord',
  'filed-under-the-same-work': 'r20recipient.rung.filedUnderTheSameWork',
  'wrote-to-something-this-is-linked-to': 'r20recipient.rung.wroteToSomethingLinked',
} as const satisfies Record<AgentRecipientRung, WordKey>
