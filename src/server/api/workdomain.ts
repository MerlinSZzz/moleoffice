// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK DOMAINS OVER HTTP: WHAT AN AGENT SAYS IT IS DOING, AND WHERE TWO AGENTS COLLIDE.
 *
 *   POST /api/work-domains/:id/resolve      what the machine makes of the declared scope
 *   POST /api/work-domains/:id/accept       the responses and the accepted domain, in one call
 *   POST /api/work-domains/:id/acknowledge  one stance about one overlap
 *   GET  /api/work-domains                  the open domains, with stage and last sign of work
 *   GET  /api/work-domains/:id              one domain, its diff and its overlaps
 *   POST /api/work-domains/:id/observe      rebuild the index, then say what drifted
 *   GET  /api/work-domains/overlaps         every overlap between every pair of open domains
 *
 * THERE IS NO ROUTE THAT FILES ONE. A work domain is filed through `POST /api/records` like every
 * other record, with its `about` links in the same request, so it goes through the same validation
 * and no new write door exists. That is deliberate: the ordering this whole mechanism rests on is
 * that the create path has NO ACCESS TO THE RESOLVER, and a create route of its own here would be
 * exactly the place somebody would later add one.
 *
 * AND THERE IS NO ROUTE THAT CLOSES ONE. Closing is `data.closedAt`, an ordinary field on an
 * ordinary record: `PATCH /api/records/:id {"dataPatch":{"closedAt":"2026-08-26"}}`.
 *
 * ---------------------------------------------------------------------------------------
 * TWO OF THESE POSTS STORE SOMETHING AND SAY SO
 * ---------------------------------------------------------------------------------------
 *
 * `resolve` looks like a read and is not: it writes what it concluded as its own revision, so the
 * history holds what the agent believed and what the machine answered as two separate moments. Its
 * declared effect is `write`, because an operation's effect is what the route DOES and never what
 * its HTTP method is.
 *
 * ---------------------------------------------------------------------------------------
 * EACH READ SAYS WHAT IT LEFT OUT
 * ---------------------------------------------------------------------------------------
 *
 * Every reply here carries what it could not compute, as a code with a sentence composed from it —
 * never as an empty list. In one of the owner's projects there is no file index at all, so every
 * path resolves to unresolved and four of the seven diff rows cannot be computed. The reply says
 * that, in those words, rather than reporting a clean result.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  ACKNOWLEDGE_STANCES,
  DIFF_ROWS,
  OVERLAP_CLASSES,
  OVERLAP_MARKS,
  PRESENCE_SAYS,
  RESPONSE_OUTCOMES,
  STAGE_SAYS,
} from '@shared/workdomain.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader } from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theProjectsAQueryAsks } from '../lib/across-projects.ts'
import { route } from '../lib/route.ts'
import { recordInWorkspace } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import {
  acceptWorkDomain,
  acknowledgeOverlap,
  aboutLinksOf,
  classifyOverlap,
  differencesFor,
  indexFor,
  indexedRepositoriesFor,
  scanFor,
  ClaimsImplementation,
  driftFor,
  openDomainsIn,
  overlapsFor,
  presenceOn,
  resolveDomain,
  resolveWorkDomain,
  sideOf,
  type OpenDomain,
  type PresenceHere,
  type PresenceReply,
} from '../lib/workdomain.ts'
import { WORK_DOMAIN_KIND } from '@shared/work-domain-kind.ts'

/**
 * How many records the presence read answers about at once.
 *
 * A BOUND RATHER THAN A SILENT TRUNCATION, and the same number the restriction read uses for the
 * same reason: a drawing this product can draw is far below it, and a caller with more than this is
 * asking a project question rather than a drawing one.
 */
const MOST_RECORDS_AT_ONCE = 200

const resolveBody = z.object({ ifVersion: z.string().optional() }).strict()

const acceptBody = z
  .object({
    ifVersion: z.string().optional(),
    responses: z
      .array(
        z
          .object({
            key: z.string().optional(),
            row: z.enum(DIFF_ROWS).optional(),
            outcome: z.enum(RESPONSE_OUTCOMES),
            because: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    accepted: z
      .object({
        writes: z.array(z.string()).optional(),
        creates: z.array(z.string()).optional(),
        dependsOn: z.array(z.string()).optional(),
      })
      .strict(),
  })
  .strict()

const acknowledgeBody = z
  .object({
    ifVersion: z.string().optional(),
    key: z.string(),
    stance: z.enum(ACKNOWLEDGE_STANCES),
    note: z.string().optional(),
  })
  .strict()

/** One open domain as a list row: enough to pick it out, and no more. */
function rowOf(domain: OpenDomain): Record<string, unknown> {
  return {
    id: domain.id,
    title: domain.title,
    objective: domain.objective,
    agent: domain.agentId,
    session: domain.sessionId,
    stage: domain.stage,
    says: STAGE_SAYS[domain.stage],
    basis: domain.basis,
    lastSign: domain.lastSign,
  }
}

/**
 * WHO IS ON THESE RECORDS, READ IN EACH OF THESE PROJECTS AND PUT TOGETHER. Each project is read by
 * `presenceOn`, exactly as a one-project request reads it, so overlaps are still worked out between
 * the domains of one project. A record's list holds the domains of every project that are about it.
 */
function presenceInEach(ids: readonly string[], projects: readonly string[]): PresenceReply {
  const byRecord = new Map<string, PresenceHere[]>()
  for (const id of ids) byRecord.set(id, [])
  let domainsRead = 0
  const couldNotCheck: PresenceReply['couldNotCheck'] = []
  for (const project of projects) {
    const one = presenceOn(ids, project)
    for (const [id, here] of one.byRecord) byRecord.set(id, [...(byRecord.get(id) ?? []), ...here])
    domainsRead += one.domainsRead
    couldNotCheck.push(...one.couldNotCheck)
  }
  return { byRecord, domainsRead, couldNotCheck }
}

export async function workDomainRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------- the three writes

  app.post(
    '/work-domains/:id/resolve',
    route(
      'workdomain.resolve',
      'remote',
      'Resolves the declared scope against the file index and the module claims, writes what it concluded as its ' +
        'own revision, and replies with the resolution, the scope diff and any overlap. It is a POST because it ' +
        'STORES what it worked out: running it again after the index improves writes a second revision, and the ' +
        'history then holds both readings. It never runs on the create path, which is what makes the hypothesis ' +
        'evidence rather than agreement.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const body = parse(resolveBody, req.body ?? {}, 'This work domain was not resolved:')
      return resolveWorkDomain({
        id,
        workspaceId,
        actor: actorFrom(req),
        ...(body.ifVersion === undefined ? {} : { ifVersion: body.ifVersion }),
      })
    },
  )

  app.post(
    '/work-domains/:id/accept',
    route(
      'workdomain.accept',
      'remote',
      'Stores what the agent said about each difference and what it accepted, in one call, because criticism and ' +
        'its outcome are one decision. It REFUSES while any difference of the agent’s own resolution has no ' +
        'answer — a domain accepted in silence would be a record saying criticism happened when none did. A row ' +
        'about another session’s work never holds it open: what that asks for is an acknowledgement.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const body = parse(acceptBody, req.body, 'This work domain was not accepted:')
      return acceptWorkDomain({
        id,
        workspaceId,
        actor: actorFrom(req),
        responses: body.responses,
        accepted: body.accepted,
        ...(body.ifVersion === undefined ? {} : { ifVersion: body.ifVersion }),
      })
    },
  )

  app.post(
    '/work-domains/:id/acknowledge',
    route(
      'workdomain.acknowledge',
      'remote',
      'Appends one stance about one overlap: carrying on, waiting for the other session, or having narrowed ' +
        'because of it. It is a statement and never a lock — nothing anywhere refuses a write because one of ' +
        'these exists or does not.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const body = parse(acknowledgeBody, req.body, 'This overlap was not acknowledged:')
      return acknowledgeOverlap({
        id,
        workspaceId,
        actor: actorFrom(req),
        key: body.key,
        stance: body.stance,
        ...(body.note === undefined ? {} : { note: body.note }),
        ...(body.ifVersion === undefined ? {} : { ifVersion: body.ifVersion }),
      })
    },
  )

  app.post(
    '/work-domains/:id/observe',
    route(
      'workdomain.observe',
      'remote',
      'Rebuilds the file index, then says what changed since this domain was accepted. It is a POST because it ' +
        'STORES what the scan saw, in the ledger nothing rebuilds: the three index tables are replaced whole on ' +
        'every scan, so the comparison exists for one reply unless somebody keeps it. It writes no drift row and ' +
        'no conclusion — only the rebuild and the observations that fall out of it.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      // THE DOMAIN IS READ BEFORE THE DISK IS SCANNED, and the order is not tidiness. A work domain
      // in another project is refused by name here; scanning first would walk the tree, replace an
      // index and write a page of observations for a request that was always going to be refused.
      const subject = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      if (subject.kind !== WORK_DOMAIN_KIND) {
        throw new PanelError(`${id} is not a work domain, so it has no accepted scope to compare against.`, 400)
      }
      const { rebuildIndex } = await import('../lib/sourceindex.ts')
      const rebuilt = rebuildIndex({ workspaceId, actor: actorFrom(req) })
      return {
        scanned: {
          builtAt: rebuilt.builtAt,
          fileCount: rebuilt.fileCount,
          scan: rebuilt.observed.scanId,
          observations: rebuilt.observed.rows,
        },
        drift: driftFor(id, workspaceId),
      }
    },
  )

  // -------------------------------------------------------------------- the three reads

  app.get(
    '/work-domains/overlaps',
    route(
      'workdomain.overlaps',
      'remote',
      'Every overlap between every pair of open work domains, in six classes over four ranks, COMPUTED AT READ ' +
        'AND STORED NOWHERE. It has no table, no row and no id: its key is derived from the two domain ids and ' +
        'the shared subject, which is what lets a message name one without anything minting a row to hold it. ' +
        'Nothing here locks, leases or reserves anything.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const read = overlapsFor(workspaceId)
      const index = indexFor(workspaceId)
      return {
        computedAt: read.computedAt,
        index: index === null ? null : { builtAt: index.builtAt, root: index.root, fileCount: index.paths.length },
        domains: read.domains.map(rowOf),
        overlaps: read.overlaps,
        counts: read.counts,
        classes: OVERLAP_CLASSES,
        couldNotCompute: [
          ...read.couldNotCompute,
          ...(index === null
            ? [
                {
                  because: 'no_file_index',
                  says:
                    'Mole Office could not compare any paths: this project has no file index. What still works is the ' +
                    'semantic class — two domains about the same module, pipeline, block, task or problem — and ' +
                    'nothing about files.',
                },
              ]
            : []),
        ],
        note:
          'Advisory and never a lock. Two agents may accept domains that collide: both writes succeed, both are ' +
          'told, and what is asked for is an acknowledgement. This repository holds nine unreleased resource ' +
          'claims, one for a process gone a fortnight, which is why nothing here reserves anything.',
      }
    },
  )

  app.get(
    '/work-domains/presence',
    route(
      'workdomain.presence',
      'remote',
      'WHO IS WORKING ON EACH OF THESE RECORDS. Send ?records=<id>,<id>… and the reply holds one key per id you ' +
        'asked about — including the ones nobody is working on, so that a record with nobody here and a record ' +
        'nobody looked at are never the same answer. TWO DIMENSIONS COME BACK AND THEY ARE NOT ONE WORD: ' +
        '`presence` says whether anybody is here and `stage` says where the work stands. `presence` is an AGE ' +
        'banded into four words and NEVER a stored state — ten session records in this corpus say "running" and ' +
        'nine last wrote a fortnight ago. It answers about at most ' +
        `${String(MOST_RECORDS_AT_ONCE)} records and refuses rather than answering about the first ` +
        `${String(MOST_RECORDS_AT_ONCE)} of more.`,
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      // ACROSS PROJECTS WHEN `?projects=` ASKS, for the Goals page: each project's open domains
      // are read on their own, as one project's are, and the answers are put together.
      const across = theProjectsAQueryAsks(req.query, theMessageReader(actorFrom(req)))
      const asked = (req.query as { records?: string }).records ?? ''
      const ids = [...new Set(asked.split(',').map((one) => one.trim()).filter((one) => one.length > 0))]
      if (ids.length === 0 || ids.length > MOST_RECORDS_AT_ONCE) {
        // REFUSED, NOT TRUNCATED. An answer about the first 200 of 300 cards would draw a hundred
        // cards with nobody on them and say nothing about it.
        return {
          byRecord: {},
          domainsRead: 0,
          couldNotCheck: [
            {
              what: 'this request',
              because:
                ids.length === 0
                  ? '?records= held no id once the empty entries were dropped, and an empty question is not an empty answer'
                  : `?records= named ${String(ids.length)} records and this read answers about at most ${String(MOST_RECORDS_AT_ONCE)} at once`,
            },
          ],
          presenceWords: PRESENCE_SAYS,
          overlapMarks: OVERLAP_MARKS,
          note: `Send ?records=<id>,<id>… with between 1 and ${String(MOST_RECORDS_AT_ONCE)} ids.`,
        }
      }
      const read = across === null ? presenceOn(ids, workspaceId) : presenceInEach(ids, across.map((project) => project.id))
      const byRecord: Record<string, unknown[]> = {}
      for (const id of ids) byRecord[id] = read.byRecord.get(id) ?? []
      const busy = ids.filter((id) => byRecord[id]!.length > 0).length
      return {
        byRecord,
        domainsRead: read.domainsRead,
        couldNotCheck: read.couldNotCheck,
        presenceWords: PRESENCE_SAYS,
        overlapMarks: OVERLAP_MARKS,
        note:
          read.domainsRead === 0
            ? `Nobody has an open work domain in ${across === null ? 'this project' : 'the projects asked for'}, so nobody is anywhere. That is not the same as ` +
              'nobody working: a domain is filed through POST /api/records with kind "work_domain".'
            : `${String(busy)} of the ${String(ids.length)} records you asked about have somebody on them, out of ` +
              `${String(read.domainsRead)} open work domains. Nothing is closed automatically, so a domain with ` +
              `no sign of work for days is still here and reads "stale".`,
      }
    },
  )

  app.get(
    '/work-domains',
    route(
      'workdomain.list',
      'remote',
      'The open work domains in this project, each with the stage it is at and how long since anything showed a ' +
        'sign of work. THE SIGN IS AN AGE AND NEVER A STORED WORD: ten session records in this corpus say ' +
        '"running" and nine have been silent for a fortnight, so nothing here reads a state field and nothing ' +
        'probes a process.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const domains = openDomainsIn(workspaceId)
      return {
        domains: domains.map(rowOf),
        note:
          domains.length === 0
            ? 'Nobody has filed a work domain in this project. One is filed through POST /api/records with ' +
              'kind "work_domain" — what you believe you are about to do, before asking Mole Office what it knows.'
            : `${String(domains.length)} open work domain${domains.length === 1 ? '' : 's'}. Nothing is closed ` +
              `automatically: a domain with no sign of work for eleven days is drawn as exactly that, because ` +
              `deciding on somebody's behalf that their work is over is a guess.`,
      }
    },
  )

  app.get(
    '/work-domains/:id',
    route(
      'workdomain.read',
      'remote',
      'One work domain: what the agent said, what the machine resolved, the difference between the two, and any ' +
        'overlap with another open domain. The diff is RECOMPUTED from the stored resolution and is never stored ' +
        'itself, so what it shows is a pure function of one revision’s own data.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const record = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      if (record.kind !== WORK_DOMAIN_KIND) {
        throw new PanelError(`${id} is not a work domain, so it has no declared scope to read.`, 400)
      }
      const data = (record.data ?? {}) as Record<string, unknown>
      const ctx = {
        workspaceId,
        repository: typeof data['repository'] === 'string' && data['repository'] !== '' ? data['repository'] : null,
        index: indexFor(workspaceId),
        indexedRepositories: indexedRepositoriesFor(workspaceId),
        pathsIn: scanFor(workspaceId),
        implementation: new ClaimsImplementation(workspaceId),
      }
      const stored = data['resolved']
      const resolution =
        typeof stored === 'object' && stored !== null && !Array.isArray(stored)
          ? (stored as ReturnType<typeof resolveDomain>)
          : null
      const others = openDomainsIn(workspaceId)
        .filter((d) => d.id !== id)
        .map((d) => sideOf(d, ctx))
      const differences =
        resolution === null ? [] : differencesFor({ domainId: id, data, resolution, ctx, others })
      const me = openDomainsIn(workspaceId).find((d) => d.id === id)
      const overlaps = me === undefined ? [] : others.flatMap((other) => classifyOverlap(sideOf(me, ctx), other))
      return {
        domain: {
          id: record.id,
          title: record.title,
          objective: data['objective'] ?? null,
          agent: data['agent'] ?? null,
          session: data['session'] ?? null,
          about: aboutLinksOf(id),
        },
        believed: {
          writes: data['writes'] ?? [],
          creates: data['creates'] ?? [],
          dependsOn: data['dependsOn'] ?? [],
        },
        resolved: resolution,
        differences,
        overlaps,
        accepted: data['accepted'] ?? null,
        acknowledged: data['acknowledged'] ?? [],
        // FROM THE ROWS THE LEDGER ALREADY HOLDS. This read writes nothing: only `observe` scans,
        // and what it writes is the rebuild and the observations that fall out of it.
        drift: driftFor(id, workspaceId),
        note:
          resolution === null
            ? `Nothing has been resolved yet. Ask for the resolution when you are ready: ` +
              `POST /api/work-domains/${id}/resolve. Mole Office does not volunteer it, because a hypothesis written ` +
              `after reading the machine's answer is the machine's answer with a signature on it.`
            : `${String(differences.length)} difference${differences.length === 1 ? '' : 's'} between what you ` +
              `said and what Mole Office read. Both are kept, side by side, and neither replaces the other.`,
      }
    },
  )
}
