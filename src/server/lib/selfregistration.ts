// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION A PERSON STARTED REGISTERS ITSELF, IN ONE ACT. F15 point 2; problem pHFu8nivPZ_O.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A LIBRARY AND NOT THE ROUTE'S OWN BODY
 * ---------------------------------------------------------------------------------------
 *
 * Two doors write the same thing. `POST /api/agents/register-myself` registers a session at once while
 * the one-version window is open (P83 point 6) and a key proves the request. `POST
 * /api/roles/requests/:id/grant` admits the very same registration when it waited — because the
 * window is closed, or because the request proved nobody (decision Nc9QRT9R_IvF) — and the person
 * presses. If each wrote the agent, the
 * session and the key itself, the two would come to disagree about what a self-registration is —
 * which is the ninth invariant. So the one act lives here and both doors call it.
 *
 * ---------------------------------------------------------------------------------------
 * IT GRANTS NO CARD ABOVE WORKER
 * ---------------------------------------------------------------------------------------
 *
 * An agent cannot give itself a card (mz5ddKDITE3j). This writes the worker card and, where a higher
 * rung was asked for, files a `role_request` answered by the person so the ask reaches the person's screen.
 * When the person's own press admits a waiting registration, that press may name the card, and the
 * card is written here because the press is the person's.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY AND THE WINDOW
 * ---------------------------------------------------------------------------------------
 *
 * P83 point 5: the key is made once, only its SHA-256 is kept, and the value is answered exactly
 * once. A registration admitted at once answers it here. A registration that waited for the person's press
 * does not: its first ask was answered a one-time secret, and after the press only the ask that
 * sends that secret back is answered the key, which is the one time it is shown (finding
 * 83, mend a2; `collectAFirstKey` in src/server/lib/newkey.ts). The office records who proved itself, not a session started by a person;
 * see the route's own note.
 */

import { A_ROW_WITH_NO_ROLE_READS_AS, cardFor, type RolesDeclaration } from '@shared/roles.ts'
import { makeAnAgentKey, aKeyWasEverHeldBy, THE_AGENT_KEY_IS_SHOWN_ONCE } from './keys.ts'
import { howThisCallProvesTheKeyItMakes } from './provedkeys.ts'
import { openAttachment } from './attachments.ts'
import { createRecordWithReport, throughTheCardDoor, type Actor } from './records.ts'
import { writeTheCardMessageToOne } from './cardmessage.ts'
import { theRoleCards } from './roles.ts'
import { validateWorkArea } from './participants.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { nowStamp } from '@shared/time.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { PanelRecord } from '@shared/types.ts'

/** What a session knows about itself when it registers. Stored on a waiting row, read on admission. */
export interface WhatASessionSaysAboutItself {
  handle: string
  name: string
  runtime: string | null
  workingDirectory: string
  workArea: string[] | null
  requestedRole: string | null
  providerSession: string | null
  doing: string | null
  machine: string | null
  /**
   * THE FOLDER THIS AGENT'S SESSIONS START IN, or null because nobody asked for one to be recorded.
   *
   * It follows part (c) of a decision. It is NEVER taken from
   * `workingDirectory`: the answer to open
   * question 9. The skill has every session a person starts register itself, and a folder is often
   * shared — one folder can hold several conversations, and only one of them is the registered
   * agent's — so recording every registration's directory would hand one agent's name to other
   * people's sessions. It is recorded only when `--start-folder` asked for it, already in the one
   * spelling the office stores, because the door normalised it before this was built.
   */
  startFolder: string | null
  /**
   * THE FOLDER WHERE THIS AGENT KEEPS ITS OWN NOTES, or null because the registration named none.
   *
   * The agent record's own `notes` field. It is kept on a waiting row so that the person's press
   * records it, as the open window does. An absolute path is the rule, and `checkAgentNotes` in
   * src/server/lib/records/decision-core.ts is what refuses any other when the agent is written.
   */
  notes: string | null
}

/** The result of the one act, from either door. */
export interface SelfRegistration {
  agentRecordId: string
  /** The registry id of the agent written, which is not its handle. */
  agentId: string
  sessionRecordId: string
  handle: string
  role: string
  /** The higher rung the session asked for, or null because it asked for none. */
  askedFor: string | null
  /** The role request raised for the person, or null because none was raised. */
  requestId: string | null
  /** The key, answered once here, or null because the window was closed and the person's press admits it. */
  key: string | null
  keySays: string | null
  /** The folder recorded as the one this agent's sessions start in, or null because none was. */
  startFolder: string | null
}

/**
 * WHY A SELF-REGISTRATION WAITS FOR THE PERSON'S PRESS. Decision Nc9QRT9R_IvF; problem ZtbZNZ735RYN.
 *
 * `the-window-is-closed`: the one-version window is closed, so no registration is admitted by itself.
 * `nothing-proved-who-asked`: the window is open, and the request carried neither the person's key
 * (or a confirmed device's) nor an agent's own key, so it proved nobody.
 */
export type WhyARegistrationWaits = 'the-window-is-closed' | 'nothing-proved-who-asked'

/**
 * WHY THIS WAITING REGISTRATION WAITS. A row with no reason written on it was filed before the second
 * reason existed, when the closed window was the only thing that made a registration wait.
 */
export function whyThisRegistrationWaits(record: PanelRecord): WhyARegistrationWaits {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null) return 'the-window-is-closed'
  return (extra as Record<string, unknown>)['selfRegistrationWaits'] === 'nothing-proved-who-asked'
    ? 'nothing-proved-who-asked'
    : 'the-window-is-closed'
}

/** The marker a waiting self-registration carries, or null because this record is not one. */
export function aWaitingSelfRegistration(record: PanelRecord): WhatASessionSaysAboutItself | null {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const said = (extra as Record<string, unknown>)['selfRegistration']
  if (typeof said !== 'object' || said === null) return null
  const one = said as Record<string, unknown>
  if (typeof one['handle'] !== 'string' || typeof one['name'] !== 'string') return null
  if (typeof one['workingDirectory'] !== 'string') return null
  const asStrings = (value: unknown): string[] | null =>
    Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null
  const orNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
  return {
    handle: one['handle'],
    name: one['name'],
    runtime: orNull(one['runtime']),
    workingDirectory: one['workingDirectory'],
    workArea: asStrings(one['workArea']),
    requestedRole: orNull(one['requestedRole']),
    providerSession: orNull(one['providerSession']),
    doing: orNull(one['doing']),
    machine: orNull(one['machine']),
    startFolder: orNull(one['startFolder']),
    notes: orNull(one['notes']),
  }
}

/**
 * The `extra` a waiting row carries, so the door and the press read one shape. `collectHash` is the
 * SHA-256 of the one-time secret its first ask was answered with (finding 83, mend a2).
 */
export function theWaitingMarker(
  said: WhatASessionSaysAboutItself,
  why: WhyARegistrationWaits,
  collectHash: string,
): Record<string, unknown> {
  return { selfRegistration: { ...said }, selfRegistrationWaits: why, firstKey: { collectHash } }
}

/**
 * THE FIRST KEY A WAITING REGISTRATION'S ASKER COLLECTS. Finding 83, mend a2 (problem
 * zAI2kxjbCrTd).
 *
 * Before this, the person's press admitted a waiting registration and the next ask naming its handle
 * was answered the new agent's first key, whoever sent it. Now the first ask that files the waiting
 * row is answered a one-time secret, and the row keeps only its SHA-256 here. The press writes the
 * registry id of the agent it admitted beside it, and the ask that collects the key writes when.
 * `collectAFirstKey` in src/server/lib/newkey.ts is the one reader that hands the key over.
 */
export interface AFirstKeyToCollect {
  /** The SHA-256 of the one-time secret the first ask was answered with. */
  collectHash: string
  /** The registry id of the agent the person's press admitted, or null because nobody has pressed. */
  agent: string | null
  /**
   * The session record the person's press filed for that agent, or null: nobody has pressed, or the row was
   * admitted before the press wrote the session beside the agent.
   */
  session: string | null
  /** When the key was answered, or null because it has not been. */
  keyAnsweredAt: string | null
}

/** The first-key marker a waiting registration carries, or null because it carries none. */
export function theFirstKeyOn(record: PanelRecord): AFirstKeyToCollect | null {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const said = (extra as Record<string, unknown>)['firstKey']
  if (typeof said !== 'object' || said === null) return null
  const one = said as Record<string, unknown>
  if (typeof one['collectHash'] !== 'string' || one['collectHash'] === '') return null
  return {
    collectHash: one['collectHash'],
    agent: typeof one['agent'] === 'string' && one['agent'] !== '' ? one['agent'] : null,
    session: typeof one['session'] === 'string' && one['session'] !== '' ? one['session'] : null,
    keyAnsweredAt: typeof one['keyAnsweredAt'] === 'string' ? one['keyAnsweredAt'] : null,
  }
}

/**
 * HOW THE AGENT A WAITING REGISTRATION ADMITS COLLECTS ITS KEY, in the one sentence the admitting
 * press's note and the door's second answer both say.
 *
 * A row filed before first asks carried a secret has none. Its agent is then an old row that never
 * held a key, and the door answers it as one: its key while the key window is open, and after the
 * close only through the new-key ask. The sentence names both, each with its condition, because the
 * window can close between the press and the ask.
 */
export function howItsKeyIsCollected(record: PanelRecord): string {
  if (theFirstKeyOn(record) !== null) {
    return (
      'The key is answered once, to the ask of POST /api/agents/register-myself that sends back as "askSecret" ' +
      'the one-time secret its first ask was answered with.'
    )
  }
  return (
    'Its first ask was answered no one-time secret, because it was filed before first asks carried one. While ' +
    'the key window is open, the next ask of POST /api/agents/register-myself naming its handle is answered the ' +
    'key; once the window is closed, it asks for its first key with "newKey": true.'
  )
}

/**
 * THE ONE ACT. Write the agent, its work-area mark, its session, its card ask and its key.
 *
 * `grantTheAskedCard` is true only when a person's own press is admitting the registration and the
 * card it asked for; the press is the person's, so the card is written rather than asked for. `answerTheKey`
 * is true for a registration admitted at once; false for a waiting one, whose key is answered after
 * the press to the ask that sends back its one-time secret.
 */
export function registerTheSessionItself(input: {
  workspaceId: string
  actor: Actor
  said: WhatASessionSaysAboutItself
  grantTheAskedCard: boolean
  answerTheKey: boolean
  /** The card a person's press named, used only when `grantTheAskedCard`. */
  cardThePersonGave?: string | null
  /**
   * WHO IS RECORDED AS ITS STARTER. The person, unless an agent's own key proved the registration:
   * then that agent started it and answers for it (problem ZtbZNZ735RYN). Absent means the person.
   */
  startedBy?: ParticipantRef
}): SelfRegistration {
  const cards: RolesDeclaration = theRoleCards()
  const workerWord = A_ROW_WITH_NO_ROLE_READS_AS
  const asked = input.said.requestedRole === workerWord ? null : input.said.requestedRole
  const givenCard = input.grantTheAskedCard ? (input.cardThePersonGave ?? asked ?? workerWord) : workerWord
  const area = input.said.workArea === null ? null : validateWorkArea(input.said.workArea, cardFor(cards, workerWord))
  const starter: ParticipantRef = input.startedBy ?? { kind: 'person', id: THE_PERSON }
  const startedByRun =
    input.actor.sessionId === undefined || input.actor.sessionId === null || input.actor.sessionId === ''
      ? {}
      : { startedByRun: input.actor.sessionId }

  const created = throughTheCardDoor(() =>
    createRecordWithReport({
      workspaceId: input.workspaceId,
      kind: 'agent',
      title: input.said.name,
      data: {
        handle: input.said.handle,
        state: 'active',
        ...(input.said.runtime === null ? {} : { runtime: input.said.runtime }),
        ...(area === null ? {} : { workArea: area }),
        startedBy: starter,
        // THE FOLDER THIS AGENT'S SESSIONS START IN, when the registration asked for one, as part (c) of a
        // decision says. Absent when it did not, which is the ordinary case.
        ...(input.said.startFolder === null ? {} : { startFolder: input.said.startFolder }),
        // THE FOLDER WHERE IT KEEPS ITS OWN NOTES, when the registration named one. Absent when it did not.
        ...(input.said.notes === null ? {} : { notes: input.said.notes }),
        role: givenCard,
        cardChosenBy: input.grantTheAskedCard ? { how: 'a-starter', who: starter } : { how: 'the-rule' },
        ...startedByRun,
        // WHO REGISTERED THE WORK AREA, criterion P85. The mark says the owner registered it where the
        // person is the starter, and a starter where an agent's own key proved the registration. It
        // names the agent that did the write.
        ...(area === null
          ? {}
          : {
              extra: {
                workAreaChange: {
                  by: { type: 'agent', id: input.said.handle },
                  how: starter.kind === 'person' ? 'the-owner' : 'a-starter',
                  at: nowStamp(),
                  because: 'named when this session registered itself',
                  before: null,
                  after: area,
                },
              },
            }),
      },
      actor: input.actor,
    }),
  )

  // THE REGISTRY ROW THE RECORD WRITE MADE. Messages and requests address the agent by its registry
  // id, which is not its handle. Writing an agent record makes the row in the same call, so a record
  // with no row is a broken assumption and is said, not worked around.
  const registered = agentForRecord(created.record.id)
  if (registered === null) {
    throw new Error(
      `The agent record ${created.record.id} for "${input.said.handle}" was written and no registry row was made for it, ` +
        'so its card message has nobody to go to.',
    )
  }
  const theNewAgent: ParticipantRef = { kind: 'agent', id: registered.id }

  // AND THE ONE MESSAGE THE NEW AGENT GETS ABOUT THE CARD IT NOW HOLDS. A registration writes one,
  // as one decision lays down. It is written here, in the one act both self-registration doors
  // call, so the window-open door and the person's admission press cannot make two messages for
  // one registration. It is addressed to the agent in its own project and left unseen.
  writeTheCardMessageToOne({
    to: theNewAgent,
    workspaceId: input.workspaceId,
    role: givenCard,
    actor: input.actor,
  })

  // THE SESSION RECORD, with `ranAs` and the whole working directory. One writer of both facts.
  const opened = openAttachment({
    workspaceId: input.workspaceId,
    actor: input.actor,
    title: `${input.said.name} — the run that registered it`,
    agentId: created.record.id,
    workingDirectory: input.said.workingDirectory,
    ...(input.said.runtime === null ? {} : { runtime: input.said.runtime }),
    ...(input.said.providerSession === null ? {} : { providerSession: input.said.providerSession }),
    ...(input.said.doing === null ? {} : { doing: input.said.doing }),
    ...(input.said.machine === null ? {} : { machine: input.said.machine }),
  })

  // THE CARD ASK, WHERE THE PERSON DID NOT GIVE IT IN THIS PRESS. It is answered by the person, so
  // it lands on the person's screen through GET /api/needs-you and their own citizen's page.
  let requestId: string | null = null
  if (!input.grantTheAskedCard && asked !== null) {
    const request = createRecordWithReport({
      workspaceId: input.workspaceId,
      kind: 'role_request',
      title: `${input.said.handle} asks for the ${asked} card`,
      data: {
        asking: asked,
        holding: workerWord,
        asker: theNewAgent,
        answersTo: starter,
        because: 'asked as this session registered itself',
      },
      actor: input.actor,
    })
    requestId = request.record.id
  }

  // THE KEY, ONCE, AND ONLY WHEN THIS DOOR IS ADMITTING THE REGISTRATION NOW. A waiting one is
  // answered its key when an ask holding its one-time secret comes after the press. A key the handle
  // ever held is never minted a second time.
  const key =
    input.answerTheKey && !aKeyWasEverHeldBy('agent', input.said.handle)
      ? makeAnAgentKey(input.said.handle, howThisCallProvesTheKeyItMakes(input.actor))
      : null

  return {
    agentRecordId: created.record.id,
    agentId: registered.id,
    sessionRecordId: opened.attachment.id,
    handle: input.said.handle,
    role: givenCard,
    askedFor: asked,
    requestId,
    key,
    keySays: key === null ? null : THE_AGENT_KEY_IS_SHOWN_ONCE,
    startFolder: input.said.startFolder,
  }
}

/**
 * WHAT A RECORDED START FOLDER DOES, in one sentence pair, as part (c) of a decision
 * says.
 *
 * It follows a sentence that names the folder, so "there" means that folder. Three places say it: the
 * reply of an open-window registration, the waiting item and the admit-agent act the person reads
 * before they press, and the note of their press. They say it in these words and in no others, so the
 * three cannot come to describe the start hook differently (invariant 9).
 *
 * IT NAMES THE CONDITION AND NEVER PREDICTS THE OUTCOME. The start hook does one of four things for a
 * session started in the folder, and `whatTheStartFolderReplySays` in src/server/api/participants.ts
 * says why the words carry the whole condition and why "says why" covers the other three.
 */
export function whatAStartFolderDoes(handle: string): string {
  return (
    'When a session starts there and neither its environment nor a .env names an agent, the start hook names ' +
    `"${handle}" if "${handle}" is the only live agent registered as starting there and is not already answering ` +
    'in another live session. Otherwise it names no agent and says why.'
  )
}

/**
 * WHAT ADMITTING A WAITING REGISTRATION ALSO RECORDS, said to the person before they press, or null
 * because the person's press records no start folder.
 *
 * The waiting item on the person's page and the admit-agent act both read this. It is null when the waiting
 * registration names no start folder. It is also null when its handle is already registered: then the
 * grant door does not admit it through `registerTheSessionItself`, so the person's press records no folder, and
 * saying so would be false.
 */
export function whatAdmittingItAlsoRecords(waiting: WhatASessionSaysAboutItself): string | null {
  if (waiting.startFolder === null) return null
  // A LIVE AGENT BEARING THE HANDLE is what "already registered" means: a retired agent's handle is
  // free again (criterion I3), and admitting the waiting row then registers a new agent under it.
  if (agentByHandle(waiting.handle) !== null) return null
  return (
    `Admitting it also records "${waiting.startFolder}" as its start folder. ${whatAStartFolderDoes(waiting.handle)}`
  )
}
