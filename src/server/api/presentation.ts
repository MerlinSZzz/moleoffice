// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Presentation intent over HTTP: how somebody asked for a structure to be drawn.
 *
 *   GET    /api/presentation                       -> every scope that has stored intent
 *   GET    /api/presentation/:scope                -> { scope, intent, targets, report, note }
 *   PUT    /api/presentation/:scope   { intent }   -> replaces the whole scope's intent
 *   DELETE /api/presentation/:scope                -> removes all of it; Mole Office decides again
 *   PUT    /api/presentation/:scope/nodes/:target { intent } -> one node, leaving the rest alone
 *   DELETE /api/presentation/:scope/nodes/:target  -> removes one node's intent
 *   PUT    /api/presentation/:scope/direction { intent } -> which way it runs, nodes left alone
 *   DELETE /api/presentation/:scope/direction      -> forgets the direction, nodes left alone
 *
 * `:scope` is `structure` — the whole-project module graph — or `pipeline:<id>` for one pipeline's
 * own drawing. `:target` is a record id, or `step:<stepId>` inside a pipeline's scope.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAY BE SENT, AND WHAT IS REFUSED BY NAME
 * ---------------------------------------------------------------------------------------
 *
 * The whole vocabulary is in `src/shared/presentation.ts`: `direction` on a scope, and `lane`,
 * `order`, `role`, `emphasis`, `collapsed`, `near`, and `x` with `y` together on a node. The `x` and
 * `y` say where a person dragged one card — the owner lifted the ban on a node's position on
 * 6 September 2026, and that file quotes the owner. Every other coordinate, every size, every colour and
 * any CSS key is refused BY NAME with the explanation that file writes — not with a generic
 * "invalid field". That explanation is the boundary teaching itself to whoever crossed it, and this
 * file serves it rather than replacing it.
 *
 * A refusal lists EVERY problem found, not the first, because a caller fixing one field per round
 * trip is how an agent spends five turns on a request it could have fixed in one.
 *
 * THE BODY IS NOT OPAQUE, unlike the deleted PUT /api/layout/:id was. That is the difference between the two
 * endpoints and it is the point of this one. A panel layout is the browser's own business and the
 * server stores its bytes; presentation intent is a small closed vocabulary that an AGENT is meant
 * to be able to write from what it knows about the work, without looking at a screen, so the server
 * has to know what every word in it means.
 *
 * ---------------------------------------------------------------------------------------
 * WHY WRITES GO IN THE CHANGE LOG WHEN PANEL LAYOUTS DO NOT
 * ---------------------------------------------------------------------------------------
 *
 * Panel positions were deliberately kept out of `changes`, because a layout was written
 * on every drag and a day of research would be buried under "layout updated" rows. That reasoning
 * does not reach here and the opposite is true: presentation intent is AUTHORED, rarely, on purpose
 * — absent is meant to stay the common case — and "an agent rearranged the safety work into its own
 * lane" is exactly the sort of thing the question "what happened while I was away" exists to
 * answer. So every write appears in the log, attributed to whoever made it, like any other write.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EACH ROUTE BELOW CARRIES ITS OWN SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * Every route here is declared with `config: { note: '…' }`. `trackApiRoutes` in api/kinds.ts
 * collects that string as the route registers and GET /api serves it, so the sentence a caller
 * reads is written in the same statement that creates the endpoint.
 *
 * This is not a style choice. These eight endpoints shipped answering GET /api with
 * `description: null`, because the sentences for the older route groups live in ROUTE_NOTES in
 * api/kinds.ts and adding a route group meant remembering to edit a second file that the author of
 * the route group was never in. Four tests exist to catch exactly that and all four passed, each
 * against its own hand-built app that had never heard of this file. A note beside its route has no
 * second place to forget: delete this file and its sentences go with it, which is the property the
 * map cannot have.
 *
 * A note must say what the endpoint is FOR and what it REFUSES, in the voice of the ones in
 * api/kinds.ts. What it returns is the reply's own business and is discoverable by asking.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PanelError } from '../lib/panel-error.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import {
  clearScope,
  clearTarget,
  listScopes,
  parseScope,
  problemsWithNodeIntent,
  problemsWithScopeIntent,
  readScopeIntent,
  refusal,
  SCOPE_TARGET,
  writeNodeIntent,
  writeScopeIntent,
  writeScopeSettings,
  type IntentWrite,
  type ScopeSettings,
  type ScopeSummary,
  type StoredScopeIntent,
} from '../lib/presentation.ts'
import {
  EMPHASIS_ROLES,
  GRAPH_DIRECTIONS,
  NODE_ROLES,
  pipelineScope,
  STRUCTURE_SCOPE,
  type NodeIntent,
  type ScopeIntent,
} from '@shared/presentation.ts'

// ---------------------------------------------------------------------------- limits

/**
 * The most a whole scope's intent may weigh, in UTF-8 BYTES of its JSON.
 *
 * Bytes rather than characters, for the reason the deleted layout route gave: a lane may have a name
 * of four Chinese characters, which is twelve bytes, and a character-counted limit would let a Chinese
 * arrangement be three times the size of an English one.
 *
 * 256 KB is far more than any real arrangement: this workspace has about twenty modules and sixty
 * steps, and a full node intent is under a hundred bytes. The limit is here to catch a caller that
 * has mistaken this endpoint for somewhere to store the drawing itself, and the message says so.
 */
const MAX_INTENT_BYTES = 256 * 1024

/** Kept above MAX_INTENT_BYTES so the useful message wins at the real boundary. Same reason as layout.ts. */
const BODY_LIMIT = MAX_INTENT_BYTES * 2

// ---------------------------------------------------------------------------- input shapes

/**
 * The scope, out of the URL.
 *
 * Deliberately permissive here and strict in `parseScope`, which is the one place that knows what a
 * scope may be. A regex here that half-knew the answer would be a second definition of the scope
 * vocabulary, and the two would drift. All this does is stop a value so long or so odd that the
 * refusal would be unreadable.
 */
const scopeParams = z.object({
  scope: z
    .string()
    .trim()
    .min(1, { error: `the URL must name a scope, for example /api/presentation/${STRUCTURE_SCOPE}` })
    .max(128, { error: 'a scope name must be 128 characters or fewer' }),
})

/**
 * The node target, out of the URL.
 *
 * `.trim()` is the one deliberate transform in this file, and it applies to the URL only. A URL is
 * typed by hand, so "/nodes/ abc" and "/nodes/abc" should address one node rather than two — the
 * same normalisation the deleted PUT /api/layout/:id did to its id and for the same reason. A value inside the
 * BODY is not trimmed anywhere: it was constructed by a program, nothing on this write path rewrites
 * what a caller wrote, and a padded `near` is refused rather than quietly repaired.
 */
const targetParams = scopeParams.extend({
  target: z
    .string()
    .trim()
    .min(1, { error: 'the URL must name a node: a record id, or step:<step id> inside a pipeline' })
    .max(128, { error: 'a node target must be 128 characters or fewer' }),
})

/**
 * The body is `{ "intent": … }`, and the top level takes nothing else.
 *
 * The envelope is checked here and the intent INSIDE it is checked by shared/presentation.ts, which
 * is the only thing that knows the vocabulary. Splitting it that way means this file never has a
 * second opinion about what a lane is.
 *
 * `{}` is refused rather than treated as an empty save, the same rule PUT /api/layout/:id followed: a
 * body with no `intent` key is a caller that believed it was sending one. To clear a scope, DELETE
 * it — an empty `intent` object, `{"intent":{}}`, is a legitimate way to say "nothing is arranged
 * here" and is accepted.
 */
const intentBody = z
  .strictObject(
    { intent: z.unknown().optional() },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `this endpoint takes the envelope {"intent": …} and nothing else at the top level, but the body ` +
            `also had ${issue.keys.map((k) => `"${k}"`).join(', ')}. What you want stored goes INSIDE ` +
            `"intent": {"intent": {${issue.keys.map((k) => `"${k}": …`).join(', ')}}}.`
          : undefined,
    },
  )
  .superRefine((body, ctx) => {
    if (!('intent' in body)) {
      ctx.addIssue({
        code: 'custom',
        path: ['intent'],
        message:
          'the body needs an "intent" key, as in {"intent":{"direction":"down"}}. Sending {} would have been a ' +
          'request that says nothing.',
      })
    }
  })

/**
 * Refuse an intent too big to be an arrangement, before anything looks at its keys.
 *
 * Size is checked first because a 400 listing four hundred problems is not a message anybody reads,
 * and something that large is a caller storing the wrong thing rather than a caller with typos.
 */
function checkSize(intent: unknown): void {
  const json = JSON.stringify(intent)
  if (json === undefined) {
    throw new PanelError(
      'the intent could not be read as JSON. Send an object, as in {"intent":{"direction":"down"}}.',
    )
  }
  const bytes = Buffer.byteLength(json, 'utf8')
  if (bytes > MAX_INTENT_BYTES) {
    throw new PanelError(
      `This intent is ${bytes.toLocaleString('en-GB')} bytes and the limit is ${MAX_INTENT_BYTES.toLocaleString('en-GB')}. ` +
        'Presentation intent is a lane, an order, a role and an emphasis per node — if it is this large, ' +
        'something that belongs in a record, or a drawing that belongs to the layout, is being stored in it.',
      413,
    )
  }
}

// ---------------------------------------------------------------------------- the vocabulary, served

/**
 * What may be sent, served from the shared lists rather than typed out here.
 *
 * An agent that has never seen this endpoint should be able to write a correct request from this
 * answer alone. Every word in it comes from `src/shared/presentation.ts`, so it cannot describe a
 * value the checker refuses or miss one it accepts.
 */
export interface PresentationVocabulary {
  scopes: { form: string; what: string }[]
  direction: readonly string[]
  node: {
    lane: string
    order: string
    role: readonly string[]
    emphasis: readonly string[]
    collapsed: string
    near: string
  }
  neverStored: string
}

function vocabulary(): PresentationVocabulary {
  return {
    scopes: [
      { form: STRUCTURE_SCOPE, what: 'the whole-project module graph' },
      { form: pipelineScope('<pipeline id>'), what: "one pipeline's own drawing" },
    ],
    direction: GRAPH_DIRECTIONS,
    node: {
      lane: 'a named lane or cluster this node belongs in, in your own words — "perception", "the bench"',
      order: 'preferred order within its lane, low first. A hint, not a position',
      role: NODE_ROLES,
      emphasis: EMPHASIS_ROLES,
      collapsed: 'true to draw a structural group folded. The count of what is inside is always shown',
      near: 'the id of another node this one should sit beside. A request to the layout, not a coordinate',
    },
    neverStored:
      'A node may keep an x and a y together, as where a person dragged one card. Every other ' +
      'coordinate, every size, every colour and any CSS key is refused by name, and so is a coordinate ' +
      "at the top of a scope. src/shared/presentation.ts says why the one exception is allowed.",
  }
}

// ---------------------------------------------------------------------------- replies

/** Re-exported so the browser can import the shape of an index row from the route that serves it. */
export type { ScopeSummary }

export interface PresentationIndex {
  scopes: ScopeSummary[]
  vocabulary: PresentationVocabulary
  note: string
}

export type ScopeReply = StoredScopeIntent & { vocabulary: PresentationVocabulary }
export type WriteReply = IntentWrite & { anchoredToTheScope?: string }

/**
 * The one sentence that says a change row was filed against the scope rather than against a record.
 *
 * Written here, on the reply, rather than left to be discovered. The whole-project structure graph
 * is not a record, so a write to its direction is the one change row in this database whose
 * `record_id` names a scope. Everything else — every node's intent, and a pipeline's direction —
 * hangs off the record it is about.
 */
function anchorNote(scope: string, write: IntentWrite): string | undefined {
  if (scope !== STRUCTURE_SCOPE) return undefined
  if (!write.changed.includes(SCOPE_TARGET) && !write.removed.includes(SCOPE_TARGET)) return undefined
  return (
    `The direction of the whole-project structure graph is not a fact about any one record, so this write's ` +
    `change row is filed under "${STRUCTURE_SCOPE}" rather than under a record id. GET ` +
    `/api/changes?recordId=${STRUCTURE_SCOPE} lists them. Every other write here is filed under the record it ` +
    `is about.`
  )
}

function withAnchorNote(scope: string, write: IntentWrite): WriteReply {
  const note = anchorNote(scope, write)
  return note === undefined ? write : { ...write, anchoredToTheScope: note }
}

// ---------------------------------------------------------------------------- routes

export async function presentationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Every scope that has anything stored, and the whole vocabulary.
   *
   * The vocabulary is served on the index as well as on a scope so that a caller that has never
   * seen this endpoint can write a correct request from one GET, rather than from the source.
   */
  app.get(
    '/presentation',
    route(
      'structure.read',
      'remote',
      'Every structure somebody has arranged, and the whole vocabulary an arrangement may use: the two forms a ' +
        'scope takes, the directions a graph may run in, and the things that may be said about one node — including ' +
        'an x and a y together, where a person dragged one card. Read this before writing any intent. It also says ' +
        'what is never stored here: every other coordinate, every size, every colour and any CSS key is refused by ' +
        "name, and so is a coordinate at the top of a scope. src/shared/presentation.ts says why the one exception " +
        'is allowed. An empty list is the ordinary state and means Mole Office is deciding every ' +
        'drawing.',
    ),
    async (req): Promise<PresentationIndex> => {
      const scopes = listScopes(workspaceOf(req))
      return {
        scopes,
        vocabulary: vocabulary(),
        note:
          scopes.length === 0
            ? 'Nothing has been arranged yet, so Mole Office decides every drawing. That is the ordinary state and it ' +
              'is meant to stay the common one: a structure that only looks right because somebody tuned forty ' +
              'hints is a structure nobody can regenerate.'
            : `${scopes.length} structure${scopes.length === 1 ? ' has' : 's have'} stored presentation intent. ` +
              'Everything else is decided by Mole Office on every draw.',
      }
    },
  )

  /** What is stored for one structure, and what the server can already tell will not be drawn. */
  app.get(
    '/presentation/:scope',
    route(
      'structure.read',
      'remote',
      'What has been arranged for one structure, who arranged each part of it and when, plus the same vocabulary ' +
        'again so the answer can be acted on without a second request. `:scope` is "structure" for the ' +
        'whole-project module graph or "pipeline:<record id>" for one pipeline\'s own drawing, and any other ' +
        'spelling is refused by name rather than stored as a scope nothing will ever draw. `report.unhonoured` ' +
        'names every stored hint that points at something no longer in this drawing, and why; nothing is deleted ' +
        'for it. That report covers the REFERENCES only — whether the layout could honour an order or put two ' +
        'nodes side by side is known where the layout runs, and the reply says so rather than letting an empty ' +
        'list read as "everything was honoured".',
    ),
    async (req): Promise<ScopeReply> => {
      const { scope } = parse(scopeParams, req.params, 'The URL is not usable:')
      return { ...readScopeIntent(parseScope(scope, workspaceOf(req))), vocabulary: vocabulary() }
    },
  )

  /**
   * Replace a whole structure's intent.
   *
   * A replace and not a merge: the caller is saying what this drawing's arrangement IS. Every target
   * that goes is named in `removed`, so nothing disappears without being reported.
   */
  app.put(
    '/presentation/:scope',
    {
      bodyLimit: BODY_LIMIT,
      ...route(
        'structure.write',
        'remote',
        'Say how a whole structure should be drawn. The body is the envelope ' +
          '{"intent":{"direction":…,"nodes":{…}}} and takes nothing else at the top level. It REPLACES: a node the ' +
          'body leaves out loses its arrangement, and each one that goes is named in `removed`, so to change one ' +
          'node use PUT /api/presentation/:scope/nodes/:target and to change only the direction use ' +
          'PUT /api/presentation/:scope/direction. An x and a y together on a node are stored, as where a person ' +
          'dragged one card; a coordinate at the top of a scope is refused, and so is every other coordinate, ' +
          'size, colour and CSS key, each BY NAME with what to say instead — this endpoint stores what somebody ' +
          'MEANT, and where the boxes go is derived from it on every draw. Every problem in the body is listed at ' +
          'once rather than one per round trip. {"intent":{}} is a legitimate way to say nothing is arranged here; ' +
          '{} is refused as a request that says nothing. Every write appears in the change log, attributed like ' +
          'any other.',
      ),
    },
    async (req): Promise<WriteReply> => {
      const actor = actorFrom(req)
      const { scope: raw } = parse(scopeParams, req.params, 'The URL is not usable:')
      const body = parse(intentBody, req.body, 'The request body is not usable:')
      const scope = parseScope(raw, workspaceOf(req))

      checkSize(body.intent)
      // Checked and REFUSED here, listing every problem, before anything is written. The messages are
      // the ones shared/presentation.ts produces, unedited.
      const problems = problemsWithScopeIntent(scope, body.intent)
      if (problems.length > 0) throw new PanelError(refusal(problems))

      return withAnchorNote(scope.scope, writeScopeIntent(scope, body.intent as ScopeIntent, actor))
    },
  )

  /** Remove everything stored for a structure, so Mole Office decides the whole drawing again. */
  app.delete(
    '/presentation/:scope',
    route(
      'structure.clear',
      'remote',
      'Forget everything arranged for one structure, so Mole Office decides the whole of that drawing again. It takes no body — ' +
        'there is nothing to configure about forgetting. What went is named in `removed`, and clearing a scope ' +
        'that had nothing stored writes nothing and says so, rather than reporting a removal that never happened.',
    ),
    async (req): Promise<WriteReply> => {
      takesNoInput(req, 'DELETE /api/presentation/:scope', 'It forgets everything arranged for one structure, and which structure is the scope in the URL.')

      const actor = actorFrom(req)
      const { scope: raw } = parse(scopeParams, req.params, 'The URL is not usable:')
      const scope = parseScope(raw, workspaceOf(req))
      return withAnchorNote(scope.scope, clearScope(scope, actor))
    },
  )

  /** Store one node's intent, leaving every other node in the structure alone. */
  app.put(
    '/presentation/:scope/nodes/:target',
    {
      bodyLimit: BODY_LIMIT,
      ...route(
        'structure.write',
        'remote',
        'Arrange ONE node and leave every other node in the structure alone. `:target` is a record id, or ' +
          '"step:<step id>" for a step inside a pipeline\'s own scope. The body is {"intent":{…}} taking `lane`, ' +
          '`order`, `role`, `emphasis`, `collapsed` and `near` — meanings a person could have written down — and ' +
          'an x and a y together, where a person dragged one card. Every other coordinate, every size and ' +
          'every colour is refused by name. So is a target this scope cannot ' +
          'contain: an id no record has, or a step id this pipeline does not have, is refused with the ids that do ' +
          'exist, because intent stored against a node that is not there could never be drawn. An empty ' +
          '{"intent":{}} is refused too — leave the node out, or DELETE it, rather than storing a row that says ' +
          'nothing. GET /api/presentation says what each word means.',
      ),
    },
    async (req): Promise<WriteReply> => {
      const actor = actorFrom(req)
      const { scope: raw, target } = parse(targetParams, req.params, 'The URL is not usable:')
      const body = parse(intentBody, req.body, 'The request body is not usable:')
      const scope = parseScope(raw, workspaceOf(req))

      checkSize(body.intent)
      const problems = problemsWithNodeIntent(scope, target, body.intent, target)
      if (problems.length > 0) throw new PanelError(refusal(problems))

      return withAnchorNote(scope.scope, writeNodeIntent(scope, target, body.intent as NodeIntent, actor))
    },
  )

  /**
   * Remove one node's stored intent.
   *
   * Removing intent that was not there changes nothing and is not an error: the caller asked for a
   * state and that state is what they have. `removed` is empty and the note says so, so a caller
   * that expected to remove something can tell the two apart.
   */
  app.delete(
    '/presentation/:scope/nodes/:target',
    route(
      'structure.clear',
      'remote',
      "Forget one node's arrangement, leaving the rest of the structure alone. It takes no body. Removing intent that was " +
        'not there is not an error — the caller asked for a state and that state is what they have — so `removed` ' +
        'comes back empty and the note says which of the two happened, rather than leaving them to look the same. ' +
        "The scope's own direction is not a node: asking to remove it here is refused and names " +
        'DELETE /api/presentation/:scope/direction, so there is one way to reach a scope\'s settings and not two.',
    ),
    async (req): Promise<WriteReply> => {
      takesNoInput(req, 'DELETE /api/presentation/:scope/nodes/:target', "It forgets one node's arrangement, and both the scope and the node are in the URL.")

      const actor = actorFrom(req)
      const { scope: raw, target } = parse(targetParams, req.params, 'The URL is not usable:')
      const scope = parseScope(raw, workspaceOf(req))
      // The sentinel is refused here as well as on the write, so there is one way to reach the scope's
      // own settings and not two. A route that accepts a name it will not write is a route that will
      // eventually disagree with itself.
      if (target === SCOPE_TARGET) {
        throw new PanelError(
          `"${SCOPE_TARGET}" is the scope's own settings and not a node. Forget the direction with ` +
            `DELETE /api/presentation/${scope.scope}/direction.`,
        )
      }
      return withAnchorNote(scope.scope, clearTarget(scope, target, actor))
    },
  )

  /**
   * Set which way the structure runs, leaving every node's intent alone.
   *
   * Its own route rather than a whole-scope PUT carrying only a direction, because that PUT is a
   * REPLACE: a caller that sent {"intent":{"direction":"right"}} to it would turn the drawing
   * sideways and remove every lane and role anybody had arranged, and the reply naming what it
   * removed would arrive after the fact. Changing one thing has to be a request that changes one
   * thing.
   */
  app.put(
    '/presentation/:scope/direction',
    {
      bodyLimit: BODY_LIMIT,
      ...route(
        'structure.write',
        'remote',
        'Set which way one structure runs, leaving every node\'s arrangement untouched. Body ' +
          '{"intent":{"direction":"down"}}; the directions there are to choose from are listed at ' +
          'GET /api/presentation, and a word that is not one of them is refused with the list. It is its own ' +
          'endpoint rather than a whole-scope PUT carrying one key, because that PUT is a REPLACE and would turn ' +
          'the drawing sideways AND remove every lane and role anybody had arranged, reporting it afterwards. A ' +
          'body carrying `nodes` is refused here, and told which endpoint does write them, before anything else ' +
          'about the body is checked.',
      ),
    },
    async (req): Promise<WriteReply> => {
      const actor = actorFrom(req)
      const { scope: raw } = parse(scopeParams, req.params, 'The URL is not usable:')
      const body = parse(intentBody, req.body, 'The request body is not usable:')
      const scope = parseScope(raw, workspaceOf(req))

      checkSize(body.intent)
      // The wrong-route check comes FIRST. A caller that sent nodes here has picked the wrong endpoint,
      // and being told that is more use than being told what is wrong inside nodes this route was
      // never going to write.
      const settings = body.intent as ScopeSettings & { nodes?: unknown }
      if (settings !== null && typeof settings === 'object' && settings.nodes !== undefined) {
        throw new PanelError(
          'This route sets the direction only, and nothing was written. Send the nodes one at a time to ' +
            `PUT /api/presentation/${scope.scope}/nodes/<node>, or the whole arrangement at once to ` +
            `PUT /api/presentation/${scope.scope} — which REPLACES it, removing any node not in the body.`,
        )
      }
      // Then the same shared checker the whole-scope write uses, so "sideways" is refused with the
      // same sentence in both places.
      const problems = problemsWithScopeIntent(scope, body.intent)
      if (problems.length > 0) throw new PanelError(refusal(problems))

      return withAnchorNote(scope.scope, writeScopeSettings(scope, settings, actor))
    },
  )

  /** Forget which way this structure runs, so Mole Office decides that again. Nodes are left alone. */
  app.delete(
    '/presentation/:scope/direction',
    route(
      'structure.clear',
      'remote',
      'Forget which way one structure runs, so Mole Office decides that again. It takes no body, and every node\'s arrangement ' +
        'is left exactly as it was — this is the narrow undo for the endpoint above, not a way to clear a scope. ' +
        'For the whole-project structure graph the change row is filed under the scope name rather than under a ' +
        "record id, because the direction of the whole graph is not a fact about any one record, and the reply " +
        'says so when that is what happened.',
    ),
    async (req): Promise<WriteReply> => {
      takesNoInput(req, 'DELETE /api/presentation/:scope/direction', 'It forgets which way one structure runs, and which structure is the scope in the URL.')

      const actor = actorFrom(req)
      const { scope: raw } = parse(scopeParams, req.params, 'The URL is not usable:')
      const scope = parseScope(raw, workspaceOf(req))
      return withAnchorNote(scope.scope, clearTarget(scope, SCOPE_TARGET, actor))
    },
  )
}
