// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' LOGINS: WHICH MODEL LOGINS THE SANDBOXES ARE HANDED; the reasons are in
 * lib/sandbox-logins.ts.
 *
 *   GET  /api/office/sandbox-logins         each login the sandbox templates declare, set or not set
 *   POST /api/office/sandbox-logins/set     the person sets one, pasted into the Settings page
 *   POST /api/office/sandbox-logins/clear   the person clears one
 *
 * ALL THREE STAY ON THIS MACHINE, EXCEPT FOR THE PERSON FROM THEIR OTHER COMPUTER: proved with a paired device's key and over
 * an encrypted door, the person may do all three from there, and a login set or cleared that way
 * is said to the person as a line from the office. The file is on this computer, the sandboxes that read it run here, and setting a
 * login writes it; so each is `local` with `acts-on-this-machine`, as the office's own key doors are. Setting and
 * clearing are the person's own acts: an agent may read which names are set, and may not put a login into the file
 * or take one out.
 *
 * NO REPLY CARRIES A VALUE. The reading is names, runtime words, booleans and sentences, and `value` in the set
 * request is the only place a login travels. It is written and dropped.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { PRIVATE_LOGIN_ROUTES, type PrivateLoginReason } from '@shared/private-sandbox-login.ts'
import type { PrivateLoginRefusalCode } from '@shared/refusal-codes.ts'
import { enWave13q } from '@shared/words/en-wave-13q.ts'
import type { SandboxLogins } from '@shared/sandbox-logins.ts'
import { actorWithTheWordsItActsOn, takesNoInput, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theSecretaryActingForThePerson, writeDownAnActUnderTheRaise, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { settings, originsAPageMayBeOn } from '../../config/settings.mjs'
import { howThisRequestProvedItself } from '../lib/keys.ts'
import { actorFrom } from '../lib/http.ts'
import { thePersonPressedItThemselves } from '../lib/records.ts'
import { askPrivateLoginHolder } from '../lib/terminals.ts'
import { privateLoginDoors } from '../lib/sandbox-login-addition/attempts.ts'
import { PrivateLoginError } from '../../config/private-sandbox-login.mjs'
import { route } from '../lib/route.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { clearASandboxLogin, setASandboxLogin, theSandboxLogins } from '../lib/sandbox-logins.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'
// THE LINE TO THE PERSON WHEN A SETTING IS CHANGED FROM THEIR OTHER COMPUTER OR BY A SECRETARY
// for them.
import { sayASecretaryChangedItForThem, sayItWasChangedFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps an act for the person.
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'

const PRIVATE_REFUSALS: Record<PrivateLoginReason, PrivateLoginRefusalCode> = {
  Unavailable: 'privateLoginUnavailable', Busy: 'privateLoginBusy', Unsupported: 'privateLoginUnsupported', Expired: 'privateLoginExpired', Binding: 'privateLoginBinding', InputUsed: 'privateLoginInputUsed', PoolUnknown: 'privateLoginPoolUnknown', Person: 'privateLoginPerson', Shape: 'privateLoginShape',
  Cancelled: 'privateLoginUnsupported', PoolUnsafe: 'privateLoginUnsupported', PoolChanged: 'privateLoginUnsupported', PoolUnsaved: 'privateLoginUnsupported', PoolFull: 'privateLoginUnsupported', PoolDuplicate: 'privateLoginUnsupported',
}
export function privateLoginRefusal(reason: PrivateLoginReason): PanelError {
  return new PanelError(enWave13q[`server.${PRIVATE_REFUSALS[reason]}`], reason === 'Person' ? 403 : reason === 'Unavailable' ? 503 : reason === 'Shape' ? 400 : 409, undefined, undefined, undefined, { code: PRIVATE_REFUSALS[reason], values: {} })
}

const READ_NOTE =
  'The logins the sandbox templates declare (sandboxes/<template>/sandbox.json), each answered set or not set in ' +
  'the sandboxes\' secrets file, with the programs that read it. No reply carries a value. Read only.'

const SET_NOTE =
  'Set one of the sandboxes\' logins. Body {"name": a name the templates declare, "value": string, "warrant"?: the ' +
  'person\'s words}. The value is written into the sandboxes\' secrets file on this computer at mode 600, beside every other ' +
  'line as it was, and is never returned. The person\'s own act, or a secretary\'s for ' +
  'them on their words (a warrant whose `for` names office.set-sandbox-login) or under their raise, which is written down ' +
  'and said to them; any other agent is refused and the refusal names who may. The reply is ' +
  'the whole reading.'

const CLEAR_NOTE =
  'Clear one of the sandboxes\' logins. Body {"name": a name the templates declare, "warrant"?: the person\'s words}. Its line ' +
  'leaves the secrets file and every other line stays. The person\'s own act, or a secretary\'s for them on their words ' +
  '(a warrant whose `for` names office.clear-sandbox-login) or under their raise. The reply is ' +
  'the whole reading.'

const setBody = z.strictObject({
  name: z.string().min(1).max(128),
  value: z.string().min(1).max(8192),
  warrant: warrantBody.optional(),
})

const clearBody = z.strictObject({
  name: z.string().min(1).max(128),
  warrant: warrantBody.optional(),
})

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THE OWNER'S AUTHORITY IN A TEST WORLD, MAY SET OR CLEAR A SANDBOX LOGIN, OR A SECRETARY FOR
 * THE PERSON.
 *
 * The same clause the office's key doors ask, with its own sentence: these are the person's logins for the models. A secretary
 * may set or clear one for the person on the person's words or under their raise, as it
 * may the person's office keys. The card is asked first, so a worker carrying the person's words opens nothing.
 */
function onlyThePersonMayTouchTheSandboxLogins(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  if (theSecretaryActingForThePerson(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        'The owner sets the sandboxes\' logins on the Settings page. An agent may read which are set, and may ' +
        'not put a login into the file or take one out. A secretary may do it for the owner when it carries the person\'s ' +
        'words for this act (a warrant in the body) or while the owner has raised it.',
    }),
    403,
  )
}

export async function sandboxLoginRoutes(app: FastifyInstance): Promise<void> {
  const privateDoors = privateLoginDoors({ transport: request => askPrivateLoginHolder(request), allowedOrigins: originsAPageMayBeOn(settings()) })
  for (const { method, path, action, operation } of PRIVATE_LOGIN_ROUTES) {
    app.route({ method, url: path, ...route(operation, 'local', {
      because: 'acts-on-this-machine', act: 'Adding a private subscription login on this computer', thePersonMayFromAnotherComputer: true,
    }, 'A private sign-in owned by the proved person. No token value or native output is returned. Secretary set and clear delegation is unchanged.'),
    bodyLimit: 2048,
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store').header('pragma', 'no-cache').header('referrer-policy', 'no-referrer')
      try {
        const actor = actorFrom(req)
        if (!thePersonPressedItThemselves(actor)) throw new PrivateLoginError('Person')
        if (Object.keys(req.query as object).length !== 0) throw new PrivateLoginError('Shape')
        const proof = howThisRequestProvedItself(req)
        const view = req.headers['x-private-login-binding']
        const pageOrigin = req.headers.origin ?? (req.headers['sec-fetch-site'] === 'same-origin' ? `${req.protocol}://${req.headers.host}` : undefined)
        const context = {
          person: true, permittedReach: true, owner: actor.id,
          device: proof ? `${proof.how}:${proof.whoseId}` : `local:${req.ip}`,
          session: actor.sessionId ?? (typeof view === 'string' ? view : ''),
        }
        return await privateDoors.act(action, context, { ...req.headers, origin: pageOrigin }, req.body ?? {}, (req.params as { attempt?: string }).attempt)
      } catch (err) { throw privateLoginRefusal(err instanceof PrivateLoginError ? err.reason : 'Person') }
      finally { if (req.body && typeof req.body === 'object') delete (req.body as Record<string, unknown>)['code'] }
    } })
  }

  app.get('/office/sandbox-logins', route('office.sandbox-logins', 'local', {
    because: 'acts-on-this-machine',
    act: "Reading the logins in the sandboxes' secrets file on this computer",
    thePersonMayFromAnotherComputer: true,
  }, READ_NOTE), async (req): Promise<SandboxLogins> => {
    takesNoInput(req, 'GET /api/office/sandbox-logins', 'It takes nothing: it reads the templates and the file.')
    return theSandboxLogins()
  })

  app.post('/office/sandbox-logins/set', route('office.set-sandbox-login', 'local', {
    because: 'acts-on-this-machine',
    act: "Writing one login into the sandboxes' secrets file on this computer",
    thePersonMayFromAnotherComputer: true,
  }, SET_NOTE), async (req): Promise<SandboxLogins> => {
    const actor = actorWithTheWordsItActsOn(req, theWordsInTheBody(req), 'office.set-sandbox-login')
    onlyThePersonMayTouchTheSandboxLogins(actor, req)
    const body = parse(setBody, req.body ?? {}, 'The login to set')
    const wasSet = theSandboxLogins().names.some((one) => one.name === body.name && one.set)
    const logins = setASandboxLogin(body.name, body.value)
    const what = `The sandboxes' login ${body.name} was set`
    // SET OR NOT SET, AND NEVER THE VALUE, on the change row the person's words or their raise earn.
    writeDownAnActUnderTheRaise(actor, { setting: 'sandbox-logins', field: `the sandboxes' login ${body.name}`, before: wasSet ? 'set' : 'not set', after: 'set', workspaceId: workspaceOf(req) })
    sayItWasChangedFromAnotherComputer(req, what)
    sayASecretaryChangedItForThem(req, actor, what)
    return logins
  })

  app.post('/office/sandbox-logins/clear', route('office.clear-sandbox-login', 'local', {
    because: 'acts-on-this-machine',
    act: "Taking one login out of the sandboxes' secrets file on this computer",
    thePersonMayFromAnotherComputer: true,
  }, CLEAR_NOTE), async (req): Promise<SandboxLogins> => {
    const actor = actorWithTheWordsItActsOn(req, theWordsInTheBody(req), 'office.clear-sandbox-login')
    onlyThePersonMayTouchTheSandboxLogins(actor, req)
    const body = parse(clearBody, req.body ?? {}, 'The login to clear')
    const wasSet = theSandboxLogins().names.some((one) => one.name === body.name && one.set)
    const logins = clearASandboxLogin(body.name)
    const what = `The sandboxes' login ${body.name} was cleared`
    writeDownAnActUnderTheRaise(actor, { setting: 'sandbox-logins', field: `the sandboxes' login ${body.name}`, before: wasSet ? 'set' : 'not set', after: 'not set', workspaceId: workspaceOf(req) })
    sayItWasChangedFromAnotherComputer(req, what)
    sayASecretaryChangedItForThem(req, actor, what)
    return logins
  })
}
