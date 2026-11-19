// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The durable export, over HTTP.
 *
 *   GET  /api/export             -> what an export of the WHOLE INSTALLATION would contain. Writes nothing.
 *   POST /api/export             -> write it. Takes no body.
 *   GET  /api/export/workspace   -> the same, for the ONE project `x-mole-office-workspace` names.
 *   POST /api/export/workspace   -> write that project's archive to `mirror-<id>`, beside `mirror`.
 *
 * ---------------------------------------------------------------------------------------
 * TWO ENDPOINTS BECAUSE THERE ARE TWO ARTEFACTS, AND SENDING THE HEADER TO THE WRONG ONE IS REFUSED
 * ---------------------------------------------------------------------------------------
 *
 * `mirror/` is this installation, all of its projects, and it is what the git mirror commits.
 * `mirror-greenhouse/` is one project and restores on its own into a database that may already hold
 * others. They are the same file format and they restore into completely different states.
 *
 * So `/api/export` REFUSES a request carrying `x-mole-office-workspace` rather than choosing for it.
 * Every other endpoint reads that header as "the project I am working in"; here it could equally
 * mean "archive my project" or "archive everything, I just happen to be working in greenhouse", and
 * the direction this was built under is explicit that an ambiguous write fails and reports rather
 * than landing somewhere plausible. The refusal names the other endpoint. Answering the whole
 * installation to somebody who thought they were archiving their project — or worse, silently
 * narrowing the mirror to one project and pruning the rest of it away — is the failure.
 *
 * The format is specified in design/durability/FORMAT.md; src/server/lib/export.ts implements it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY POST DOES NOT COMMIT, AND WHY IT SAYS SO RATHER THAN SILENTLY NOT DOING IT
 * ---------------------------------------------------------------------------------------
 *
 * Committing means running git, and running git means spawning a process. A7's rule is that one
 * interface talks to the operating system — `OsProbe` in lib/resources.ts — and
 * tests/resources.test.ts enforces it by grepping every file under `src/` for
 * `node:child_process`. `OsProbe` has no method for running a command, so nothing under `src/` may
 * spawn git, and the mirror's only `GitRunner` lives in `scripts/export.ts`, outside the rule.
 *
 * So this endpoint writes the text and the CLI commits it. The reply says that in words on every
 * call, because an export that quietly did half of what its name promises is exactly the shape of
 * silent failure this product refuses everywhere else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NEITHER ENDPOINT TAKES A DESTINATION
 * ---------------------------------------------------------------------------------------
 *
 * A path in the body would be a loopback page able to write files anywhere this process can reach.
 * The server exports to one place — `exportRoot()`, which is `mirror/` beside the database this
 * process opened — and `GET` says where that is so nobody has to guess. The CLI takes `--to`,
 * because a person on a terminal has already chosen.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  EXPORTED_REGIONS,
  FORMAT_VERSION,
  buildExport,
  exportRoot,
  workspaceExportRoot,
  writeExport,
} from '../lib/export.ts'
import { mirrorStatus } from '../lib/gitmirror.ts'
import { DERIVED_TABLES } from '../db/schema.ts'
import { PanelError } from '../lib/panel-error.ts'
import { takesNoInput, workspaceFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { requireWorkspace } from '../lib/require-workspace.ts'
import { route } from '../lib/route.ts'

/**
 * Refuse a whole-installation export that names a project, because the request means two things.
 *
 * Not a filter and not a preference: the caller is told which endpoint archives one project and
 * which archives the installation, and neither runs until they say which they meant.
 */
function refuseWorkspaceHeader(req: FastifyRequest, what: string): void {
  if (!workspaceFrom(req).stated) return
  throw new PanelError(
    `${what} archives the WHOLE INSTALLATION — every project this database holds — and this request carried ` +
      `x-mole-office-workspace. Those are two different archives and nothing was ${what.startsWith('GET') ? 'read' : 'written'}: ` +
      `${what.split(' ')[0]} /api/export/workspace archives the one project the header names, into a directory of its ` +
      `own beside the installation's. Send this request without the header to archive everything.`,
  )
}

/** The project a per-workspace export is about: the header, checked against the registry. */
function exportWorkspace(req: FastifyRequest): string {
  const claim = workspaceFrom(req)
  return requireWorkspace(claim.id, claim.stated).id
}

/** The one sentence that must appear on both replies: what this endpoint does not do. */
const COMMITTING_IS_THE_CLI =
  'This endpoint writes files and never commits them. Committing runs git, running git spawns a process, and ' +
  'inside src/ every spawn belongs to OsProbe (see src/server/lib/resources.ts) — which has no method for it. ' +
  'Commit with: npx tsx scripts/export.ts'

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  /**
   * What an export would contain, without producing one.
   *
   * It BUILDS the whole export in memory to answer, rather than counting rows, because "how many
   * files and how many bytes" answered from a different code path to the one that writes them is
   * a number about nothing. Nothing touches the disk.
   */
  app.get(
    '/export',
    route(
      'archive.plan',
      'remote',
      'What a durable export would contain right now — the format version, the row count of every authored table ' +
        'but panel_layouts, which no backup or export carries, ' +
        'how many files and bytes it comes to, where it would be written, and whether a git mirror is already there. ' +
        'Writes nothing. POST the same path to actually write it. This is the WHOLE installation, every project ' +
        'in it; GET /api/export/workspace answers for one. Refuses a request that carries x-mole-office-workspace, ' +
        'because those are two different archives.',
    ),
    async (req): Promise<{
      format: string
      workspace: string | null
      root: string
      wouldWrite: { files: number; bytes: number }
      counts: Record<string, number>
      notExported: readonly string[]
      mirror: { root: string; exists: boolean; isRepository: boolean }
      notes: string[]
      committing: string
    }> => {
      refuseWorkspaceHeader(req, 'GET /api/export')
      const built = buildExport()
      return {
        format: FORMAT_VERSION,
        workspace: built.report.workspace,
        root: exportRoot(),
        wouldWrite: { files: built.report.files, bytes: built.report.bytes },
        counts: built.report.counts,
        // Named on every reply, because a table that is absent by decision and a table somebody
        // forgot look identical from the outside, and only one of them is safe.
        notExported: DERIVED_TABLES,
        mirror: mirrorStatus(exportRoot()),
        notes: built.report.notes,
        committing: COMMITTING_IS_THE_CLI,
      }
    },
  )

  /**
   * Write the export.
   *
   * TAKES NO BODY. There is nothing to configure: the destination is fixed for the reason in the
   * header, and an export is all of the data or it is not an export.
   *
   * `written` and `removed` are the file paths that actually changed, not every file produced. An
   * export that rewrote 319 identical files would report 319 changes and mean none of them, and
   * the mirror's commit message is built from exactly this list.
   */
  app.post(
    '/export',
    route(
      'archive.write',
      'local',
      // It writes files into a directory on THIS host's disk, and lib/gitmirror.ts states the rule
      // and its cost. An export asked from elsewhere still writes here, where the asker cannot see it.
      { because: 'acts-on-this-machine', act: "Writing the whole archive to this computer's disk" },
      'Write the durable export to disk: every authored table but panel_layouts as readable ' +
        'Markdown, including soft-deleted records, ' +
        'each record\'s origin — whether it entered the corpus through the generated fixture or was filed as real ' +
        'work — link provenance, gates and the whole change log. Takes NO BODY. Replies with what changed — files ' +
        'written, files removed, row counts — and with how to commit it, which this endpoint deliberately does not do. ' +
        'This is the WHOLE installation; POST /api/export/workspace writes one project. Refuses a request that ' +
        'carries x-mole-office-workspace, because those are two different archives.',
    ),
    async (req): Promise<{
      ok: true
      root: string
      format: string
      files: number
      bytes: number
      written: string[]
      removed: string[]
      unchanged: number
      counts: Record<string, number>
      tables: { exported: readonly string[]; rebuiltByScanning: readonly string[] }
      notes: string[]
      committing: string
      workspace: string | null
    }> => {
      refuseWorkspaceHeader(req, 'POST /api/export')
      // It published "Takes NO BODY" and took one: measured, `{"destination":"/tmp/somewhere-else"}`
      // was answered 200 with 452 files written to the configured root and /tmp/somewhere-else never
      // created. A caller sending a destination believes this endpoint has one.
      takesNoInput(req, 'POST /api/export',
          'It writes the whole installation to the one archive root, and there is nothing to configure — ' +
            'where it goes is where the mirror is, and committing it is deliberately yours to do.',)
      const report = writeExport()
      return {
        ok: true,
        workspace: report.workspace,
        root: report.root,
        format: report.format,
        files: report.files,
        bytes: report.bytes,
        written: report.written,
        removed: report.removed,
        unchanged: report.unchanged,
        counts: report.counts,
        tables: { exported: EXPORTED_REGIONS, rebuiltByScanning: DERIVED_TABLES },
        notes: report.notes,
        committing: COMMITTING_IS_THE_CLI,
      }
    },
  )

  /**
   * What ONE project's archive would contain.
   *
   * The same build, read through one workspace. A project that does not exist is a refusal and
   * never an empty archive: "this project holds nothing" and "there is no such project" are
   * different answers, and only one of them is a reason to go and look for your work.
   */
  app.get(
    '/export/workspace',
    route(
      'archive.plan',
      'remote',
      'What a durable export of ONE project would contain — the project x-mole-office-workspace names, or the default ' +
        'workspace when the header is absent. Same format as GET /api/export, holding only that project\'s rows and ' +
        'declaring only that project. Writes nothing; POST the same path to write it to mirror-<id>.',
    ),
    async (
      req,
    ): Promise<{
      format: string
      workspace: string
      root: string
      wouldWrite: { files: number; bytes: number }
      counts: Record<string, number>
      notExported: readonly string[]
      notes: string[]
      committing: string
    }> => {
      const workspaceId = exportWorkspace(req)
      const built = buildExport({ workspaceId })
      return {
        format: FORMAT_VERSION,
        workspace: workspaceId,
        root: workspaceExportRoot(workspaceId),
        wouldWrite: { files: built.report.files, bytes: built.report.bytes },
        counts: built.report.counts,
        notExported: DERIVED_TABLES,
        notes: built.report.notes,
        committing: COMMITTING_IS_THE_CLI,
      }
    },
  )

  /**
   * Write ONE project's archive, into a directory of its own.
   *
   * NOT INTO THE INSTALLATION'S MIRROR. `writeExport` deletes files the current export no longer
   * produces — that is what stops a deleted record coming back on the next import — so one
   * project written into the shared directory would delete every other project's files and report
   * the deletions as tidying up. `workspaceExportRoot` is why the destination is not a parameter.
   */
  app.post(
    '/export/workspace',
    route(
      'archive.write',
      'local',
      // The same disk on this host, one project's worth of it.
      { because: 'acts-on-this-machine', act: "Writing one project's archive to this computer's disk" },
      'Write ONE project\'s durable archive: the project x-mole-office-workspace names, into mirror-<id> beside the ' +
        'installation\'s mirror. Takes NO BODY. Self-contained — it declares its own workspace row — so it can be ' +
        'restored on its own into a database that already holds other projects.',
    ),
    async (
      req,
    ): Promise<{
      ok: true
      workspace: string
      root: string
      format: string
      files: number
      bytes: number
      written: string[]
      removed: string[]
      unchanged: number
      counts: Record<string, number>
      tables: { exported: readonly string[]; rebuiltByScanning: readonly string[] }
      notes: string[]
      committing: string
    }> => {
      takesNoInput(req, 'POST /api/export/workspace',
          'Which project it writes is the x-mole-office-workspace header, and where it goes follows from that.',)
      const workspaceId = exportWorkspace(req)
      const report = writeExport(workspaceExportRoot(workspaceId), { workspaceId })
      return {
        ok: true,
        workspace: workspaceId,
        root: report.root,
        format: report.format,
        files: report.files,
        bytes: report.bytes,
        written: report.written,
        removed: report.removed,
        unchanged: report.unchanged,
        counts: report.counts,
        tables: { exported: EXPORTED_REGIONS, rebuiltByScanning: DERIVED_TABLES },
        notes: report.notes,
        committing: COMMITTING_IS_THE_CLI,
      }
    },
  )
}
