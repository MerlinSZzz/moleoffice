// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/messages.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { ParticipantRef } from '@shared/participants.ts'

/**
 * THE MESSAGES ONE PARTICIPANT SENT OR WAS HANDED, READ ONCE (round 76 of wave 13y): the rowids `theMessagesOf` names
 * for them, as a JSON list, read once by whoever reads every project and handed to each project's read to narrow by
 * (`onlyTheirs`). Read inside each statement, the list was read again for each project and each read. On a made-up office
 * that cost the made-up agent with the most messages (22,951 of them) about 8.5 ms a time, and one start=latest of the
 * talk about 290 ms. Since round 78 the talk door reads it once for its whole answer (`theReaderOfTheTalk` in
 * src/server/lib/pixel-office.ts); until then its messages and its withdrawals each read it.
 */
export interface TheirOwnMessages {
  readonly rowids: string
}

/**
 * WHO IS READING, AS THE MESSAGE DOORS JUDGE IT, option A.
 *
 *   - The OWNER reads every message. The owner is the one person `THE_PERSON` names, and a request
 *     that named nobody is the owner (`actorFrom`).
 *   - A SECRETARY reads every message, to coordinate. Who is a secretary is `theSecretaries()`: the
 *     agents holding the secretary card, read from the role declaration. No handle is written here.
 *   - THE MESSAGE WORKER reads every message. It is a piece of the office, not an agent: it reads a
 *     message's words to hand them to the run it starts for the agent the message is addressed to.
 *     THE AGENT WORKER (`tools/agent-worker.mjs`) reads every one too, for the same reason: it runs
 *     the runs the person's conversations with agents ask for, and reads those conversations to do it.
 *   - EVERY OTHER READER reads only the messages it is a party to (`thePartiesOf`): it sent them, they
 *     were addressed or routed to it, or it was a member of the group they went to when they were
 *     sent. That is every agent that is not a secretary, and every person but the owner, as the live
 *     push already treats them (`reaches` in lib/events.ts).
 *   - THE OFFICE ITSELF is one of those other readers. It writes as `{ type: 'system', id: <its id> }`
 *     and sends as its own participant, so that actor is read as that participant: a party to the
 *     messages it sent or was handed, and to no other (wave 13s, round 77).
 *
 * `who` is null when neither registry holds the caller. Such a reader is a party to nothing.
 */
export type AMessageReader =
  | { readsEveryMessage: true; because: 'the owner' | 'a secretary' | 'the message worker' | 'the agent worker'; who: ParticipantRef | null }
  | { readsEveryMessage: false; who: ParticipantRef | null }
