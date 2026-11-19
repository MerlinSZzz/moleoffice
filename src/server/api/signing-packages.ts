// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The remote doors of a signing package; the rule and its receipt are in lib/signing-packages.ts. */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { SIGNING_PACKAGE_STATES, bringAPackage, theNewestPackages, theSigningPackage, signAPackage, refuseAPackage, withdrawAPackage, carryOutAHeldItem, takeBackAHold, giveBackAHold } from '../lib/signing-packages.ts'

const BRING_NOTE = 'A secretary proved by its own agent key brings a package. Body {forAgent: an agent id or handle, task: up to 500 characters, items: 1 to 25 items of {act: a known one-press act, inputs: its fixed inputs, why: up to 2000 characters, carriedOut?: at-the-signature or by-the-named-agent, default at-the-signature}}. The office checks every item and writes what it does, what it changes and how it is undone. Nothing runs before the person signs.'
const LIST_NOTE = 'The newest signing packages, at most 25. Query ?state=waiting, signed, refused or withdrawn, and ?limit=1 to 25.'
const READ_NOTE = 'One signing package is its receipt: the task, named agent, secretary and time, answer and time, and every item in order with its sentences and outcome.'
const SIGN_NOTE = 'The proved person signs once. Body {struck: an array of item ids, which may be empty}. The office runs each unstruck at-the-signature item in order, once, and says what each did or why it failed. Items chosen for the named agent are held for at most 24 hours from the signature. Only the person signs, or a secretary holding their grant where this office\'s list of what the grant carries says the grant presses both this door and the door of every unstruck item; the secretary card keeps this door for the person. The grant never signs a package the same secretary brought, nor one with an unstruck item for the named agent, which would act on the person\'s own signature. Never in a test world.'
const REFUSE_NOTE = 'The proved person refuses the waiting package, or a secretary holding their grant where this office\'s list of what the grant carries says the grant presses it; the secretary card keeps it for the person. Nothing runs, and every item says it was not run and who refused it. Refused in a test world. Takes no body.'
const WITHDRAW_NOTE = 'Only the secretary that brought the package takes it back while it waits, proved by its own agent key. Nothing runs. Takes no body.'
const CARRY_OUT_NOTE = 'Only the agent the signed package names carries out a held item, proved by its own key or its run’s key. The item is claimed once and runs under the person’s signature on that item. The receipt names the agent and run. The hold must still be open. Refused in a test world. Takes no body.'
const TAKE_BACK_NOTE = 'Only the proved person takes back a signed package’s remaining hold, or a secretary holding their grant where this office\'s list of what the grant carries says the grant presses it; the secretary card keeps it for the person. Held items become not-used, and nothing runs. The hold must still be open. Refused in a test world. Takes no body.'
const GIVE_BACK_NOTE = 'Only the agent the package names gives back its remaining hold, proved by its own key or its run’s key. Held items become not-used, and nothing runs. The hold must still be open. Refused in a test world. Takes no body.'
const whichOne = z.strictObject({ id: z.string().min(1) })
const whichItem = z.strictObject({ id: z.string().min(1), itemId: z.string().min(1) })
const signBody = z.strictObject({ struck: z.array(z.string().min(1)).max(25) })
const listQuery = z.strictObject({ state: z.enum(SIGNING_PACKAGE_STATES).optional(), limit: z.coerce.number().int().min(1).max(25).optional() })

export async function signingPackageRoutes(app: FastifyInstance): Promise<void> {
  app.post('/signing-packages', route('signing-packages.bring', 'remote', BRING_NOTE), async (req, reply) => {
    const filed = bringAPackage({ body: req.body, actor: actorFrom(req), workspaceId: workspaceOf(req) })
    void reply.code(201)
    return { package: filed }
  })
  app.get('/signing-packages', route('signing-packages.list', 'remote', LIST_NOTE), async (req) => {
    const query = parse(listQuery, req.query ?? {}, 'The list asked for')
    return { packages: theNewestPackages(query.limit ?? 25, query.state ?? null) }
  })
  app.get('/signing-packages/:id', route('signing-packages.read', 'remote', READ_NOTE), async (req) => {
    const which = parse(whichOne, req.params, 'The package asked for')
    return { package: theSigningPackage(which.id) }
  })
  app.post('/signing-packages/:id/sign', route('signing-packages.sign', 'remote', SIGN_NOTE), async (req) => {
    const which = parse(whichOne, req.params, 'The package asked for')
    const body = parse(signBody, req.body ?? {}, 'The items struck')
    return { package: signAPackage(which.id, body.struck, actorFrom(req)) }
  })
  app.post('/signing-packages/:id/refuse', route('signing-packages.refuse', 'remote', REFUSE_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/signing-packages/:id/refuse', 'The package is named in the path.')
    const which = parse(whichOne, req.params, 'The package asked for')
    return { package: refuseAPackage(which.id, actorFrom(req)) }
  })
  app.post('/signing-packages/:id/withdraw', route('signing-packages.withdraw', 'remote', WITHDRAW_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/signing-packages/:id/withdraw', 'The package is named in the path.')
    const which = parse(whichOne, req.params, 'The package asked for')
    return { package: withdrawAPackage(which.id, actorFrom(req)) }
  })
  app.post('/signing-packages/:id/items/:itemId/carry-out', route('signing-packages.carry-out', 'remote', CARRY_OUT_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/signing-packages/:id/items/:itemId/carry-out', 'The package and item are named in the path.')
    const which = parse(whichItem, req.params, 'The held item asked for')
    return { package: carryOutAHeldItem(which.id, which.itemId, actorFrom(req)) }
  })
  app.post('/signing-packages/:id/take-back', route('signing-packages.take-back', 'remote', TAKE_BACK_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/signing-packages/:id/take-back', 'The package is named in the path.')
    const which = parse(whichOne, req.params, 'The package asked for')
    return { package: takeBackAHold(which.id, actorFrom(req)) }
  })
  app.post('/signing-packages/:id/give-back', route('signing-packages.give-back', 'remote', GIVE_BACK_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/signing-packages/:id/give-back', 'The package is named in the path.')
    const which = parse(whichOne, req.params, 'The package asked for')
    return { package: giveBackAHold(which.id, actorFrom(req)) }
  })
}
