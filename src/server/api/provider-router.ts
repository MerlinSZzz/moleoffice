// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER'S DOORS. Every one refuses while MOLE_OFFICE_PROVIDER_ROUTER is off. The rules are in
 * src/server/lib/keyrouter/provider-router.ts.
 *
 *   POST /api/provider-router/run-tokens   a run's credential, from the Casting row it was started from
 *   POST /api/provider-router/tool-tokens  a tool's credential, for the provider and model the tool names
 *   POST /api/provider-router/admissions   the router asks whether to carry one request, with the office's own key
 *   POST /api/provider-router/receipts     the router settles one request it carried, with the office's own key
 *   GET  /api/provider-router/receipts     a run's receipts, by slot, and what it has spent against its cap
 *   GET  /api/provider-router/usage        receipt totals by slot and run
 *   POST /api/provider-router/tool-requests  a tool's request, carried to the router's control socket on this host
 *
 *   GET  /api/provider-router/key-slots          every key slot and the Go pin, without keys
 *   POST /api/provider-router/pin                set or clear the Go pin
 *   POST /api/provider-router/key-slots/add      the owner adds one for a routed provider, pasted into the Settings page
 *   POST /api/provider-router/key-slots/remove   the owner removes one
 *
 * THE KEY SLOT DOORS STAY ON THIS MACHINE, for every caller: the file is on this computer and the router that reads it
 * runs here. The person reaches a door from their other computer only where a decision of theirs names that door, as the
 * sandboxes' logins have one, and none names these. Adding and removing are the owner's own acts, at the settings door's
 * check; an agent may read the slots and may not add or remove one.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import type { KeySlotsReading } from '@shared/go-slots.ts'
import { addAKeySlot, removeAKeySlot, setTheGoPin, theKeySlots } from '../lib/keyrouter/key-slots.ts'
import { admitARequest, carryTheToolRequest, issueARunToken, issueAToolToken, refuseWhileTheRouterMustCarryTheInspector, settleAReceipt, theReceiptsOfARun, theUsageTotals, theToolRequest } from '../lib/keyrouter/provider-router.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { thePersonIsProved, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { aSecretaryWithItsOwnKey, theOwnerAtTheSettingsDoor } from './runtime-settings.ts'

const ISSUE_NOTE =
  'A run\'s provider router credential, from the Casting row it was started from. Body {"run": a run id, "casting": ' +
  '{"id": the row, "revision": its selectionRevision}}. The models are the row\'s native model and nothing else, and the ' +
  'cap is MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP in US dollars. The row\'s kind is casting, and the same run and models ' +
  'again replaces its credential. Only the person, the office or the registered starter of the run\'s agent may ask. ' +
  'The token is in this answer once.'

const TOOL_TOKEN_NOTE =
  'A tool\'s own provider router credential, for the provider and model the tool names and for no other pair. Body ' +
  '{"run": a run id, "provider": one the router routes, "model": the model the tool will ask for}. The row\'s kind is ' +
  'tool, and it expires at the run\'s Casting credential\'s expiry or sooner. The same pair again replaces the run\'s ' +
  'tool credential; another pair is refused rather than widening it. Only the run\'s own key may ask. The token is in ' +
  'this answer once.'

const ADMIT_NOTE =
  'The router asks whether to carry one request. Body {"token", "provider", "model"}. The answer is {"admitted": true, ' +
  '"id", "run", "kind"} or {"admitted": false, "code", "says", "kind"}, and nothing is written. Only a casting ' +
  'credential is admitted here; a tool credential is refused by kind. Only the office\'s own key may ask.'

const SETTLE_NOTE =
  'The router settles one request it carried. Body {"id": "rr_" and 24 characters, "token": the admitted credential\'s ' +
  'id, "slot", "status", "model", "usage": {"inputTokens", "cachedInputTokens", "outputTokens"} or null}. The office ' +
  'prices it from the price table and charges it to the run, once: the same receipt again answers 200 and changes ' +
  'nothing. A request to a provider paid by a subscription, OpenCode Go, is not priced and charges nothing. Only the ' +
  'office\'s own key may settle.'

const RECEIPTS_NOTE =
  'A run\'s router receipts, what each slot carried for it, and what it has spent against its cap. Query ?run=. Only the ' +
  'person, the office or the registered starter of the run\'s agent may read them.'

const TOOL_REQUEST_NOTE =
  'A tool asks the office to carry one request to the provider router on this host. Body {"provider", "path", "body"}. ' +
  'The provider and path must be in the router\'s own tool-request table; a request to a path it does not carry is ' +
  'refused by name. The credential is the tool token in "Authorization: Bearer <the token>" and it is checked on every ' +
  'call: a missing, ended, expired, widened or over-cap token is refused. The run\'s office key alone is not a ' +
  'credential and spends nothing. The answer is the provider\'s own status, content type and body.'

/** The video review sends an MP4 inline; 40 MiB holds a 20 MiB video in base64 and its prompt. */
const THE_TOOL_REQUEST_BODY_LIMIT = 40 * 1024 * 1024

const SLOTS_NOTE =
  'Every key slot in the provider router\'s key slots file, ~/.config/mole-office/key-slots.json on this computer. The ' +
  'answer names the routed providers a new slot may choose and every slot by {"provider", "providerName", "id", ' +
  '"label", "mark": "sha256:" and the first 12 hex digits of its key}; no answer holds a key. A file that does not ' +
  'exist yet answers no slot. Read only.'

const ADD_NOTE =
  'The owner adds one key slot for a routed provider. Body {"provider": one of the names in the reading, "label": a name ' +
  'for it, "key": the provider\'s key, with no space}. It is written into the key slots file at mode 600, in a folder ' +
  'of mode 700, under the first of <provider>-1, <provider>-2, … the file does not hold, after every slot the file ' +
  'holds, and the key is never returned. A key the file holds already and a provider the router does not route are ' +
  'refused. The owner\'s own act; an agent or a secretary is refused. The reply is the whole reading.'

const REMOVE_NOTE =
  'The owner removes one key slot. Body {"id"}. Only that slot leaves the key slots file and every other slot stays as ' +
  'it was. The owner\'s own act; an agent or a secretary is refused. The reply is the whole reading.'

const addBody = z.strictObject({
  provider: z.string().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80),
  key: z.string().min(1).max(4096).regex(/^\S+$/u, 'must have no space in it'),
})
const removeBody = z.strictObject({ id: z.string().min(1).max(80) })
const pinBody = z.strictObject({ id: z.string().min(1).max(80).nullable() })

/**
 * ONLY THE OWNER ADDS OR REMOVES A KEY SLOT: the person, or whoever holds their authority in a test world, at the settings
 * door's check. No secretary may, whoever it acts for and under any raise: a key slot is the owner's to add.
 */
function onlyTheOwnerMayTouchTheKeySlots(actor: Actor, req: FastifyRequest): void {
  if (theOwnerAtTheSettingsDoor(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was changed.',
      whoMay: 'The owner adds and removes the key slots on the Settings page. An agent may read which slots there are, and may not add or remove one; nor may a secretary.',
    }),
    403,
  )
}

export async function providerRouterRoutes(app: FastifyInstance): Promise<void> {
  // The office does not start while the router is on and the inspector's checks would get no key the router holds.
  refuseWhileTheRouterMustCarryTheInspector()

  app.post('/provider-router/run-tokens', route('provider-router.issue', 'remote', ISSUE_NOTE), async (req, reply) => {
    const issued = issueARunToken(req.body ?? {}, actorFrom(req), workspaceOf(req))
    void reply.code(201)
    return issued
  })

  app.post('/provider-router/tool-tokens', route('provider-router.tool-tokens', 'remote', TOOL_TOKEN_NOTE), async (req, reply) => {
    // THE RUN'S OWN KEY IS PROVED AS ITS OWN RUN, so a tool may ask for the run it serves and no other.
    const issued = issueAToolToken(req.body ?? {}, actorFrom(req, { proveOwnRun: true }), workspaceOf(req))
    void reply.code(201)
    return issued
  })

  app.post('/provider-router/tool-requests', { ...route('provider-router.tool-request', 'remote', TOOL_REQUEST_NOTE), bodyLimit: THE_TOOL_REQUEST_BODY_LIMIT }, async (req, reply) => {
    // THE TOKEN, NOT THE OFFICE KEY, IS THE CREDENTIAL. The office key headers are still read, so the call is attributed
    // and a request from no recognised caller is refused before anything is carried; but the key alone names no token.
    void actorFrom(req)
    const bearer = /^Bearer\s+(\S+)$/u.exec(String(req.headers.authorization ?? ''))
    const carried = await carryTheToolRequest(theToolRequest(req.body ?? {}, bearer?.[1] ?? ''))
    return reply.code(carried.status).header('content-type', carried.contentType).send(carried.body)
  })

  app.post('/provider-router/admissions', route('provider-router.admit', 'remote', ADMIT_NOTE), async (req) => {
    return admitARequest(req.body ?? {}, actorFrom(req))
  })

  app.post('/provider-router/receipts', route('provider-router.settle', 'remote', SETTLE_NOTE), async (req, reply) => {
    const settled = settleAReceipt(req.body ?? {}, actorFrom(req))
    void reply.code(settled.kept ? 201 : 200)
    return { receipt: settled.receipt }
  })

  app.get('/provider-router/receipts', route('provider-router.receipts', 'remote', RECEIPTS_NOTE), async (req) => {
    return theReceiptsOfARun(req.query ?? {}, actorFrom(req), workspaceOf(req))
  })

  app.get('/provider-router/usage', route('provider-router.receipts', 'remote', 'Usage totals by key slot and by run from settled router receipts; only the person or a secretary may read them.'), async (req) => {
    const actor = actorFrom(req)
    if (!theOwnerAtTheSettingsDoor(actor) && !aSecretaryWithItsOwnKey(actor)) {
      throw new PanelError('Only the person or a secretary may read provider router usage totals.', 403)
    }
    takesNoInput(req, 'GET /api/provider-router/usage', 'It takes nothing: it reads settled router receipts.')
    return theUsageTotals(theKeySlots().slots)
  })

  app.get('/provider-router/key-slots', route('provider-router.key-slots', 'local', {
    because: 'acts-on-this-machine',
    act: "Reading the key slots in the provider router's key slots file on this computer",
  }, SLOTS_NOTE), async (req): Promise<KeySlotsReading> => {
    takesNoInput(req, 'GET /api/provider-router/key-slots', 'It takes nothing: it reads the key slots file.')
    return theKeySlots()
  })

  app.post('/provider-router/pin', route('provider-router.key-slots', 'local', {
    because: 'acts-on-this-machine', act: 'Selecting a Go key slot on this computer',
  }, 'Set or clear the Go slot selected for new runs.'), async (req): Promise<KeySlotsReading> => {
    const actor = actorFrom(req)
    if (!thePersonIsProved(actor) && !aSecretaryWithItsOwnKey(actor)) {
      throw new PanelError('Only the person or a secretary may set the Go pin. Nothing was changed.', 403)
    }
    const body = parse(pinBody, req.body ?? {}, 'The Go pin')
    return setTheGoPin(body.id, actor.id)
  })

  app.post('/provider-router/key-slots/add', route('provider-router.add-key-slot', 'local', {
    because: 'acts-on-this-machine',
    act: "Writing one provider key into the provider router's key slots file on this computer",
  }, ADD_NOTE), async (req): Promise<KeySlotsReading> => {
    onlyTheOwnerMayTouchTheKeySlots(actorFrom(req), req)
    const body = parse(addBody, req.body ?? {}, 'The slot to add')
    return addAKeySlot(body.provider ?? 'opencode-go', body.label, body.key)
  })

  app.post('/provider-router/key-slots/remove', route('provider-router.remove-key-slot', 'local', {
    because: 'acts-on-this-machine',
    act: "Taking one key slot out of the provider router's key slots file on this computer",
  }, REMOVE_NOTE), async (req): Promise<KeySlotsReading> => {
    onlyTheOwnerMayTouchTheKeySlots(actorFrom(req), req)
    const body = parse(removeBody, req.body ?? {}, 'The slot to remove')
    return removeAKeySlot(body.id)
  })
}
