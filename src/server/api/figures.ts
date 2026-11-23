// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR FIGURES THE HOME PAGE LACKS, OVER HTTP. Wave 13s round 281; the shapes are src/shared/figures.ts.
 *
 *   GET /api/figures/packages-by-line   packages per line, by state
 *   GET /api/figures/packages-done      packages done per day of a span
 *   GET /api/figures/time-to-live       each package's time from taken to handed back to on main to live, and the medians
 *   GET /api/figures/suite-minutes      the whole suite's minutes per run, and their median
 *   GET /api/figures/my-decisions       the forks the person settled, and the average time each waited on him
 *
 * The reads are src/server/lib/figures-*.ts. What is here is the door: the query, the projects asked, and the reply.
 * Each answers for the request's project, or with `?projects=` for the projects it names or for every project. The
 * three that take a span read it with `?from=` and `?to=`, through `theSpanAsked`. Any other word is refused with 400.
 * Nothing is written.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { PROJECTS_QUERY } from '@shared/across-projects.ts'
import { FIGURES_SPAN_DAYS } from '@shared/figures.ts'
import { theProjectsAQueryAsks } from '../lib/across-projects.ts'
import { packagesByLine } from '../lib/figures-by-line.ts'
import { packagesDonePerDay } from '../lib/figures-done-per-day.ts'
import { theSpanAsked } from '../lib/figures-span.ts'
import { myDecisions } from '../lib/figures-my-decisions.ts'
import { wholeSuiteMinutes } from '../lib/figures-suite-minutes.ts'
import { timeToLive } from '../lib/figures-time-to-live.ts'
import { actorFrom } from '../lib/http.ts'
import { theMessageReader } from '../lib/messages.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

// ============================================================================ the sentences

const ACROSS =
  ' ?projects=all reads every project together, and ?projects=<project id> reads that one project; the reply names the ' +
  'projects it read. Writes nothing.'

const SPAN =
  ' The span is ?from=YYYY-MM-DD&to=YYYY-MM-DD, local days in the office\'s time zone, both included; with neither it is the ' +
  `last ${FIGURES_SPAN_DAYS.default} days, today among them, and it may cover at most ${FIGURES_SPAN_DAYS.most} days.`

const BY_LINE_NOTE =
  'PACKAGES PER LINE, BY STATE. Each line with how many of its packages are in each state the delegation view gives, ' +
  'then the row of no line, always last. A package with two lines counts in each, and `inMoreThanOneLine` says how many ' +
  'do. A package that cannot be read is named in `couldNotRead` rather than counted.' + ACROSS

const DONE_NOTE =
  'PACKAGES DONE PER DAY. Each day of the span with how many packages turned done that day, read from each package\'s own ' +
  'acceptances and confirmation. A day the records do not cover — before the first package was made, or after today — ' +
  'has `done` null and says why in `notRecorded`; a covered day with none is 0.' + SPAN + ACROSS

const TIME_TO_LIVE_NOTE =
  'EACH PACKAGE\'S TIME TO LIVE. Each package first taken inside the span, with when it was taken, handed back, on main ' +
  'and live. A stage the records do not hold has `at` null and says why in `notRecorded`. `medians` gives the median ' +
  'minutes of each stretch and how many packages it is over.' + SPAN + ACROSS

const SUITE_NOTE =
  'THE WHOLE SUITE\'S MINUTES PER RUN. Each whole-suite receipt that ended inside the span, with its minutes and whether ' +
  'it is green, then the median minutes. A run whose times cannot be measured has `minutes` null and says why. A span ' +
  'with no run says so, and says how many runs the records do hold.' + SPAN + ACROSS

const MY_DECISIONS_NOTE =
  'THE PERSON\'S DECISIONS. How many forks the person settled inside the span, each counted once, and the average ' +
  'minutes a fork waited on the person, from when it was filed to when the person settled it; each day of the span ' +
  'with its own count and average. ' +
  'A fork counts when a person linked a decision that settles it. With none settled the average is null, which is not ' +
  'known and not 0.' + SPAN + ACROSS

// ============================================================================ the doors

const NO_SPAN = z.strictObject({})
const A_SPAN = z.strictObject({ from: z.string().optional(), to: z.string().optional() })

/** The query without `?projects=`, which `theProjectsAsked` reads, so the rest is read strictly. */
function theRestOfTheQuery(req: FastifyRequest): Record<string, unknown> {
  const { [PROJECTS_QUERY]: projects, ...rest } = (req.query ?? {}) as Record<string, unknown>
  void projects
  return rest
}

/** The projects a figure is read for: the ones `?projects=` asks, or the request's own project. */
function theProjectsAsked(req: FastifyRequest): string[] {
  const asked = theProjectsAQueryAsks(req.query, theMessageReader(actorFrom(req)))
  return asked === null ? [workspaceOf(req)] : asked.map((workspace) => workspace.id)
}

export async function figureRoutes(app: FastifyInstance): Promise<void> {
  app.get('/figures/packages-by-line', route('figures.packages-by-line', 'remote', BY_LINE_NOTE), async (req) => {
    parse(NO_SPAN, theRestOfTheQuery(req), 'The query string')
    return packagesByLine(theProjectsAsked(req))
  })

  app.get('/figures/packages-done', route('figures.packages-done', 'remote', DONE_NOTE), async (req) => {
    const asked = parse(A_SPAN, theRestOfTheQuery(req), 'The query string')
    const span = theSpanAsked(asked.from, asked.to)
    return packagesDonePerDay(theProjectsAsked(req), span)
  })

  app.get('/figures/time-to-live', route('figures.time-to-live', 'remote', TIME_TO_LIVE_NOTE), async (req) => {
    const asked = parse(A_SPAN, theRestOfTheQuery(req), 'The query string')
    const span = theSpanAsked(asked.from, asked.to)
    return timeToLive(theProjectsAsked(req), span)
  })

  app.get('/figures/suite-minutes', route('figures.suite-minutes', 'remote', SUITE_NOTE), async (req) => {
    const asked = parse(A_SPAN, theRestOfTheQuery(req), 'The query string')
    const span = theSpanAsked(asked.from, asked.to)
    return wholeSuiteMinutes(theProjectsAsked(req), span)
  })

  app.get('/figures/my-decisions', route('figures.my-decisions', 'remote', MY_DECISIONS_NOTE), async (req) => {
    const asked = parse(A_SPAN, theRestOfTheQuery(req), 'The query string')
    const span = theSpanAsked(asked.from, asked.to)
    return myDecisions(theProjectsAsked(req), span)
  })
}
