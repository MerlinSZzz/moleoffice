// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S PAGE. Wave 13s round 241.
 *
 * One page, one graph, three times at once: the past in the revision ledger and its stopping points, the present in
 * the modules, pipelines and blocks that exist now, and the live futures with the plans and work windows that put
 * work in time. The drawing is src/web/components/graph/ProjectGraph.tsx; what is here is the read, the level
 * control and the page's own words.
 *
 * THE READ IS ONE useProjectAsync. GET /api/project-graph is the graph; GET /api/source/coverage is the source map, asked
 * when the graph does not say the project has none: when it says there is one, and when unreadable index data leaves it
 * unable to say. A project with no index therefore says so in a sentence of the page's body and makes no request that is
 * designed to answer 404. A source map that could not be read, including one whose index data is damaged, is caught to
 * null and said in a different sentence, so it never turns into a zero or the no-map sentence. The graph failing is the
 * page failing, with the retry the error note draws.
 *
 * HOW TO READ THE DRAWING, AND WHAT THE SOURCE MAP GAVE, ARE BODY TEXT. A picture carries no small print, so the
 * drawing has no key strip and no line under it. Both are said once, as paragraphs right after the lead, in the
 * lead's own style. The source-map paragraph waits for the read, because until the read has answered nobody knows
 * what the map gave.
 *
 * THE PAGE KEEPS NO COPY BETWEEN VISITS. It reads both doors every time it mounts and holds no answer in the
 * browser. The level is the reader's place in this visit and nothing else.
 *
 * THE LEVEL CONTROL HAS FOUR LEVELS, IN ONE SET ORDER. PROJECT_GRAPH_LEVELS is the order and
 * PROJECT_GRAPH_LEVEL_WORD_KEYS is the word each one reads, so the page's labels cannot become a second list. The
 * page carries data-graph-level and each button carries data-level, which is what the browser test reads.
 */
import { useMemo, useState } from 'react'
import {
  PROJECT_GRAPH_LEVELS,
  PROJECT_GRAPH_LEVEL_WORD_KEYS,
  type ProjectGraphLevel,
  type ProjectGraphReply,
} from '@shared/project-graph.ts'
import { sentencesJoined, t, type WordKey } from '@shared/i18n.ts'
import type { SourceCoverageResponse } from '../../server/api/source.ts'
import { moleOfficeRequest } from '../api.ts'
import { ProjectGraph } from '../components/graph/ProjectGraph.tsx'
import { buildProjectGraph } from '../components/graph/project-graph-model.ts'
import { ErrorNote, Loading } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'

export interface ThePagesRead {
  graph: ProjectGraphReply
  coverage: SourceCoverageResponse | null
  /**
   * False only when the graph says this project has no source index, and the coverage door was therefore not asked.
   * Null when the graph could not tell, which asks the coverage door and keeps the graph.
   */
  sourceIndexBuilt: boolean | null
}

/** A request a test can replace with a table of fakes, so the doors this page asks are visible. */
type ARequest = <T>(path: string) => Promise<T>

/**
 * WHAT THE PAGE READS, in one place so its test can see which doors it asks.
 *
 * The graph comes first. A project with no source index has no coverage to serve, and the coverage door answers that
 * state with the 404 it is designed to answer, so the page does not ask: it keeps the graph and says in the body that
 * the project has no source map yet. A project with an index asks, and a failed read is kept as null so the page can
 * say it could not be read rather than draw a zero. When the graph cannot tell whether there is an index, because the
 * stored index data is unreadable, the page asks coverage too: that failure is the coverage door's to report, and the
 * graph still draws.
 */
export async function readTheGraphPage(ask: ARequest = moleOfficeRequest): Promise<ThePagesRead> {
  const graph = await ask<ProjectGraphReply>('/api/project-graph')
  if (graph.sourceIndexBuilt === false) return { graph, coverage: null, sourceIndexBuilt: false }
  const coverage = await ask<SourceCoverageResponse>('/api/source/coverage').catch(() => null)
  return { graph, coverage, sourceIndexBuilt: graph.sourceIndexBuilt }
}

export function ProjectGraphPage() {
  useLanguage()
  const [level, setLevel] = useState<ProjectGraphLevel>('modules')
  const [read, reload] = useProjectAsync<ThePagesRead>(() => readTheGraphPage(), [])
  const model = useMemo(() => (read.status === 'ready' ? buildProjectGraph(read.value.graph) : null), [read])

  return (
    <div className="page gph-page" data-graph-level={level}>
      <style href="mole-office-project-graph-page" precedence="default">
        {PROJECT_GRAPH_PAGE_CSS}
      </style>
      <h1 className="gph-page-title">{t('projectGraph.title')}</h1>
      <p className="gph-page-lead">{t('projectGraph.lead')}</p>
      <p className="gph-page-lead" data-graph-says="key">
        {sentencesJoined([t('projectGraph.legend.future'), t('projectGraph.legend.present'), t('projectGraph.legend.canvas')])}
      </p>
      {read.status === 'ready' ? (
        <p className="gph-page-lead" data-graph-says="coverage">
          {theSourceMapSentence(read.value)}
        </p>
      ) : null}
      <div className="gph-levels" role="radiogroup" aria-label={t('projectGraph.level.label')}>
        {PROJECT_GRAPH_LEVELS.map((one) => (
          <button
            key={one}
            type="button"
            role="radio"
            aria-checked={level === one}
            className="gph-level"
            data-level={one}
            onClick={() => setLevel(one)}
          >
            {t(PROJECT_GRAPH_LEVEL_WORD_KEYS[one] as WordKey)}
          </button>
        ))}
      </div>
      {read.status === 'loading' ? <Loading what={t('projectGraph.title')} /> : null}
      {read.status === 'error' ? <ErrorNote message={read.message} fault={read.fault} retry={reload} /> : null}
      {read.status === 'ready' && model !== null ? (
        <ProjectGraph model={model} level={level} />
      ) : null}
    </div>
  )
}

/**
 * THE SOURCE MAP'S SENTENCE, for the three states the read can be in: no map yet (this project has no source index), the
 * counts (the map was read), and a failed read (the project has one or could not say, and the door failed). The three
 * are different sentences because they are different facts; a missing map is not a read that failed.
 */
export function theSourceMapSentence(read: Pick<ThePagesRead, 'sourceIndexBuilt' | 'coverage'>): string {
  if (read.sourceIndexBuilt === false) return t('projectGraph.coverage.none')
  const coverage = read.coverage?.coverage ?? null
  if (coverage === null) return t('projectGraph.coverage.failed')
  return sentencesJoined([
    t('projectGraph.coverage', { total: coverage.totalFiles, claimed: coverage.claimedFiles, n: coverage.totalFiles }),
    t('projectGraph.coverage.unclaimed', { n: coverage.unclaimedFiles }),
  ])
}

/** The page's own frame: its heading, its lead and the one control. The drawing's rules live with the drawing. */
const PROJECT_GRAPH_PAGE_CSS = `
.gph-page { min-width: 0; }
.gph-page-title {
  margin: 0;
  font: 600 var(--fs-5)/var(--lh-tight) var(--font-ui);
  color: var(--text);
  overflow-wrap: anywhere;
}
.gph-page-lead {
  max-width: var(--measure);
  margin: var(--pad) 0 var(--gut);
  font: var(--fs-3)/var(--lh-read) var(--font-ui);
  color: var(--text-2);
}
.gph-levels {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 var(--gut);
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--panel-2);
  min-width: 0;
}
.gph-level {
  min-width: 0;
  padding: calc(var(--pad) * 0.6) var(--pad);
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-2);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  text-align: left;
  white-space: normal;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.gph-level:hover { background: var(--panel-3); color: var(--text); }
.gph-level[aria-checked="true"] { background: var(--accent); color: var(--accent-text); }
.gph-level:focus-visible {
  outline: var(--focus-w) solid var(--accent);
  outline-offset: var(--focus-offset);
}
@media (max-width: 40rem) {
  .gph-levels { width: 100%; }
  .gph-level { flex: 1 1 auto; }
}
`
