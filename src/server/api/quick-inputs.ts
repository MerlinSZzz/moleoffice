// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * QUICK INPUTS: THE OWNER'S LIST, AND AN AGENT'S ASK FOR AN INPUT FROM IT. Wave 13u, round 21.
 *
 *   GET  /api/office/quick-inputs            the owner's list, who set or cleared it and when      (anyone who may read)
 *   POST /api/office/quick-inputs            the owner sets the list, or clears it                 (the person, or a raise this office lets carry it)
 *   POST /api/terminals/quick-input          an agent asks for an input from the list, in its own terminal  (this machine)
 *   GET  /api/office/quick-inputs/asks       one agent's asks, newest first                        (anyone who may read)
 *
 * src/shared/quick-inputs.ts says when the office types and why; src/server/lib/quick-inputs.ts is the one reader and
 * writer of the list and the asks. This file reads the request: who asks, for which run, with which key.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIST IS THE OWNER'S, AND A RAISE CARRIES IT ONLY WHERE THIS OFFICE SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * The list says what the office may type into an agent's terminal with nobody pressing anything, so it is kept for the
 * owner: only a request proved to be the person sets or clears it, because an agent that could put an input on the
 * list could then ask for it. The secretary card keeps the door for the person, so an office that changed nothing
 * refuses a secretary holding the grant in the check's words; an office whose list of what the grant carries says the
 * grant presses it lets that secretary set the list, and the change row names the secretary and the grant. The read
 * answers the refusal an agent with no grant gets, so a page can say it before anybody presses; it does not ask the
 * grant, so it says the same to a secretary that holds one.
 *
 * ---------------------------------------------------------------------------------------
 * THE ASK, IN THE ORDER IT IS ANSWERED
 * ---------------------------------------------------------------------------------------
 *
 * The run is the session named by `x-mole-office-session`, which an agent's terminal carries as MOLE_OFFICE_SESSION.
 * First the run is found: no run, no such session record, a run in no office terminal, a run serving no agent or a run
 * that has ended is refused, and nothing is kept, because there is no agent's terminal to keep it against. Then the
 * three conditions are asked in their order by `decideAnAsk`, which keeps the ask whatever they answer. A typed ask is
 * kept as `typed` before the holder is asked, so a second ask from the same agent meanwhile is refused as too soon; if
 * the holder does not type the input, does not press the Enter after it, or gives no answer the office can read, the
 * ask's outcome is changed to say so.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLDER TYPES IT, AND IT IS NOT THE PERSON'S TYPING
 * ---------------------------------------------------------------------------------------
 *
 * The input goes through the holder's own request, quickInput (src/holder/index.mjs), and not through write. The
 * holder reads every write as the person's typing, so a quick input sent through write would be kept as a line the
 * person typed and offered as their last line. quickInput types the input, waits a moment and presses Enter, and reads
 * none of it as typing. It types nothing when the person has a line half typed there, because Enter would send their
 * words with it. It presses Enter itself, rather than being asked a second time, so only the holder decides whether
 * the Enter goes: it sees the person's typing as it arrives. A holder started before quick inputs does not know the
 * request and refuses it, so nothing is typed until it is restarted. The holder marks the input as typed by another
 * before it types it (wave 13s, round 87), so an Enter the person presses in its pause sends the line once, and the
 * line is never kept as the person's words nor offered as their last line.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  THE_LONGEST_QUICK_INPUT,
  THE_MOST_QUICK_INPUTS,
  theNoQuickInputListSentence,
  type AnAgentsQuickInputs,
  type QuickInputOutcome,
  type WhatAQuickInputAskIsAnswered,
  type WhatTheQuickInputListDoorSays,
} from '@shared/quick-inputs.ts'
import type { CodedRefusal, QuickInputRefusalCode } from '@shared/refusal-codes.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theHashOfTheKeyOnThisRequest, theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps an act for the
// owner. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import {
  changeTheOutcome,
  clearTheQuickInputList,
  decideAnAsk,
  setTheQuickInputList,
  theQuickInputListAsStored,
  theQuickInputsOf,
  type TheQuickInputListAsStored,
  type TheRunsKey,
} from '../lib/quick-inputs.ts'
import {
  aRaiseCarriesIt,
  getRecord,
  writeDownASettingChange,
  writeDownAnActUnderTheRaise,
  type Actor,
} from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { theOfficeTerminalOfTheRun } from '../lib/terminal-agents.ts'
import { recordAnInput, type TypedFromSource } from '../lib/terminal-typed-from.ts'
import { askTheHolderFor, theHolder } from '../lib/terminals.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { workspaceOf } from '../lib/workspaces.ts'

/** The most asks one read answers. */
const THE_MOST_ASKS_READ = 25

const READ_NOTE =
  'The owner\'s list of quick inputs: the commands the office may type into an agent\'s own terminal when that agent ' +
  'asks. Read only, and no body is read. reading is {"state":"set","inputs":[...]} or {"state":"none"}, and then says ' +
  'carries the sentence saying there is no list. setAt and setBy say who last set or cleared the list and when; a ' +
  'cleared list names who cleared it, and the list the office starts with is stamped {"kind":"migration","id":"0272"}. ' +
  'refusal is null when this caller is proved to be the person, and otherwise the words the write door refuses an agent ' +
  'with when no grant carries the press. It does not ask the grant: a secretary holding the person\'s grant may still be ' +
  'let through where this office\'s list of what the grant carries says the grant presses office.set-quick-inputs. ' +
  'While the gate who-changes-the-quick-input-list is off, refusal is null for an agent proved by its own key too, ' +
  'and for any other caller it is the words the write door refuses it with.'

const SET_NOTE =
  'Set or clear the owner\'s list of quick inputs. Body {"inputs": ["/context", ...]} replaces the whole list: each ' +
  'input begins with "/", is one line, is on the list once, and is kept trimmed; the list holds at least one. Body ' +
  '{"clear": true} leaves no list, so nothing is typed for any agent, and keeps who cleared it and when. The list is ' +
  'checked before anything is written, and a list that is not one is refused with nothing written. Only the person may ' +
  'do this; the secretary card keeps it for them, so a raise carries it only where this office\'s list of what the ' +
  'grant carries says the grant presses it, and then the change log names the secretary and the grant. Any other agent ' +
  'is refused, and the refusal names who may. While the gate who-changes-the-quick-input-list is off, any agent proved ' +
  'by its own key may also do this, and is counted, and a change it makes is written down with its name. The reply is ' +
  'the reading as it now stands.'

const ASK_NOTE =
  'An agent asks the office to type one input from the owner\'s list into its own terminal, followed by Enter. Body ' +
  '{"input": string}. The run is the one named by x-mole-office-session, as the agent\'s terminal carries it in ' +
  'MOLE_OFFICE_SESSION. A request naming no run, a run with no session record, a run in no office terminal, a run ' +
  'serving no agent or a run that has ended is refused, and nothing is typed or kept. Otherwise the ask is kept, and ' +
  'the input is typed only when all three hold, asked in this order: the ask carried the run\'s own key, the one in ' +
  'MOLE_AGENT_KEY, and nothing else counts, not even a supervisor acting for the run (403 quickInputNotTheAgent); the ' +
  'input, trimmed, is on the owner\'s list exactly as written there (409 quickInputNoList when there is no list, 409 ' +
  'quickInputNotOnTheList when it is not on it); and nothing was typed for the same agent in the last ten minutes ' +
  '(429 quickInputTooSoon, with nextAllowedAt). When all three hold and the holder typed the input and its Enter, the ' +
  'reply is 200 with the ask and nextAllowedAt. ' +
  'When the terminal holder types nothing (no holder, a terminal that has ended, a line the person has half typed ' +
  'there, a holder older than this door), the ask is kept as not-typed, the wait does not start, and the refusal is ' +
  'quickInputNotTyped with the holder\'s reason. When the holder types the input and does not press Enter after it, ' +
  'because the terminal ended or the person began typing in the moment between, the ask is kept as ' +
  'typed-without-enter, which counts towards the ten minutes, and the refusal is 502 quickInputTypedWithoutEnter. When ' +
  'the person pressed Enter on the line or cleared it in that moment, the holder does not press its Enter, which would ' +
  'be a second one: the ask is kept as typed-without-enter too, and the refusal is 409 ' +
  'terminalTypedWithoutEnterThePersonEndedTheLine, with the next time an input may be typed in its words. When ' +
  'the holder was asked and gave no answer the office can read, the office cannot tell whether the input was typed: ' +
  'the ask is kept as unknown, which counts towards the ten minutes too, and the refusal is 502 ' +
  'quickInputTypingUnknown. The input is never kept as the person\'s typing. Every kept ask is in ' +
  'GET /api/office/quick-inputs/asks.'

const ASKS_NOTE =
  'One agent\'s asks for quick inputs, newest first. Query agent=<handle or registry id>, and limit=<1 to 25>, 25 when ' +
  'it is left out. There is no offset: left says how many older asks there are. Each ask says when it was made, the ' +
  'run and terminal it named, the input, its outcome, who asked and how they proved it, and the sentence they were ' +
  'answered with. nextAllowedAt is when the next input may be typed for this agent, or null when it may be typed now.'

/** Set a whole list, or clear it. The list itself is checked by `readQuickInputList`, not here. */
const setBody = z.union([z.strictObject({ inputs: z.unknown() }), z.strictObject({ clear: z.literal(true) })])
const askBody = z.strictObject({ input: z.string() })
const asksQuery = z.strictObject({ agent: z.string().min(1), limit: z.string().optional() })

/** A body or query this door does not read: the same words `parse` gives, with a code a page can draw. */
function theBody<S extends z.ZodType>(schema: S, value: unknown, subject: string): z.output<S> {
  try {
    return parse(schema, value, subject)
  } catch (err) {
    if (!(err instanceof PanelError)) throw err
    throw new PanelError(err.message, 400, undefined, undefined, undefined, { code: 'quickInputBadBody', values: {} })
  }
}

/**
 * WHY THIS CALLER MAY NOT CHANGE THE LIST, or null when it may. The read answers these words and the write throws them,
 * so the page and the refusal cannot say different things.
 *
 * At off the gate who-changes-the-quick-input-list lets any agent its own key proves change the list too, and any other
 * caller is refused in the words that say so. The read counts nothing; the write counts the agent, below.
 */
function whyThisCallerMayNotSetTheList(actor: Actor, req: FastifyRequest): string | null {
  if (thePersonIsProved(actor)) return null
  if (gatePosition('who-changes-the-quick-input-list') !== 'block') {
    if (anAgentItsOwnKeyProves(actor) !== null) return null
    return refusedWhileTheGateIsOff(actor.id, 'who-changes-the-quick-input-list', 'change or clear the list of quick inputs').message
  }
  return theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
    refused: "The list of quick inputs is the owner's own setting",
    nothingWasDone: 'Nothing was changed.',
    whoMay:
      'Only the owner sets the list, through POST /api/office/quick-inputs. An agent may read it and may ask for an input on it from its own terminal; ' +
      'it may not change what is on it, unless it is a secretary holding the owner\'s grant and this office\'s list of ' +
      'what the grant carries says the grant presses it.',
  })
}

/** The list as stored, with the absence sentence and this caller's refusal beside it. */
function whatTheDoorSays(stored: TheQuickInputListAsStored, actor: Actor, req: FastifyRequest): WhatTheQuickInputListDoorSays {
  return {
    ...stored,
    says: stored.reading.state === 'none' ? theNoQuickInputListSentence() : null,
    refusal: whyThisCallerMayNotSetTheList(actor, req),
  }
}

/** Why an ask names no run an agent works in, before any condition is asked. Nothing is kept for these. */
type NoRun = 'no-header' | 'no-record' | 'not-in-a-terminal' | 'ended' | 'no-agent'

const THE_CODE_OF_NO_RUN: Record<NoRun, QuickInputRefusalCode> = {
  'no-header': 'quickInputNoRun',
  'no-record': 'quickInputRunNotFound',
  'not-in-a-terminal': 'quickInputRunNotInATerminal',
  ended: 'quickInputRunEnded',
  'no-agent': 'quickInputRunServesNoAgent',
}

const THE_STATUS_OF_NO_RUN: Record<NoRun, number> = {
  'no-header': 400,
  'no-record': 404,
  'not-in-a-terminal': 409,
  ended: 409,
  'no-agent': 409,
}

function noRun(why: NoRun, sentence: string): PanelError {
  return new PanelError(`${sentence} Nothing was typed and nothing was kept.`, THE_STATUS_OF_NO_RUN[why], undefined, undefined, undefined, {
    code: THE_CODE_OF_NO_RUN[why],
    values: {},
  } as CodedRefusal)
}

/** The outcomes of the three conditions that refuse, with their codes and statuses. */
type Refused = Extract<QuickInputOutcome, 'not-the-agent' | 'no-list' | 'not-on-the-list' | 'too-soon'>

const THE_CODE_OF_REFUSED: Record<Refused, QuickInputRefusalCode> = {
  'not-the-agent': 'quickInputNotTheAgent',
  'no-list': 'quickInputNoList',
  'not-on-the-list': 'quickInputNotOnTheList',
  'too-soon': 'quickInputTooSoon',
}

const THE_STATUS_OF_REFUSED: Record<Refused, number> = {
  'not-the-agent': 403,
  'no-list': 409,
  'not-on-the-list': 409,
  'too-soon': 429,
}

/** The run's key row id, as the office wrote it on the session record when it made the key, or null. */
function theRunKeyIdOf(data: Record<string, unknown>): string | null {
  const extra = data['extra']
  const id = typeof extra === 'object' && extra !== null && !Array.isArray(extra) ? (extra as Record<string, unknown>)['runKeyId'] : undefined
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * CONDITION 1: WHETHER THIS REQUEST CARRIES THE RUN'S OWN KEY, live. `theRunsOwnRequest` in lib/before-the-seal.ts asks
 * the same of the key, and also lets a supervisor acting for the run through; here that does not count, because the
 * input is typed into the run's own terminal and only the agent in it may ask.
 */
function whoseKeyThisIs(req: FastifyRequest, data: Record<string, unknown>): TheRunsKey {
  const own = theRunKeyIdOf(data)
  if (own === null) return 'the-run-has-none'
  const hash = theHashOfTheKeyOnThisRequest(req)
  const row = hash === null ? null : theHeldKeyRowWhoseHashIs(hash)
  return row !== null && row.id === own && row.revokedAt === null ? 'the-runs-own' : 'another'
}

function said(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export async function quickInputRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/quick-inputs',
    route('office.quick-inputs', 'remote', READ_NOTE),
    async (req): Promise<WhatTheQuickInputListDoorSays> => whatTheDoorSays(theQuickInputListAsStored(), actorFrom(req), req),
  )

  app.post(
    '/office/quick-inputs',
    route('office.set-quick-inputs', 'remote', SET_NOTE),
    async (req): Promise<WhatTheQuickInputListDoorSays> => {
      const actor = actorFrom(req)
      // AND THE PERSON'S RAISE, WHERE THIS OFFICE'S LIST SAYS IT CARRIES THE ACT, asked after the person so the raise is named
      // only where nothing else allowed it. The card keeps it, so a secretary holding the grant in an office that changed
      // nothing is refused here in the check's words.
      // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-quick-input-list lets any agent its
      // own key proves change the list, and counts it, and the raise is not asked. At block the raise is asked as before,
      // and a change it carries is not counted.
      const position = gatePosition('who-changes-the-quick-input-list')
      const thePerson = thePersonIsProved(actor)
      const carried = position === 'block' && !thePerson && aRaiseCarriesIt(actor)
      const keyed = !thePerson && !carried && anAgentItsOwnKeyProves(actor) !== null
      const byTheGate = keyed && gateMet('who-changes-the-quick-input-list', position!) !== 'block'
      const refusal = carried || byTheGate ? null : whyThisCallerMayNotSetTheList(actor, req)
      // At off the refusal says the gate is off and who may, which the code's words would not, so it carries no code.
      if (refusal !== null && position !== 'block') throw new PanelError(refusal, 403)
      if (refusal !== null) {
        throw new PanelError(refusal, 403, undefined, undefined, undefined, { code: 'quickInputListOnlyThePerson', values: {} })
      }
      const body = theBody(setBody, req.body ?? {}, 'The list of quick inputs:')
      const before = theQuickInputListAsStored().reading
      const stored = 'clear' in body ? clearTheQuickInputList(actor) : setTheQuickInputList(body.inputs, actor)
      // An agent the gate let through at off is written down by name, as the change log names any change.
      ;(byTheGate ? writeDownASettingChange : writeDownAnActUnderTheRaise)(actor, {
        setting: 'quick-inputs',
        field: 'the list of quick inputs',
        before,
        after: stored.reading,
        workspaceId: workspaceOf(req),
      })
      return whatTheDoorSays(stored, actor, req)
    },
  )

  app.get(
    '/office/quick-inputs/asks',
    route('office.quick-input-asks', 'remote', ASKS_NOTE),
    async (req): Promise<AnAgentsQuickInputs> => {
      const query = (req.query ?? {}) as Record<string, unknown>
      if (Object.hasOwn(query, 'offset')) {
        throw new PanelError(
          `This list of asks takes no offset. It answers the newest ${String(THE_MOST_ASKS_READ)} at most, and left says how many older ones there are.`,
          400, undefined, undefined, undefined, { code: 'quickInputAsksNoOffset', values: {} },
        )
      }
      const asked = theBody(asksQuery, query, 'Whose asks:')
      const limit = asked.limit === undefined ? THE_MOST_ASKS_READ : /^\d+$/.test(asked.limit) ? Number(asked.limit) : Number.NaN
      if (!Number.isInteger(limit) || limit < 1 || limit > THE_MOST_ASKS_READ) {
        throw new PanelError(
          `The limit is a whole number from 1 to ${String(THE_MOST_ASKS_READ)}, and "${asked.limit ?? ''}" is not.`,
          400, undefined, undefined, undefined, { code: 'quickInputAsksBadLimit', values: { most: THE_MOST_ASKS_READ } },
        )
      }
      const named = theAgentAnArrivingReferenceNames(asked.agent, 'reading')
      if (named === null) {
        throw new PanelError(`No agent answers to "${asked.agent}", so there are no asks to show.`, 404, undefined, undefined, undefined, {
          code: 'quickInputAsksUnknownAgent',
          values: {},
        })
      }
      return theQuickInputsOf({ id: named.agent.id, handle: named.agent.handle }, limit)
    },
  )

  app.post(
    '/terminals/quick-input',
    route('terminals.quick-input', 'local', { because: 'acts-on-this-machine', act: "Typing a quick input into an agent's terminal" }, ASK_NOTE),
    async (req): Promise<WhatAQuickInputAskIsAnswered> => {
      const actor = actorFrom(req)
      const body = theBody(askBody, req.body ?? {}, 'Nothing was typed:')

      // THE RUN, before any condition. Nothing is kept for a refusal here.
      const ref = said(actor.sessionId)
      if (ref === null) {
        throw noRun('no-header', 'The ask named no run: it sent no x-mole-office-session. An agent\'s terminal carries its run in MOLE_OFFICE_SESSION, and the ask sends it in that header.')
      }
      const run = getRecord(ref)
      if (run === null || run.kind !== 'session') {
        throw noRun('no-record', `No session record has the id "${ref}". The ask names its run by the id the office put in MOLE_OFFICE_SESSION.`)
      }
      const terminal = theOfficeTerminalOfTheRun(run.data)
      if (terminal === null) throw noRun('not-in-a-terminal', `Run ${run.id} does not work in one of the office's terminals, so there is no terminal to type into.`)
      if (theRunHasEnded(run.data['state'])) throw noRun('ended', `Run ${run.id} has ended, so its terminal is not an agent's to ask for.`)
      const agentId = said(run.data['servingAgentId'])
      if (agentId === null) throw noRun('no-agent', `Run ${run.id} names no agent it serves, so there is no agent to count the ten minutes for.`)

      // THE THREE CONDITIONS, asked and kept in one step (lib/quick-inputs.ts).
      const { ask, nextAllowedAt } = decideAnAsk({
        agentId,
        run: run.id,
        terminal,
        input: body.input.trim(),
        key: whoseKeyThisIs(req, run.data),
        askedBy: { kind: actor.type, id: actor.id, provedBy: actor.provedBy ?? null },
      })
      if (ask.outcome !== 'typed') {
        const outcome = ask.outcome as Refused
        throw new PanelError(ask.says, THE_STATUS_OF_REFUSED[outcome], undefined, undefined, undefined, {
          code: THE_CODE_OF_REFUSED[outcome],
          values: outcome === 'too-soon' ? { nextAllowedAt: nextAllowedAt ?? '' } : {},
        } as CodedRefusal)
      }
      const next = nextAllowedAt ?? ''

      // TYPED AS AN AGENT'S ASK, counted against where it came from (lib/terminal-typed-from.ts) once the holder took it.
      const source: TypedFromSource = {
        level: "an agent's ask",
        machine: null,
        how: "an agent's ask",
        program: null,
        account: { id: agentId, proof: "the run's key", device: null },
        agentHandle: ask.agent.handle,
      }
      const notTyped = (err: unknown, status: number): PanelError => {
        const why = err instanceof Error ? err.message : String(err)
        const says = `Nothing was typed into terminal ${terminal}: all three conditions held, and the terminal holder did not type "${ask.input}". ${why} The ten minutes did not start.`
        changeTheOutcome(ask.id, 'not-typed', says)
        return new PanelError(says, status, undefined, undefined, undefined, { code: 'quickInputNotTyped', values: {} })
      }
      const withoutEnter = (says: string): PanelError => {
        changeTheOutcome(ask.id, 'typed-without-enter', says)
        return new PanelError(says, 502, undefined, undefined, undefined, { code: 'quickInputTypedWithoutEnter', values: { nextAllowedAt: next } })
      }
      try {
        await theHolder()
      } catch (err) {
        throw notTyped(err, err instanceof PanelError ? err.status : 502)
      }
      let answer: Record<string, unknown>
      try {
        answer = await askTheHolderFor({ op: 'quickInput', terminal, input: ask.input })
      } catch (err) {
        // SENT, AND NO ANSWER THE OFFICE CAN READ: the holder was silent, closed the connection or answered something
        // that is not an answer. It may have typed the input or not, so the ask is kept as unknown, which starts the ten
        // minutes. Every other failure reached no terminal.
        if (err instanceof PanelError && (err.code === 'terminalHolderNoAnswer' || err.code === 'terminalHolderUnusable')) {
          const says =
            `The office asked the terminal holder to type "${ask.input}" into terminal ${terminal}, and it gave no answer the ` +
            `office can read: ${err.message} The office cannot tell whether the input was typed, or whether Enter was ` +
            `pressed after it. It counts towards the ten minutes, so the next input may be typed for this agent at ${next}.`
          changeTheOutcome(ask.id, 'unknown', says)
          throw new PanelError(says, 502, undefined, undefined, undefined, { code: 'quickInputTypingUnknown', values: { nextAllowedAt: next } })
        }
        // THE HOLDER'S OWN REFUSAL (a half-typed line, an ended terminal, a holder older than quick inputs) is about the
        // terminal as it stands, not about the ask, so it is a conflict and not a bad request.
        throw notTyped(err, err instanceof PanelError && err.status !== 400 ? err.status : 409)
      }
      recordAnInput(terminal, source)
      if (answer['entered'] !== true && answer['why'] === 'the-person-ended-the-line') {
        // THE PERSON ENDED THE LINE IN THE HOLDER'S PAUSE (wave 13s, round 87): their Enter sent it, or a clear took it
        // off, so the holder's Enter would have been a second one. The refusal is the one the secretary's door gives for
        // the same thing, so its values are empty, and the next time an input may be typed is in its words.
        const says =
          `"${ask.input}" was typed into terminal ${terminal}, and the holder did not press Enter after it, because the ` +
          `person pressed Enter on the line or cleared it while it waited. If they pressed Enter, the line was sent with ` +
          `anything they had typed onto it. It counts towards the ten minutes, so the next input may be typed for this ` +
          `agent at ${next}.`
        changeTheOutcome(ask.id, 'typed-without-enter', says)
        throw new PanelError(says, 409, undefined, undefined, undefined, { code: 'terminalTypedWithoutEnterThePersonEndedTheLine', values: {} })
      }
      if (answer['entered'] !== true) {
        const why =
          answer['why'] === 'the-person-typed'
            ? 'the person began typing in that terminal before the Enter, and Enter would have sent their words too'
            : answer['why'] === 'ended'
              ? 'the terminal ended before the Enter'
              : `the holder gave no reason the office knows (${JSON.stringify(answer['why'] ?? null)})`
        throw withoutEnter(
          `"${ask.input}" was typed into terminal ${terminal}, and the holder did not press Enter after it: ${why}. The input ` +
            `waits on the terminal's line without being sent. It counts towards the ten minutes, so the next input may be ` +
            `typed for this agent at ${next}.`,
        )
      }
      return { ask, nextAllowedAt: next }
    },
  )
}
