// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH PAGE ASKS FOR THE SOURCE MAP ONLY WHEN THE PROJECT HAS ONE, AND SAYS WHICH
 * STATE IT IS IN.
 *
 * The page reads `GET /api/project-graph` first. The graph says whether this project has a source
 * index (`sourceIndexBuilt`), or null when damaged stored index data leaves it unable to say. Only
 * when it does not say the project has none does the page ask `GET /api/source/coverage`, the door
 * that 404s, by design, for a project with no index. A project without an index therefore makes one
 * request and says plainly that it has no source map yet; the old page made the second request on
 * every project and called the expected 404 "the source map could not be read".
 *
 * THE WORDS ARE READ FROM THE CODE through `t()`, never copied. Three answers for the states:
 * no map yet (`projectGraph.coverage.noMap`), counts (`projectGraph.coverage` and
 * `projectGraph.coverage.unclaimed`), and a real failed read (`projectGraph.coverage.notRead`).
 * CRITERION CHANGE, as decided: the no-map and failed answers are short state words now, not sentences. A graph that cannot
 * tell whether there is an index, because the stored index data is damaged, asks the coverage door
 * and uses the failed sentence; it is not the no-map state.
 *
 * The page's own read function is asked here with a request that is not the network, so the cases
 * pin which doors are asked. The graph read's field itself is pinned by the graph read's own test
 * through the route; this file pins the page's use of it.
 */
import { describe, expect, it } from 'vitest'

import { sentencesJoined, t } from '../src/shared/i18n.ts'
import type { ProjectGraphReply } from '../src/shared/project-graph.ts'
import type { SourceCoverageResponse } from '../src/server/api/source.ts'
import * as thePage from '../src/web/pages/ProjectGraphPage.tsx'

interface ThePagesRead {
  graph: ProjectGraphReply
  coverage: SourceCoverageResponse | null
  sourceIndexBuilt: boolean | null
}

type Ask = <T>(path: string) => Promise<T>
type ReadThePage = (ask: Ask) => Promise<ThePagesRead>
type TheSentence = (read: { sourceIndexBuilt: boolean | null; coverage: SourceCoverageResponse | null }) => string

// THE CRITERION RUNS BEFORE THE EXPORTS EXIST. A namespace import keeps the file loading, so each
// case fails by its own name instead of the whole file failing at import time.
const readTheGraphPage = (thePage as unknown as { readTheGraphPage: ReadThePage }).readTheGraphPage
const theSourceMapSentence = (thePage as unknown as { theSourceMapSentence: TheSentence }).theSourceMapSentence

const aGraph = (sourceIndexBuilt: boolean | null): ProjectGraphReply =>
  ({ sourceIndexBuilt }) as unknown as ProjectGraphReply

const aCoverage = {
  index: { root: 'made-up', builtAt: 'made-up', builtBy: 'made-up', fileCount: 2, scanMs: 1, skipped: [] },
  coverage: { totalFiles: 2, claimedFiles: 1, unclaimedFiles: 1, modules: [] },
} as unknown as SourceCoverageResponse

/** A request that records every path and answers from a table of fakes. */
function askedOf(answer: (path: string) => unknown, failureOn?: string): { ask: Ask; paths: string[] } {
  const paths: string[] = []
  const ask: Ask = async <T>(path: string): Promise<T> => {
    paths.push(path)
    if (path === failureOn) throw new Error('made-up failure')
    return answer(path) as T
  }
  return { ask, paths }
}

describe('the project graph page’s source-map read', () => {
  it('asks no source-map door for a project with no source index, and says the map is not there yet', async () => {
    const { ask, paths } = askedOf(() => aGraph(false))
    const read = await readTheGraphPage(ask)
    expect(paths, 'only the graph door is asked').toEqual(['/api/project-graph'])
    expect(read.sourceIndexBuilt).toBe(false)
    expect(read.coverage, 'no source map is read').toBeNull()
    expect(read.graph, 'the graph is still read').toEqual(aGraph(false))
    expect(theSourceMapSentence(read), 'the no-map word, read from the word file').toBe(t('projectGraph.coverage.noMap'))
  })

  it('asks the source-map door when the project has one, and says the counts it answered', async () => {
    const { ask, paths } = askedOf((path) => (path === '/api/source/coverage' ? aCoverage : aGraph(true)))
    const read = await readTheGraphPage(ask)
    expect(paths, 'the graph first, then the source map').toEqual(['/api/project-graph', '/api/source/coverage'])
    expect(read.sourceIndexBuilt).toBe(true)
    expect(read.coverage, 'the counts are kept, not dropped').toEqual(aCoverage)
    expect(
      theSourceMapSentence(read),
      'the counts sentence, read from the word file',
    ).toBe(
      sentencesJoined([
        t('projectGraph.coverage', { total: 2, claimed: 1, n: 2 }),
        t('projectGraph.coverage.unclaimed', { n: 1 }),
      ]),
    )
  })

  it('keeps the graph when a project that has a source map cannot read it, and says that', async () => {
    const { ask, paths } = askedOf((path) => aGraph(true), '/api/source/coverage')
    const read = await readTheGraphPage(ask)
    expect(paths).toEqual(['/api/project-graph', '/api/source/coverage'])
    expect(read.sourceIndexBuilt).toBe(true)
    expect(read.coverage, 'a failed read is null, never a zero').toBeNull()
    expect(read.graph).toEqual(aGraph(true))
    expect(theSourceMapSentence(read), 'the not-read word, read from the word file').toBe(
      t('projectGraph.coverage.notRead'),
    )
  })

  it('asks the source-map door when damaged index data leaves the graph unable to say, and keeps the graph', async () => {
    const { ask, paths } = askedOf((path) => (path === '/api/project-graph' ? aGraph(null) : undefined), '/api/source/coverage')
    const read = await readTheGraphPage(ask)
    expect(paths, 'a cannot-tell graph still asks the source-map door').toEqual(['/api/project-graph', '/api/source/coverage'])
    expect(read.sourceIndexBuilt, 'cannot tell is not no index').toBeNull()
    expect(read.coverage, 'the failed coverage read is null').toBeNull()
    expect(read.graph).toEqual(aGraph(null))
    expect(theSourceMapSentence(read), 'the not-read word, not the no-map word').toBe(
      t('projectGraph.coverage.notRead'),
    )
  })
})
