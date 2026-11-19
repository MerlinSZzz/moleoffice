// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER TABLE'S DOORS, beside the Casting table's.
 *
 *   GET    /api/casting/providers       every provider, by id
 *   GET    /api/casting/providers/:id   one provider
 *   POST   /api/casting/providers       add a provider
 *   PATCH  /api/casting/providers/:id   change a provider
 *   DELETE /api/casting/providers/:id   remove a provider
 *
 * The two reads are open to every caller that may read the Casting table. The three writes are the person's, and a
 * secretary's by its card: the power "The Casting table" in src/config/roles.json holds their acts, and the one gate
 * of the Casting doors in src/server/api/casting.ts decides who may press them. Each write asks that gate first and
 * then `onlyAProvedPersonWritesAProvider`, which takes the person only by the person's key or from inside the
 * office's own program, never by a request that only names the person. The rules, the writers and that check are in
 * src/server/lib/the-provider-table.ts; this file only reads the request, asks the two checks and hands the rest on.
 *
 * NO REPLY CARRIES A KEY'S VALUE. A row names an entry of the office's key file, and `key` says only whether that
 * entry is set.
 */
import type { FastifyInstance } from 'fastify'

import { A_PROVIDER_ID_IS, type ProviderReading, type ProviderRow, type ProviderWritten } from '@shared/the-provider-table.ts'
import { actorFrom } from '../lib/http.ts'
import { addAProvider, aProvider, changeAProvider, onlyAProvedPersonWritesAProvider, removeAProvider, theProviders } from '../lib/the-provider-table.ts'
import { route, theDoorAsksTheCard } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { onlyThePersonOrACardThatHoldsItMayCast } from './casting.ts'

const ROW =
  '{id, name, programs, baseAddress, keyName, key: "set"|"not set", added: {at, by: {kind, id}}, changed: {at, by: {kind, id}}}. ' +
  '`key` says whether the office\'s key file holds the entry keyName names, and never more.'

const WRITTEN =
  '{provider, change: {id, provider, what, at, by, before, after}, told}. `told` is the id of the message the person ' +
  'was sent about this write, or null.'

const RULES =
  `id: ${A_PROVIDER_ID_IS}, and it never changes. name: 1 to 120 characters. ` +
  'programs: a list of at least one of codex, claude-code, opencode and dsh, each once. baseAddress: https: with a ' +
  'host, or http: with the host written exactly 127.0.0.1 or [::1]; no user:password@, no query and no fragment; ' +
  'stored as given, trimmed. ' +
  "keyName: the name of an entry of the office's key file, never a value: lowercase letters, digits and dashes, up to " +
  '64 characters, and none of the names the office keeps for itself.'

const WRITERS =
  "The owner may do this with the owner's key, " +
  'and so may an agent whose card holds the power "The Casting table" in src/config/roles.json ' +
  "(by default the secretary's card), proved by the agent's own key, as at the Casting doors. " +
  'Anybody else is refused with a 403 and the code castingNotOwnerOrSecretary or castingNotOwnerOrACardThatHoldsIt. ' +
  "A request that names the owner with no key of the owner's is refused with a 403 and the code " +
  'providerPersonNotProved, even while the key window is open. ' +
  'Everything is checked before anything is written, and each write adds a change row with the fields before and after.'

const LIST_NOTE = 'Every provider, by id. Answers {providers: [row]}, a row being ' + ROW
const ONE_NOTE = 'One provider. Answers the row, ' + ROW + ' A 404 with the code providerNotFound where no row has the id.'
const ADD_NOTE =
  'Add a provider. Body {id, name, programs, baseAddress, keyName}, each required. ' + RULES + ' Answers 201 ' + WRITTEN +
  ' When an agent adds a provider, the person is sent a message naming the row, the host and the key name. ' + WRITERS
const CHANGE_NOTE =
  'Change a provider. Body {name?, programs?, baseAddress?, keyName?}, at least one; id may be named only as it is. ' +
  RULES + ' Answers ' + WRITTEN + ' When an agent changes the base address, the programs or the key name, the person ' +
  'is sent a message naming the row, the host and the key name, before and now. ' + WRITERS
const REMOVE_NOTE = 'Remove a provider. No body is read. Answers ' + WRITTEN + ' with the row as it was. ' + WRITERS

export async function providerTableRoutes(app: FastifyInstance): Promise<void> {
  app.get('/casting/providers', route('office.providers', 'remote', LIST_NOTE), async (): Promise<ProviderReading> => theProviders())

  app.get<{ Params: { id: string } }>('/casting/providers/:id', route('office.provider', 'remote', ONE_NOTE), async (req): Promise<ProviderRow> => aProvider(req.params.id))

  app.post('/casting/providers', theDoorAsksTheCard(route('office.add-provider', 'remote', ADD_NOTE)), async (req, reply): Promise<ProviderWritten> => {
    const actor = actorFrom(req)
    onlyThePersonOrACardThatHoldsItMayCast(actor, req, 'add, change or remove a provider')
    onlyAProvedPersonWritesAProvider(actor)
    const written = addAProvider(req.body ?? {}, actor, workspaceOf(req))
    reply.code(201)
    return written
  })

  app.patch<{ Params: { id: string } }>(
    '/casting/providers/:id',
    theDoorAsksTheCard(route('office.change-provider', 'remote', CHANGE_NOTE)),
    async (req): Promise<ProviderWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req, 'add, change or remove a provider')
      onlyAProvedPersonWritesAProvider(actor)
      return changeAProvider(req.params.id, req.body ?? {}, actor, workspaceOf(req))
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/casting/providers/:id',
    theDoorAsksTheCard(route('office.remove-provider', 'remote', REMOVE_NOTE)),
    async (req): Promise<ProviderWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req, 'add, change or remove a provider')
      onlyAProvedPersonWritesAProvider(actor)
      return removeAProvider(req.params.id, actor)
    },
  )
}
