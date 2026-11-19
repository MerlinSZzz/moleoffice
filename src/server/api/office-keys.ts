// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN KEYS, AND EACH RUNTIME'S OWN ASKED READ-ONLY. Criterion U2.
 *
 *   GET  /api/office/keys       set-or-not-set for the office's own two, and each runtime's own
 *   POST /api/office/keys/set   the person sets one of the office's own, through the one writer
 *   POST /api/office/keys/test  the person presses to test one, with a call that costs nothing
 *
 * ---------------------------------------------------------------------------------------
 * WHY ALL THREE STAY ON THIS MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * The office's keys live in one file beside the database, which is on this computer, and setting one
 * writes that file. The read also asks each agent tool on this computer about its own store, which
 * runs a command here. So every one of the three is `local` with `acts-on-this-machine`, and a
 * caller from another machine is refused before any handler runs. The file belongs beside
 * the database.
 *
 * EXCEPT FOR THE PERSON, FROM THEIR OTHER COMPUTER. The person, proved with a
 * paired device's key and over an encrypted door, may do all three from there
 * (`thePersonMayFromAnotherComputer`, and `thePersonMayAskFromThere` in lib/reach.ts). A key set that
 * way is said to the person as a line from the office (lib/changed-from-another-computer.ts). Anybody else
 * at another computer, an agent included, is still refused before any handler runs.
 *
 * ---------------------------------------------------------------------------------------
 * NO REPLY CARRIES A VALUE
 * ---------------------------------------------------------------------------------------
 *
 * The set route answers the whole reading, which is booleans and sentences. The test route answers
 * one of four words and a sentence. Neither replies with the key, any part of it, or a provider's raw
 * body. `value` in the request is the only place a value travels, and it is written and dropped.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { OFFICE_KEY_PROVIDERS, type KeyTestResult, type TheKeys } from '@shared/office-keys.ts'
import { actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theSecretaryActingForThePerson, writeDownAnActUnderTheRaise, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { setTheOfficeKey, testTheOfficeKey, theKeys } from '../lib/office-keys.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'
// THE LINE TO THE PERSON WHEN A SETTING IS CHANGED FROM THEIR OTHER COMPUTER OR BY A SECRETARY
// for them.
import { sayASecretaryChangedItForThem, sayItWasChangedFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for the person. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'

const READ_NOTE =
  'The keys this office has: its own two, OpenRouter and Moonshot, each answered set or not set, and ' +
  'each runtime\'s own key asked read-only through the tool itself. No reply carries a key value, and ' +
  'no page draws one. The runtime half answers set, not set, or nobody has looked when the tool\'s ' +
  'store is one this office does not read. Read only, and no body is read.'

const SET_NOTE =
  'Set one of the office\'s own provider keys. Body {"provider": "openrouter" | "moonshot", "value": ' +
  'string, "warrant"?: the person\'s words}. The value is written into the one key file beside the database and is never ' +
  'returned. This is the owner\'s own act, or a secretary\'s for them on their words (a warrant whose `for` names ' +
  'office.set-key) or under their raise, which is written down and said to them; any other ' +
  'agent is refused and the refusal names who may. The reply is the whole reading, which says only whether each key ' +
  'is set.'

const TEST_NOTE =
  'Test one of the office\'s own provider keys with a metadata call that costs nothing: OpenRouter\'s ' +
  'key door or Moonshot\'s model list. Body {"provider": "openrouter" | "moonshot", "warrant"?: the person\'s words}. The ' +
  'reply says answered, refused or unreachable, and never the key. It never sends a completion. This is the ' +
  'owner\'s own act, or a secretary\'s for them on their words (a warrant whose `for` names office.test-key) or under ' +
  'their raise; any other agent is refused and the refusal names who may.'

const aProvider = z.enum(OFFICE_KEY_PROVIDERS)

/** The body that sets one key. `value` is the only place a value travels, and it is not echoed. */
const setBody = z.strictObject({
  provider: aProvider,
  value: z.string().min(1).max(4096),
  warrant: warrantBody.optional(),
})

/** The body that tests one key. */
const testBody = z.strictObject({
  provider: aProvider,
  warrant: warrantBody.optional(),
})

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THE OWNER'S AUTHORITY IN A TEST WORLD, MAY SET OR TEST A KEY, OR A SECRETARY FOR THE PERSON.
 *
 * The same clause the what-is-kept write and the key window's close ask. Its own sentence here,
 * because this act is about a secret and a refusal that talked about retention would send the reader
 * to the wrong place. An agent may read the panel and may file a proposal; it may not put a key in
 * the office's file or spend a check on one, unless it is a secretary acting for the person.
 *
 * A SECRETARY, ON THE PERSON'S WORDS OR UNDER THEIR RAISE. No raise is needed for these, as long as
 * the user has given leave, for example in one sentence asking for it to be done: a user who pastes a key into a chat
 * and asks for it to be set is better served by a secretary that sets it than by a
 * refusal. The card is asked before
 * the person's words or their raise (`theSecretaryActingForThePerson`), so a worker carrying the person's words opens nothing.
 */
function onlyThePersonMayTouchTheOfficeKeys(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  if (theSecretaryActingForThePerson(actor)) return
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts, from the facts of this request:
  // why it is not the person and the way on for its kind of caller, and in a test world who may act there.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        'The owner sets and tests the office\'s keys on the Settings page. An agent may read them and may ' +
        'file a proposal about them; it may not hold the office\'s key or spend a check on one. A secretary may do ' +
        'it for the owner when it carries the person\'s words for this act (a warrant in the body) or while the owner has raised it.',
    }),
    403,
  )
}

export async function officeKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/keys', route('office.keys', 'local', {
    because: 'acts-on-this-machine',
    act: "Reading the office's key file and asking each agent tool on this computer about its own key",
    thePersonMayFromAnotherComputer: true,
  }, READ_NOTE), async (): Promise<TheKeys> => theKeys())

  app.post('/office/keys/set', route('office.set-key', 'local', {
    because: 'acts-on-this-machine',
    act: "Writing one of the office's own provider keys into the file beside its database",
    thePersonMayFromAnotherComputer: true,
  }, SET_NOTE), async (req): Promise<TheKeys> => {
    const actor = actorWithTheWordsItActsOn(req, theWordsInTheBody(req), 'office.set-key')
    onlyThePersonMayTouchTheOfficeKeys(actor, req)
    const body = parse(setBody, req.body ?? {}, 'The provider key to set')
    const wasSet = theKeys().office.some((one) => one.provider === body.provider && one.set)
    const keys = setTheOfficeKey(body.provider, body.value)
    const what = `The office's ${body.provider} key was set`
    // SET OR NOT SET, AND NEVER THE VALUE, on the change row the person's words or their raise earn.
    writeDownAnActUnderTheRaise(actor, { setting: 'office-keys', field: `the office's ${body.provider} key`, before: wasSet ? 'set' : 'not set', after: 'set', workspaceId: workspaceOf(req) })
    sayItWasChangedFromAnotherComputer(req, what)
    sayASecretaryChangedItForThem(req, actor, what)
    return keys
  })

  app.post('/office/keys/test', route('office.test-key', 'local', {
    because: 'acts-on-this-machine',
    act: "Sending one of the office's own keys from this computer to its provider to check it",
    thePersonMayFromAnotherComputer: true,
  }, TEST_NOTE), async (req): Promise<KeyTestResult> => {
    onlyThePersonMayTouchTheOfficeKeys(actorWithTheWordsItActsOn(req, theWordsInTheBody(req), 'office.test-key'), req)
    const body = parse(testBody, req.body ?? {}, 'The provider key to test')
    return testTheOfficeKey(body.provider)
  })
}
