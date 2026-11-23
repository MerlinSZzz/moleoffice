// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALL PRESS: THE AGENT TOOLS THE OFFICE RUNS, AND ONE TERMINAL THAT INSTALLS THE TICKED ONES. Wave 13u, round 3.
 *
 *   GET  /api/harnesses                 each agent tool: installed or not, its version, the newest version
 *        ?part=list                     each agent tool as declared, with no program or registry asked
 *   POST /api/harnesses/install         raise or sign a checklist to install the ticked tools, or, on the person's own
 *                                       message naming a tool not installed, open its first install at once
 *   GET  /api/harnesses/:id/signed-in   whether one tool is signed in, as its own status command says
 *   POST /api/harnesses/:id/key         give a key the person typed to one tool's own login, on standard input
 *   POST /api/harnesses/:id/sign-in     start one tool's own account sign-in, and answer the one address a page may open
 *        /code                          give that sign-in, once, the code its sign-in page showed the person
 *   POST /api/harnesses/:id/set-up      write the person's ask to set up one tool, as his message to the secretary
 *                                       the office picks
 *
 * The owner's review, at its point 2, asks for one press that installs the ticked harnesses and for
 * a check for upgrades. Which tools there are, their official installers and where their
 * newest versions are read
 * is declared once, in src/server/lib/harnesses.ts.
 *
 * WHAT THE PRESS DOES. It opens one terminal through the terminal holder, as POST /api/terminals does, in the
 * person's home, running /bin/sh with a script made only from the declaration: for each ticked tool, a line saying
 * which installer runs and the page that states it, then that installer, unchanged. At the end the script tells the
 * person to sign in to each program themselves. The person watches it, and can type into it when an installer asks
 * something. Nothing from the request reaches the script but the names of tools, each checked against the
 * declaration before anything opens. No login command runs, and no key is read or passed: the terminal gets the
 * environment every terminal gets (theEnvironmentATerminalGets), which holds no key.
 *
 * WHO. The person, proved as for the terminal doors, or a secretary whose press the grant check allows. This office's
 * list of what the grant carries answers for each door. The card keeps the list read and the install for the person by
 * default; it does not name the signed-in reading, so the grant carries that one unless this office's list keeps it. An
 * install under the grant raises and signs as the secretary, never as the person. Every door here is kept to this machine.
 *
 * AND EVERY SECRETARY SIGNS FIRST. Wave 13u round 13: a uniform change to the tool every agent runs on reaches
 * everyone, so the press raises a readiness checklist (src/server/lib/readiness.ts). The person's press is the
 * person's signature. A secretary's press under the grant is its own signature, so the person must still sign at
 * the person's own door. The terminal opens when everyone has signed. Until then the door answers 409, naming who has
 * not signed. A waiting press under the grant is written down here because it writes no change row and answers no 2xx.
 *
 * BUT THE PERSON'S OWN MESSAGE OPENS A FIRST INSTALL (wave 13u round 242). The person asked that setting up a tool take
 * only his ask, then typing and confirming. So a press may carry the id of the person's message that asked for the
 * tool. When the person wrote it, proved as the person, within 24 hours, its words name every tool pressed, none is
 * installed, and it has not opened a first install of that tool before, the terminal opens at once with no signatures
 * (`theFirstInstallAMessageOpens`, src/server/lib/setting-up-an-agent-tool.ts). Otherwise the press waits for the
 * signatures as before, and the answer says why the message did not open it.
 *
 * NOTHING IS INSTALLED INSIDE A SANDBOX. Every press is refused there, 409 harnessInASandbox, before the message is read
 * and before the readiness gate, so it writes nothing (`nothingIsInstalledInASandbox`).
 *
 * THE KEY, THE SIGN-IN AND ITS CODE ARE THE PERSON'S ALONE, asked exactly as the provider key doors ask (`permitted`,
 * src/server/api/provider-key-setup.ts). No grant carries them, because a key the person types must not pass through
 * an agent. The signed-in reading answers only yes, no or why it could not be read, so it is asked as the list read
 * is: the person, or a secretary where this office's list says the grant carries it.
 *
 * THE SET UP PRESS IS THE PERSON'S ALONE TOO (wave 13u round 242), because it writes his own message. No grant carries
 * it, and a secretary pressing under the grant is refused 403 harnessSetUpIsThePersons. The secretary and the message
 * are src/server/lib/the-set-up-press.ts. With no secretary it writes nothing and refuses 409 harnessNoSecretary. It has
 * no sandbox refusal, as the signed-in reading, the key and the sign-in have none: only the install press refuses inside
 * a sandbox, and the press installs nothing itself. A secretary that installs on the message meets that refusal there.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aHarnessRefusal, listTheHarnesses, openTheInstallTerminal, readTheHarnesses, theHarness, theHarnessesAsked, type Harness } from '../lib/harnesses.ts'
import { throughTheReadinessGate } from '../lib/readiness.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, writeDownAPressOutsideTheLog, type Actor } from '../lib/records.ts'
import { THE_PERSON } from '@shared/person.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { route } from '../lib/route.ts'
import { theEnvironmentATerminalGets } from '../lib/terminals.ts'
import { theUsersPathAsTheDoorSaysIt } from '../../config/the-users-own-path.mjs'
import { workspaceOf } from '../lib/workspaces.ts'
import { isLanguage, type Language } from '@shared/i18n.ts'
import { THE_DOOR_OF_THE_DUTY, theSecretaryASetUpGoesTo, writeTheAsk } from '../lib/the-set-up-press.ts'
import { everySecretarysDuties } from './secretary-duties.ts'
import {
  aSignInIsRunning,
  giveTheCodeToTheSignIn,
  giveTheKeyToTheToolsOwnLogin,
  nothingIsInstalledInASandbox,
  startTheToolsOwnSignIn,
  theFirstInstallAMessageOpens,
  theSignInOf,
} from '../lib/setting-up-an-agent-tool.ts'
import { permitted } from './provider-key-setup.ts'

/**
 * THE REFUSAL FOR A CALLER THAT IS NEITHER THE PERSON NOR ALLOWED UNDER THE GRANT. The list read, the install press and
 * the signed-in reading ask `thePersonOrTheGrant`, and the person-only check inventory sorts them as carried.
 */
function onlyThePerson(actor: Actor, doing: string): void {
  try {
    assertThePersonIsProved(
      actor,
      doing,
      'Only the person or a secretary holding the person\'s grant may read or install the agent tools the office runs. ' +
        'The secretary presses only where this office\'s list of what the grant carries says so. Any other agent is ' +
        'refused, and nothing from a sandbox counts as the person.',
    )
  } catch (err) {
    if (err instanceof PanelError) throw aHarnessRefusal('harnessesOnlyThePerson', err.message, err.status, err.reason)
    throw err
  }
}

/**
 * THE PERSON, OR THEIR GRANT WHERE THIS OFFICE'S LIST SAYS IT CARRIES THE DOOR, as `onlyThePersonMay` in api/visitors.ts
 * asks it. The check refuses in its own words where the list keeps the door; an agent with no grant gets the old refusal.
 */
function thePersonOrTheGrant(actor: Actor, doing: string): void {
  if (thePersonIsProved(actor) || aRaiseCarriesIt(actor)) return
  onlyThePerson(actor, doing)
}

const installPress = z.object({ harnesses: z.array(z.string()), message: z.string().min(1).max(64).optional() }).strict()
const theListQuery = z.object({ part: z.literal('list').optional() }).strict()
const theKeyGiven = z.strictObject({ provider: z.string().min(1).max(100).optional(), key: z.string().min(1).max(4096) })
const theSetUpAsked = z.strictObject({ language: z.custom<Language>(isLanguage, 'a language the office has words in').optional() })

/** The code door's body: the id the sign-in's start answered, and the code, one line of printable characters. */
const theCodeGiven = z.strictObject({ signIn: z.string().min(1).max(64), code: z.string().trim().min(1).max(2048).regex(/^[\x21-\x7e]+$/) })

/** The code door's refusal of a body it cannot read. It never repeats the body, which holds the code. */
const A_CODE_OF_ANOTHER_SHAPE =
  "The code was not sent in the form this door reads: the sign-in's id, and the code as one line of printable characters, at most 2048. Nothing was sent to the sign-in."

/** The key door's refusal of a body it cannot read. It never repeats the body, which holds the key. */
const A_KEY_OF_ANOTHER_SHAPE =
  "The key was not sent in the form this door reads: the tool's provider, where it has more than one, and the key, at most 4096 characters. No key was sent."

/** The one agent tool a door's address names, or a refusal saying nothing was done. */
function theToolNamed(params: unknown, nothingDone: string): Harness {
  const id = (params as { id?: unknown }).id
  const one = typeof id === 'string' ? theHarness(id) : undefined
  if (one === undefined) throw aHarnessRefusal('harnessNoSuchTool', `No agent tool the office runs has that name. ${nothingDone}`)
  return one
}

/** Answers that hold what the person typed, or a sign-in's code, are kept by no cache and sent to no other page. */
const NOT_KEPT = { 'cache-control': 'no-store', pragma: 'no-cache', 'referrer-policy': 'no-referrer' }

export async function terminalHarnessRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/harnesses',
    route(
      'harnesses.list',
      'local',
      { because: 'acts-on-this-machine', act: 'Reading the office\'s agent tools' },
      "The person reads each agent tool the office runs: its vendor's install command and the page that states it, or why there is none; where its program is on the PATH the office's terminals get and the version it says it is; the newest version its vendor publishes, or why that could not be read; and whether a newer one exists, said only when both versions were read. A program's version is asked again when its file changes. An installed version kept more than ten minutes, or a newest version kept more than an hour (a minute for one that could not be read), is answered at once with when it was read in beingReadAgain. It is read again behind the answer. The office asks no program and no registry until somebody asks for the list. With part=list, it answers at once with each tool as the office declares it, its name, program and install command or why there is none, and asks no program and no registry. Both answers carry usersPath: whether this server's start read the user's own PATH and joined it after the office's own, from the login shell's program or the Windows registry, and how many entries it added; or, when it was not read, a code and one sentence saying why, with the office's own PATH kept. It names no entry.",
    ),
    async (req) => {
      thePersonOrTheGrant(actorFrom(req), theActKeptHere(req))
      const { part } = parse(theListQuery, req.query ?? {}, 'The agent tools query')
      if (part === 'list') return { harnesses: listTheHarnesses(), usersPath: theUsersPathAsTheDoorSaysIt() }
      return { harnesses: await readTheHarnesses(theEnvironmentATerminalGets()), usersPath: theUsersPathAsTheDoorSaysIt() }
    },
  )

  app.post(
    '/harnesses/install',
    route(
      'harnesses.install',
      'local',
      { because: 'acts-on-this-machine', act: 'Installing agent tools' },
      "The person installs the ticked agent tools: one terminal opens in the person's home and runs each vendor's own installer in turn, saying before each which it is, then tells the person to sign in to each program themselves. No login is run, and no key is read or passed. A name that is not an agent tool the office runs, or one with no install command, is refused before anything opens. " +
        "Installing reaches every agent, so it waits for the readiness signatures of every secretary on the registry (GET /api/readiness). " +
        "The person's press is their own signature. A secretary may press under the person's grant where this office's list allows it; " +
        "that raises and signs as the secretary, and the person still signs through the person's own door. With no secretary the person's press opens it at once and answers 201. " +
        "Otherwise it answers 409 with code readinessWaits and values {checklist}: the caller's signature is recorded, nothing is installed yet, " +
        "and the terminal opens by itself when everyone has signed. Nothing is installed if they have not signed by the checklist's deadline. " +
        "While the hold held-for-readiness-signatures is off, the person's press opens it at once with no readiness checklist and no signature, and the reply says so in withoutTheSignatures. " +
        "A press that is not the person's is then refused 409, and nothing is installed. A checklist already waiting stays waiting. " +
        "While the office runs inside a sandbox every press is refused 409 with code harnessInASandbox, before the message is read and before the readiness gate, and nothing is written.",
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const body = parse(installPress, req.body ?? {}, 'Nothing was installed:')
      const chosen = theHarnessesAsked(body.harnesses)
      nothingIsInstalledInASandbox()
      // THE PERSON'S OWN MESSAGE MAY OPEN A FIRST INSTALL AT ONCE, and is marked used before the terminal opens. It opens as
      // the person whoever pressed, as an install the person signed does.
      const message = body.message === undefined ? null : theFirstInstallAMessageOpens(body.message, chosen, actor, workspaceOf(req))
      if (message?.opens === true) {
        const opened = await openTheInstallTerminal(chosen, THE_PERSON, workspaceOf(req))
        reply.code(201)
        return { ...opened, byTheMessage: body.message }
      }
      // IT WAITS FOR EVERY SECRETARY TO SIGN, because it changes the tool every agent runs on (src/server/lib/readiness.ts).
      // Each caller signs as itself. With no secretary on the registry the person's press opens it at once.
      let did: Record<string, unknown>
      try {
        did = await throughTheReadinessGate({
          operation: 'harnesses.install',
          inputs: { harnesses: chosen.map((one) => one.id) },
          because: null,
          actor,
          workspaceId: workspaceOf(req),
        })
      } catch (err) {
        // A WAIT RAISED OR SIGNED THE CHECKLIST, but writes no change row and gives the route layer no 2xx.
        if (err instanceof PanelError && err.code === 'readinessWaits') {
          writeDownAPressOutsideTheLog(actor, workspaceOf(req))
          // AND A MESSAGE THAT DID NOT OPEN IT IS SAID, beside the wait's own words, which stay as they are.
          if (message !== null && message.opens === false) {
            const { checklist } = err.values as { checklist: string }
            throw new PanelError(err.message, err.status, `The message did not open the install without the signatures. ${message.because}`, undefined, err.reason, {
              code: 'readinessWaits',
              values: { checklist },
            })
          }
        }
        throw err
      }
      reply.code(201)
      return message === null || message.opens ? did : { ...did, notByTheMessage: message.because }
    },
  )

  app.get(
    '/harnesses/:id/signed-in',
    route(
      'harnesses.signed-in',
      'local',
      { because: 'acts-on-this-machine', act: "Reading an agent tool's sign-in state" },
      "The person reads whether one agent tool is signed in, as the tool's own status command says on the PATH the office's terminals get: yes, no, or not readable with why (not installed, no status command, it did not run, or its words were not understood). asked names the command. What the tool printed is not answered. signingIn says whether a sign-in the office started for it is still running. The person reads it, or a secretary may under the person's grant where this office's list allows it, as the list read is asked.",
    ),
    async (req, reply) => {
      thePersonOrTheGrant(actorFrom(req), theActKeptHere(req))
      const one = theToolNamed(req.params, 'Nothing was read.')
      reply.headers(NOT_KEPT)
      return { harness: one.id, signedIn: await theSignInOf(one), signingIn: aSignInIsRunning(one) }
    },
  )

  app.post(
    '/harnesses/:id/key',
    {
      ...route(
        'harnesses.key',
        'local',
        { because: 'acts-on-this-machine', act: "Giving a key to an agent tool's own login" },
        "The person gives a key to one agent tool's own login: {key} for Codex, and {provider, key} for OpenCode, whose provider is opencode (OpenCode Zen) or opencode-go (OpenCode Go). The key is written once to the tool's own login on standard input and dropped. It is on no command line and in no environment variable, file, log line, change row or reply. Then the tool's own status is read and answered in signedIn. Claude Code signs in with an account, and its key is refused. OpenCode's key is given only on the version its login was checked on; another version is refused and nothing is sent. A login that fails is said plainly and not tried another way. The person's alone, as the provider key doors are.",
      ),
      bodyLimit: 8192,
      // A BODY THE PARSER CANNOT READ IS REFUSED IN THIS DOOR'S OWN WORDS. The office's JSON parser passes JSON.parse's own
      // error on as a 400 (src/server/index.ts), and on Node 22 its words quote part of the body, which holds the key.
      // A thrown error goes on to the one error handler: the door's own refusals and a server fault unchanged.
      errorHandler: (error) => {
        const theCallersFault = typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        throw error instanceof PanelError || !theCallersFault ? error : aHarnessRefusal('harnessKeyShape', A_KEY_OF_ANOTHER_SHAPE)
      },
    },
    async (req, reply) => {
      reply.headers(NOT_KEPT)
      try {
        permitted(req)
        const one = theToolNamed(req.params, 'No key was sent.')
        const body = theKeyGiven.safeParse(req.body)
        if (!body.success) throw aHarnessRefusal('harnessKeyShape', A_KEY_OF_ANOTHER_SHAPE)
        return await giveTheKeyToTheToolsOwnLogin(one, body.data.provider ?? null, body.data.key)
      } finally {
        // THE KEY IS DROPPED from the request as soon as the door is done with it, whatever the door answered.
        if (typeof req.body === 'object' && req.body !== null) delete (req.body as { key?: unknown }).key
      }
    },
  )

  app.post(
    '/harnesses/:id/sign-in',
    route(
      'harnesses.sign-in',
      'local',
      { because: 'acts-on-this-machine', act: "Starting an agent tool's own sign-in" },
      "The person starts one agent tool's own account sign-in: Codex with ChatGPT (codex login --device-auth, which opens no browser) and Claude Code with a Claude account (claude auth login --claudeai). Each is started with BROWSER set to a program that opens nothing, on Linux and the Mac. Only on Linux is Claude Code known to honour it, so on the Mac and on Windows aSecondTabMayOpen is true for Claude Code, which may open the system's browser itself. The answer carries in id the id of the sign-in this press started, and in takesACode whether it waits for the code its sign-in page shows, which POST /api/harnesses/:id/sign-in/code gives it. It carries in address the one address a page may open, worked out on the server: Codex's declared device page, whatever it printed; or the address Claude Code printed, only when it is https on Claude Code's declared host exactly, with no user part and no port. Otherwise address is null, and noAddress says why in a code (printedNone, notAnAddress, notHttps, hasAUser, hasAPort or anotherHost) and one English sentence; an address that fails is never answered. code is the device code the tool printed, as text, or null. The sign-in keeps running until it ends or ten minutes pass; a second press while it runs answers the first, with already true. Ask GET /api/harnesses/:id/signed-in for whether it finished. No account or key passes through the office. The person's alone, as the provider key doors are.",
    ),
    async (req, reply) => {
      permitted(req)
      const one = theToolNamed(req.params, 'Nothing was started.')
      reply.headers(NOT_KEPT)
      return await startTheToolsOwnSignIn(one)
    },
  )

  app.post(
    '/harnesses/:id/sign-in/code',
    {
      ...route(
        'harnesses.sign-in-code',
        'local',
        { because: 'acts-on-this-machine', act: "Giving an agent tool's own sign-in the code its sign-in page showed" },
        "The person gives the code a sign-in page showed to the sign-in the office started for that press: {signIn, code}, where signIn is the id POST /api/harnesses/:id/sign-in answered, for a sign-in whose answer says takesACode (Claude Code's). The code and a newline are written once to that sign-in's standard input, which is then closed, and the answer is {harness, signIn, codeGiven}. Ask GET /api/harnesses/:id/signed-in for whether it finished. It is refused, and nothing is written, for a sign-in that takes no code (harnessSignInTakesNoCode), an id that names no sign-in started here for this tool (harnessNoSuchSignIn), a sign-in that ended or ran past its ten minutes (harnessSignInEnded), a second code (harnessSignInCodeGiven), and a body of another shape (harnessSignInCodeShape). The code is in no log line, change row, api_calls row, refusal or reply. The person's alone, as the provider key doors are.",
      ),
      bodyLimit: 8192,
      // A BODY THE PARSER CANNOT READ IS REFUSED IN THIS DOOR'S OWN WORDS, as at the key door: JSON.parse's own words
      // quote part of the body, which holds the code.
      errorHandler: (error) => {
        const theCallersFault = typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        throw error instanceof PanelError || !theCallersFault ? error : aHarnessRefusal('harnessSignInCodeShape', A_CODE_OF_ANOTHER_SHAPE)
      },
    },
    async (req, reply) => {
      reply.headers(NOT_KEPT)
      try {
        permitted(req)
        const one = theToolNamed(req.params, 'Nothing was sent to its sign-in.')
        const body = theCodeGiven.safeParse(req.body)
        if (!body.success) throw aHarnessRefusal('harnessSignInCodeShape', A_CODE_OF_ANOTHER_SHAPE)
        return await giveTheCodeToTheSignIn(one, body.data.signIn, body.data.code)
      } finally {
        // THE CODE IS DROPPED from the request as soon as the door is done with it, whatever the door answered.
        if (typeof req.body === 'object' && req.body !== null) delete (req.body as { code?: unknown }).code
      }
    },
  )

  app.post(
    '/harnesses/:id/set-up',
    route(
      'harnesses.set-up',
      'local',
      { because: 'acts-on-this-machine', act: 'Asking a secretary to set up an agent tool' },
      "The person asks a secretary to set up one agent tool: install it if it is missing, and lead the person to the page where its key or sign-in goes. The ask is written as the person's own message, in the language the body names ({language}, English when none), and names the tool as the office declares it, so the secretary's install press may carry the message's id. " +
        "The secretary is, in this order: the one whose recorded duties, in any project, name the door harnesses.install; the only secretary; the secretary of the person's newest message to that one secretary alone, a message to a group not counted; the secretary registered first. " +
        "It answers 201 with {harness, secretary: {id, name}, why, message}, where why is holdsTheDuty, theOnlySecretary, writtenToLast or registeredFirst. " +
        "With no secretary nothing is written, and it is refused 409 with code harnessNoSecretary. The person's alone: no grant carries it, and a secretary is refused 403 with code harnessSetUpIsThePersons.",
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      if (!thePersonIsProved(actor) || actor.signedItem !== undefined) {
        throw aHarnessRefusal(
          'harnessSetUpIsThePersons',
          'Only the person may ask a secretary to set up an agent tool, because the ask is written as the person\'s own message. Nothing was written.',
          403,
        )
      }
      permitted(req)
      const one = theToolNamed(req.params, 'Nothing was written.')
      const { language } = parse(theSetUpAsked, req.body ?? {}, 'Nothing was written:')
      const holdingTheDuty = everySecretarysDuties(null)
        .secretaries.filter((each) => each.duties?.doors?.includes(THE_DOOR_OF_THE_DUTY) === true)
        .map((each) => each.agent.id)
      const to = theSecretaryASetUpGoesTo(holdingTheDuty)
      if (to === null) {
        throw aHarnessRefusal('harnessNoSecretary', `No secretary is registered in this office, so nobody was asked to set up ${one.name}. Nothing was written.`, 409)
      }
      const message = writeTheAsk(one, to, language ?? 'en', actor, workspaceOf(req))
      reply.code(201)
      return { harness: one.id, secretary: to.secretary, why: to.why, message }
    },
  )
}
