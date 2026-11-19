// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SUMMONS DOORS: A SECRETARY CALLS THE PERSON IN, A TOOL READS THE SUMMONSES, AND THE PERSON'S PRESSES INSTALL THE MAIL TOOL
 * AND TURN IT OFF. The summons itself is lib/summons.ts. The office only summons: the mail is the mail tool's, and the
 * office holds no mail setting.
 *
 *   POST /api/office/summon         a secretary calls the person in: a message in the office, and a push to their devices
 *   GET  /api/office/summonses      a tool reads the summonses with a key of its own, or the person or a secretary under their grant
 *   GET  /api/office/mail-tool      the person reads whether the mail tool is installed and runs, and where its page is (or a secretary under their grant)
 *   GET  /api/office/mail-tool/state  the person reads the mail tool's own settings through the office, from any of
 *                                   their devices: the office asks the tool on this computer and keeps nothing
 *   POST /api/office/mail-tool/install  the person's press: their personal mail tool given its key, and installed as a
 *                                   service of their login (lib/mailtool.ts), or a secretary's under the grant this office's list opens
 *   POST /api/office/mail-tool/disable  the person's press: the mail tool turned off without being uninstalled, so the install
 *                                   press turns it back on, or a secretary's under the grant
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY CALL THE PERSON IN
 * ---------------------------------------------------------------------------------------
 *
 * The holders of the power `Calling the person in` in design/permissions/roles.json, which only the secretary's step
 * of the tree adds, so the role gate refuses every other registered role before the handler runs. A caller that no
 * registry holds is refused here, as the dead-letter claim refuses one: the role gate does not narrow an unregistered
 * caller, and a summons is a message to the person, which criterion M59 keeps for a writer somebody registered. The
 * person is let through, as they are everywhere.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE CALL IS `remote`
 * ---------------------------------------------------------------------------------------
 *
 * The call reads nothing back to its caller: it answers a message id, how many devices were told, and a sentence that
 * names no address. A secretary may work on another machine, as the dead-letter claim allows. The summons mail's three
 * settings doors, which were `local`, left the office with the office's own mail, once the
 * mail tool had mailed the person on their press.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { actorFrom, refuseTheOldWarrantHeader, takesNoBody, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { aRaiseCarriesIt, thePersonPressedItThemselves, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { theActKeptHere } from '../lib/reach.ts'
import {
  SUMMONS_URGENCIES,
  type SummonsDone,
  type TheMailTool,
  type TheMailToolDisabled,
  type TheMailToolInstalled,
  type TheMailToolKeyTakenBack,
  type TheSummonsesRead,
} from '@shared/summons.ts'
import { summonThePerson, theSummonsesSince } from '../lib/summons.ts'
// THE MAIL TOOL'S PLACE ON THIS COMPUTER: the one installer, the press that turns it off, and what the office knows of
// it.
import { THE_MAIL_TOOL_HANDLE, disableTheMailTool, installTheMailTool, mayTheMailToolBeInstalled } from '../../config/the-mail-tool.mjs'
import type { CodedRefusal, MailToolRefusalCode } from '../../shared/refusal-codes.ts'
import { theOwnersHome } from '../../config/install-the-entry.mjs'
import { REPO_ROOT, settings, theInstallsNode } from '../../config/settings.mjs'
import { THE_OLD_MAIL_TOOL_CARD, theKeyForTheMailTool, theMailToolAsItStands, theOldMailToolAgent, takeBackTheMailToolsKey } from '../lib/mailtool.ts'
import { theMailToolChangedThroughTheOffice, theMailToolsStateThroughTheOffice, type AChangeToTheMailTool } from '../lib/the-mail-tool-through-the-office.ts'
import type { TheMailToolsChangeThroughTheOffice, TheMailToolThroughTheOffice } from '@shared/the-mail-tool-through-the-office.ts'
import { theWorldsOwnAuthority } from '../lib/worldauthority.ts'
import { howThisRequestProvedItself } from '../lib/keys.ts'
import { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { workspaceOf } from '../lib/workspaces.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps an act for the person.
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'

const SUMMON_NOTE =
  'Call the person into the office. Body {"title": string, "urgency"?: "now" | "soon"}, where the title is one line ' +
  'of at most 120 characters with no link, no mail address and no machine address. The office writes one message to ' +
  'the person, from the caller, saying who calls, how urgent it is and the title, and which devices were told; and it tells ' +
  'every device where the person allowed notifications, with the same three things. The reply\'s ' +
  '`told` counts them. The mail is the mail tool\'s, which reads the summons with a key of its own. ' +
  'There is no limit on how often. Only a secretary ' +
  'holds this power; the reply names no address.'

const READ_SUMMONSES_NOTE =
  'Read each summons since the last one read, oldest first, at most 50: who called, how urgent, the title and when. ' +
  'Query {"after"?: the last summons id}. The person proved, a secretary holding their grant where this office\'s list ' +
  'of what the grant carries says the grant presses it, the person’s mail tool’s own key, or the live agent named ' +
  `"mail-tool" holding the old ${THE_OLD_MAIL_TOOL_CARD} card on its record and proved by its own key may read. ` +
  'The current card list is not consulted. A broken summons stops the read before it; the ' +
  'next read refuses it and says how to read on. The person first gave the mail tool a power of its own for this read. ' +
  'The person later made it their own tool instead, set in their Settings, with their own key that reads only the summonses.'

const MAIL_TOOL_NOTE =
  'Whether your mail tool is installed, runs and starts at your login: {key, keyWorks, unit, running, enabled, page, says}. ' +
  'key is {madeAt, lastUsedAt}, or null with no live tool key. A null lastUsedAt means no use was recorded. ' +
  'Only the person may read the address of its settings, with their secret, or a secretary holding their grant where ' +
  'this office\'s list of what the grant carries says the grant presses it.'

const MAIL_TOOL_STATE_NOTE =
  'Your mail tool\'s own settings, read through the office from any of your devices: {answered: true, state}, where ' +
  'state is the tool\'s GET /state answer as the tool gave it, or {answered: false, because, status, says}, where ' +
  'because is "no address", "no answer", "refused" or "not the tool". The office asks only GET /state, at the address ' +
  'it knows for the tool on this computer, and keeps nothing of the answer; its address is private in the log. Only ' +
  'the person may read, and no grant carries it. Takes nothing.'

/** What the three presses through the office share: what they answer, where they ask, and who may press. */
const THE_PRESSES_THROUGH_THE_OFFICE =
  'Answers {answered: true, answer}, where answer is the tool\'s own {done, state} as the tool gave it, or {answered: ' +
  'false, because, status, says} as GET /api/office/mail-tool/state does; with no answer, the change may or may not ' +
  'have been made. The office asks only this one door of the tool, at the address it knows for the tool on this ' +
  'computer, with the one field it takes and nothing else of the request. It keeps nothing of the answer, and its ' +
  'address is private in the log. When the tool says it did it, the press is written down as the person\'s act, with ' +
  'no address in it. Only the person may press, themselves, and no grant carries it. Takes no query.'

const MAIL_TOOL_ADDRESSES_NOTE =
  'Save the list of addresses your mail tool mails, through the office from any of your devices. Body {"addresses": ' +
  'string}, the list as typed, one address to a line; the tool reads and checks it. ' + THE_PRESSES_THROUGH_THE_OFFICE

const MAIL_TOOL_ACCOUNT_NOTE =
  'Pick the account your mail tool sends from, through the office from any of your devices. Body {"id": string}, an ' +
  'account id from the tool\'s state; the tool takes only an account that can send. ' + THE_PRESSES_THROUGH_THE_OFFICE

const MAIL_TOOL_TEST_NOTE =
  'Have your mail tool send its test letter to every address on its list, through the office from any of your ' +
  'devices. Takes no body. ' + THE_PRESSES_THROUGH_THE_OFFICE

const INSTALL_MAIL_TOOL_NOTE =
  'Install your mail tool as a service of your login. Makes your tool key and saves it in its folder, never in a reply. ' +
  `If "mail-tool" is a live agent on the old ${THE_OLD_MAIL_TOOL_CARD} card, the same transaction retires it, ` +
  'keeps its record and takes its agent ' +
  'keys back, naming the caller that pressed. An agent on any other card must be retired on its page first. A working ' +
  'tool key is reused. The tool reads its key every round, so changing the key ' +
  'does not restart it or move its summons cursor. Only the person may press, or a secretary holding their grant where ' +
  'this office\'s list of what the grant carries says the grant presses it; a test world is refused. Takes no body.'

const DISABLE_MAIL_TOOL_NOTE =
  'Turn your mail tool off without uninstalling it: stops it and takes it off your login. Coming back it mails no ' +
  'summons made while it was off. Its unit, key and settings stay. Install turns it back on. Only the person may ' +
  'press, or a secretary holding their grant where this office\'s list of what the grant carries says the grant ' +
  'presses it. Takes no body.'

/**
 * A refusal of the mail tool's press or its turn-off, as a 409, with its code when it has one (round W28), so the page
 * draws it in its own language.
 */
function aMailToolRefusal(refused: { says: string; code?: MailToolRefusalCode; path?: string }): PanelError {
  if (refused.code === undefined) return new PanelError(refused.says, 409)
  const values = refused.path === undefined ? {} : { path: refused.path }
  return new PanelError(refused.says, 409, undefined, undefined, undefined, { code: refused.code, values } as CodedRefusal)
}

/**
 * THE PERSON, OR A SECRETARY HOLDING THEIR GRANT, MAY INSTALL THE MAIL TOOL, TURN IT OFF, TAKE ITS KEY BACK, OR READ
 * WHERE ITS PAGE IS: the key is theirs, and the page's address opens their page. The card keeps all of it, so an office
 * that changed nothing refuses the secretary in the check's words.
 */
function onlyThePersonMayTouchTheMailTool(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  if (aRaiseCarriesIt(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was read or written.',
      whoMay:
        'The owner installs their mail tool, turns it off and takes its key back on the Settings page. Its settings hold ' +
        'the owner\'s addresses. An agent may call the owner in with POST ' +
        '/api/office/summon.',
    }),
    403,
  )
}

/**
 * ONLY THE PERSON MAY READ THE MAIL TOOL'S SETTINGS THROUGH THE OFFICE: they hold the person's addresses, which pass
 * through the office to the person and to nobody else. No grant carries this read, so a secretary is refused too.
 */
function onlyThePersonMayReadTheMailToolsSettings(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was asked of the mail tool.',
      whoMay:
        'The owner reads their mail tool\'s settings on the Settings page, from any of their devices. An agent may call ' +
        'the owner in with POST /api/office/summon.',
    }),
    403,
  )
}

/**
 * ONLY THE PERSON, PRESSING THEMSELVES, MAY CHANGE THE MAIL TOOL'S SETTINGS THROUGH THE OFFICE: the list holds the
 * person's addresses, and a test letter goes to all of them. No grant carries it, and an agent carrying out a signed item
 * is not the person's own press. From another device the route asks for the person's key first (lib/reach.ts).
 */
function onlyThePersonMayChangeTheMailToolsSettings(actor: Actor, req: FastifyRequest): void {
  if (thePersonPressedItThemselves(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was asked of the mail tool, and nothing was changed.',
      whoMay:
        'The owner changes their mail tool\'s settings on the Settings page, from any of their devices. An agent may call ' +
        'the owner in with POST /api/office/summon.',
    }),
    403,
  )
}

/** The three presses' bodies: the one field the tool takes for each, and nothing else. */
const mailToolAddressesBody = z.strictObject({ addresses: z.string().max(16_384) })
const mailToolAccountBody = z.strictObject({ id: z.string().min(1).max(512) })

/** How each press is written down when the tool says it did it. No address and no account is in it. */
const THE_PRESSES_ACTS: Record<AChangeToTheMailTool['door'], { field: string; after: string; didIt: (done: Record<string, unknown>) => boolean }> = {
  addresses: { field: "the mail tool's list of addresses, through the office", after: 'saved', didIt: (done) => done['saved'] === true },
  account: { field: 'the account the mail tool sends from, through the office', after: 'picked', didIt: (done) => done['picked'] === true },
  test: { field: "a test letter from the mail tool, through the office", after: 'asked for', didIt: (done) => done['tested'] === true },
}

/** The reading door's query: the last summons read, or nothing to read from the first. */
const summonsesQuery = z.strictObject({ after: z.string().min(1).max(64).optional() })

const summonBody = z.strictObject({
  title: z.string().max(4096),
  urgency: z.enum(SUMMONS_URGENCIES).default('now'),
})

/**
 * WHO CALLS, AS THE NAME THE MAIL SIGNS WITH, or a refusal for a caller no registry holds.
 *
 * The same refusal the dead-letter claim gives, for the reason the file comment gives. The name is the registry's,
 * never the caller's own words, so the mail cannot be signed with a name nobody holds.
 */
function whoCalls(actor: Actor): string {
  const me = participantForActor(actor)
  const row = me === null ? null : readParticipant(me)
  if (me === null || row === null) {
    throw new PanelError(
      `Nothing in either registry answers to the ${actor.type} "${actor.id}", so nobody is here to call the person in, ` +
        'and nothing was sent. A summons is a message to the person, and a message comes from a writer somebody ' +
        'registered (criterion M59). GET /api/participants lists every person and every durable agent, with the id of each.',
      403,
    )
  }
  return row.name.trim() !== '' ? row.name : row.handle
}

export async function summonsRoutes(app: FastifyInstance): Promise<void> {
  // This changes the card check: the person's personal tool is no agent. The proof is asked
  // directly so actorFrom never invents an Actor for it.
  app.get('/office/summonses', route('office.read-summonses', 'remote', READ_SUMMONSES_NOTE), async (req): Promise<TheSummonsesRead> => {
    // THE OLD WARRANT HEADER IS REFUSED FIRST, because the two keys below pass without actorFrom, which refuses it
    // everywhere else.
    refuseTheOldWarrantHeader(req)
    const proof = howThisRequestProvedItself(req)
    const theirTool = proof?.how === 'his-tool-key' && proof.whoseId === THE_MAIL_TOOL_HANDLE
    // Read the old card from the agent's record, regardless of what roles.json still holds.
    // This branch ends when no live mail-tool agent holds that card, after the person's press moves it.
    const agent = theOldMailToolAgent()
    const oldTool = proof?.how === 'an-agent-key' && proof.actingFor === undefined &&
      agent !== null && proof.whoseId === agent.id
    if (!theirTool && !oldTool) {
      const actor = actorFrom(req)
      // A KEY THAT PROVES NOBODY IS STILL REFUSED, whatever grant the name beside it holds: the old refusal is kept
      // for it. Otherwise the person first, then the grant this office's list may open the read to, and the old refusal.
      const aKeyNobodyHolds = proof === undefined && theHashOfTheKeyOnThisRequest(req) !== null
      if ((aKeyNobodyHolds || !thePersonIsProved(actor)) && (aKeyNobodyHolds || !aRaiseCarriesIt(actor))) {
        throw new PanelError(
          "The summonses are read with the mail tool's own key, or by the person, and this request carried neither, so " +
            'nothing was read. A key that was taken back reads nothing here. Press install in Settings to give your tool a new key.',
          403,
        )
      }
    }
    const query = parse(summonsesQuery, req.query ?? {}, 'The summonses to read')
    return theSummonsesSince(query.after ?? null)
  })

  app.post('/office/summon', route('office.summon', 'remote', SUMMON_NOTE), async (req): Promise<SummonsDone> => {
    const body = parse(summonBody, req.body ?? {}, 'The summons')
    const actor = actorFrom(req)
    const who = whoCalls(actor)
    return summonThePerson({ workspaceId: workspaceOf(req), actor, who, title: body.title, urgency: body.urgency })
  })

  app.get('/office/mail-tool', route('office.mail-tool', 'local', {
    because: 'acts-on-this-machine',
    act: "Reading the state of the mail tool on this computer and the address of its page",
  }, MAIL_TOOL_NOTE), async (req): Promise<TheMailTool> => {
    onlyThePersonMayTouchTheMailTool(actorFrom(req), req)
    takesNoInput(req, 'GET /api/office/mail-tool', 'It takes nothing: it reads the mail tool on this computer.')
    return theMailToolAsItStands(theOwnersHome(), { api: settings().apiAddress, inATestWorld: theWorldsOwnAuthority().inATestWorld })
  })

  // THE PERSON'S OTHER DEVICES REACH THE TOOL ONLY THROUGH HERE: the tool answers on 127.0.0.1 of this computer alone.
  // The door asks the tool at the address the office already knows, so nothing of the request names where it asks.
  app.get('/office/mail-tool/state', route('office.mail-tool-state', 'local', {
    because: 'acts-on-this-machine',
    act: "Reading the owner's mail tool settings through the office",
    thePersonMayFromAnotherComputer: true,
  }, MAIL_TOOL_STATE_NOTE), async (req, reply): Promise<TheMailToolThroughTheOffice> => {
    reply.header('cache-control', 'no-store')
    onlyThePersonMayReadTheMailToolsSettings(actorFrom(req), req)
    takesNoInput(req, 'GET /api/office/mail-tool/state', 'It takes nothing: it asks the mail tool on this computer at the address the office knows.')
    const { page } = theMailToolAsItStands(theOwnersHome(), { api: settings().apiAddress, inATestWorld: theWorldsOwnAuthority().inATestWorld })
    return theMailToolsStateThroughTheOffice(page)
  })

  // THE PERSON'S THREE PRESSES ON THE TOOL'S OWN SETTINGS, PASSED ON THE SAME WAY. Each asks one door of the tool, with the one
  // field it takes built again, and is written down as the person's act only when the tool says it did it.
  async function passItOn(req: FastifyRequest, endpoint: string, read: () => AChangeToTheMailTool): Promise<TheMailToolsChangeThroughTheOffice> {
    const actor = actorFrom(req)
    onlyThePersonMayChangeTheMailToolsSettings(actor, req)
    parse(takesNoBody(endpoint, 'It takes no query: it asks the mail tool on this computer at the address the office knows.'), req.query, 'The query string is not usable:')
    const change = read()
    const { page } = theMailToolAsItStands(theOwnersHome(), { api: settings().apiAddress, inATestWorld: theWorldsOwnAuthority().inATestWorld })
    const passed = await theMailToolChangedThroughTheOffice(page, change)
    const act = THE_PRESSES_ACTS[change.door]
    if (passed.answered && act.didIt(passed.answer.done as Record<string, unknown>)) {
      writeDownASettingChange(actor, { setting: 'the-mail-tool', field: act.field, before: null, after: act.after, workspaceId: workspaceOf(req) })
    }
    return passed
  }

  app.post('/office/mail-tool/addresses', route('office.mail-tool-addresses', 'local', {
    because: 'acts-on-this-machine',
    act: "Saving the owner's list of addresses in the mail tool through the office",
    thePersonMayFromAnotherComputer: true,
  }, MAIL_TOOL_ADDRESSES_NOTE), async (req, reply): Promise<TheMailToolsChangeThroughTheOffice> => {
    reply.header('cache-control', 'no-store')
    return passItOn(req, 'POST /api/office/mail-tool/addresses', () => ({
      door: 'addresses',
      addresses: parse(mailToolAddressesBody, req.body ?? {}, 'The list of addresses').addresses,
    }))
  })

  app.post('/office/mail-tool/account', route('office.mail-tool-account', 'local', {
    because: 'acts-on-this-machine',
    act: "Picking the mail tool's sending account through the office",
    thePersonMayFromAnotherComputer: true,
  }, MAIL_TOOL_ACCOUNT_NOTE), async (req, reply): Promise<TheMailToolsChangeThroughTheOffice> => {
    reply.header('cache-control', 'no-store')
    return passItOn(req, 'POST /api/office/mail-tool/account', () => ({
      door: 'account',
      id: parse(mailToolAccountBody, req.body ?? {}, 'The account to send from').id,
    }))
  })

  app.post('/office/mail-tool/test', route('office.mail-tool-test', 'local', {
    because: 'acts-on-this-machine',
    act: "Having the mail tool send its test letter to the owner's addresses through the office",
    thePersonMayFromAnotherComputer: true,
  }, MAIL_TOOL_TEST_NOTE), async (req, reply): Promise<TheMailToolsChangeThroughTheOffice> => {
    reply.header('cache-control', 'no-store')
    return passItOn(req, 'POST /api/office/mail-tool/test', () => {
      takesNoInput(req, 'POST /api/office/mail-tool/test', 'It takes nothing: the tool sends its own test letter to its own list.')
      return { door: 'test' }
    })
  })

  app.post('/office/mail-tool/install', route('office.install-mail-tool', 'local', {
    because: 'reserved-to-the-owner',
    act: "Giving the owner's mail tool its key and installing it as a service of the owner's login",
  }, INSTALL_MAIL_TOOL_NOTE), async (req): Promise<TheMailToolInstalled> => {
    const actor = actorFrom(req)
    onlyThePersonMayTouchTheMailTool(actor, req)
    // A TEST WORLD SERVES FROM A COPY OF THE CHECKOUT THAT IS DELETED WITH IT, so a service it installed would run a tool
    // that is gone, under the person's real login (the entry press's refusal, api/entry.ts).
    if (theWorldsOwnAuthority().inATestWorld) {
      throw new PanelError(
        'This Mole Office is a test world, and the mail tool it would install runs from a copy of the checkout that is ' +
          'deleted with the world, under your real login. Nothing was written. Press it on the office itself.',
        409,
      )
    }
    takesNoInput(req, 'POST /api/office/mail-tool/install', 'It takes nothing: the home folder is this server\'s own and the tool is this checkout\'s.')
    const home = theOwnersHome()
    // Ask before any key or file is written. The key move commits before systemd is asked, so
    // a later service failure says what was saved and names install as the way on.
    const node = theInstallsNode()
    const may = mayTheMailToolBeInstalled({ home, node: node.program, checkout: REPO_ROOT })
    if (!may.ok) throw aMailToolRefusal(may)
    const given = theKeyForTheMailTool({ actor, workspaceId: workspaceOf(req), home })
    let done: ReturnType<typeof installTheMailTool>
    try {
      done = installTheMailTool({ home, node: node.program, environment: node.environment, checkout: REPO_ROOT, api: settings().apiAddress, key: null })
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      throw new PanelError(`The tool’s key is saved in its folder, but installing its service failed (${why}). Press install again to finish.`, 409)
    }
    if (!done.ok) throw new PanelError(`The tool’s key is saved in its folder. ${done.says} Press install again to finish.`, 409)
    return {
      keyMade: given.keyMade,
      wrote: [...(given.keyMade ? ['your mail tool’s key, into its folder'] : []), ...done.wrote],
      service: done.service,
      says: given.keyMade ? `Your mail tool was given its key. ${done.says}` : done.says,
    }
  })

  app.post('/office/mail-tool/take-back-key', route('office.take-back-mail-tool-key', 'local', {
    because: 'reserved-to-the-owner',
    act: 'Taking back the owner’s mail tool key',
  }, 'Take your mail tool’s key back. Only the person may press, or a secretary holding their grant where this office\'s list of what the grant carries says the grant presses it, here on this computer; a test world is refused. Takes no body.'), async (req): Promise<TheMailToolKeyTakenBack> => {
    const actor = actorFrom(req)
    onlyThePersonMayTouchTheMailTool(actor, req)
    if (theWorldsOwnAuthority().inATestWorld) {
      throw new PanelError('This Mole Office is a test world. Nothing was changed. Take the key back on the office itself.', 409)
    }
    takesNoInput(req, 'POST /api/office/mail-tool/take-back-key', 'It takes nothing: the key is your mail tool’s.')
    const takenBack = takeBackTheMailToolsKey(actor) > 0
    return { takenBack, says: takenBack ? 'Your mail tool’s key was taken back. It reads nothing until you press install again.' : 'Your mail tool has no live tool key. Press install to give it one.' }
  })

  app.post('/office/mail-tool/disable', route('office.disable-mail-tool', 'local', {
    because: 'reserved-to-the-owner',
    act: "Turning the owner's mail tool off without uninstalling it",
  }, DISABLE_MAIL_TOOL_NOTE), async (req): Promise<TheMailToolDisabled> => {
    onlyThePersonMayTouchTheMailTool(actorFrom(req), req)
    // A TEST WORLD RUNS UNDER THE PERSON'S REAL LOGIN, so the service it would turn off is their real mail tool.
    if (theWorldsOwnAuthority().inATestWorld) {
      throw new PanelError(
        'This Mole Office is a test world, and the mail tool it would turn off is the one your real login runs. Nothing ' +
          'was changed. Press it on the office itself.',
        409,
      )
    }
    takesNoInput(req, 'POST /api/office/mail-tool/disable', 'It takes nothing: the home folder is this server\'s own.')
    const done = disableTheMailTool({ home: theOwnersHome() })
    if (!done.ok) throw aMailToolRefusal(done)
    return { service: done.service, says: done.says }
  })
}
