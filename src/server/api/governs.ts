// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH DECISIONS GOVERN A PLACE, AND THE CHECK OF WHAT THE DECISIONS GOVERN.
 *
 * GET /api/decisions/governing?path=<path> or ?record=<id> lists the decisions whose `governs` reaches the place,
 * newest first, with the ones since replaced marked. GET /api/decisions/governs-check lists what the nightly check
 * reminds the project's secretary of. Both are worked out in src/server/lib/governs.ts and nothing here adds to them.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { route } from '../lib/route.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { thePageKindsInWords } from '../../shared/page-kinds-in-words.ts'
import { decisionsGoverning, theGovernsCheck } from '../lib/governs.ts'

const governingQuery = z.strictObject({
  path: z.string().trim().min(1).optional(),
  record: z.string().trim().min(1).optional(),
  /** `show` adds each decision's `basis`. Left out, the reply says it was left out. */
  secondLevel: z.enum(['show'], { error: 'secondLevel takes only show' }).optional(),
})

export async function governsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/decisions/governing',
    route(
      'decision.governing',
      'remote',
      'WHICH DECISIONS GOVERN A PLACE: ask with exactly one of `path` (a file, folder or glob of the repository) or ' +
        '`record` (the id of ' +
        thePageKindsInWords() +
        '). Newest first; `replacedBy` names what replaced a decision, and ' +
        '`notPlaced` counts the decisions that say nothing in `governs` and so could not be asked. `secondLevel=show` ' +
        'adds what each decision was based on.',
    ),
    async (req) => {
      const query = parse(governingQuery, req.query, 'Which decisions govern a place:')
      if ((query.path === undefined) === (query.record === undefined)) {
        throw new PanelError(
          'Which decisions govern a place: send exactly one of `path` or `record`.',
          400,
          undefined,
          undefined,
          undefined,
          { code: 'governingAskExactlyOne', values: {} },
        )
      }
      const asked = query.path !== undefined ? { path: query.path } : { record: query.record as string }
      const shown = query.secondLevel === 'show'
      const reply = decisionsGoverning(workspaceOf(req), asked, shown)
      // THE BASIS ONLY WHEN ASKED, and the reply says what it left out.
      if (shown) return reply
      const question = query.path !== undefined ? `path=${encodeURIComponent(query.path)}` : `record=${encodeURIComponent(query.record ?? '')}`
      return {
        ...reply,
        secondLevel: { held: ["each decision's basis"], ask: `GET /api/decisions/governing?${question}&secondLevel=show` },
      }
    },
  )

  app.get(
    '/decisions/governs-check',
    route(
      'decision.governs-check',
      'remote',
      'WHAT THE NIGHTLY CHECK OF `governs` FINDS: decisions with nothing in governs, two live decisions naming one ' +
        'file where the newer does not say it replaces the older, and replaced decisions that work made after the ' +
        'replacement still cites. `sharingNoFile` counts the pairs that share only a page, which are not listed. It ' +
        'reminds and never blocks.',
    ),
    async (req) => {
      parse(z.strictObject({}), req.query, 'The governs check takes no options:')
      return theGovernsCheck(workspaceOf(req))
    },
  )
}
