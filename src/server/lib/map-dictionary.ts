// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DICTIONARY: A FILE OR A MODULE IN, ITS BLOCK, MODULE AND OWNING LINE OUT.
 *
 *   1. file to module   the stated rows of each repository of the project whose pattern matches the path, by
 *                       `filesMatching`, the rule GET /api/implementation/resource uses. No module is guessed from a
 *                       folder: a path no module states answers with no module.
 *   2. module to block  the boxes of the big map the module `implements`, read with the map itself
 *                       (src/shared/big-map-reading.ts), so the dictionary and the drawn map name the same block.
 *   3. owning line      the module's `owner` field, or null: nobody has recorded one.
 *
 * With no master pipeline marked, or a broken mark, the map is not read: `master` says why and each module's
 * `places` is null. NO QUERY READS A WHOLE TABLE: each read names the ids it wants.
 */
import { blockIdsOf } from '@shared/blocks.ts'
import { readTheBigMap, thePlacesOf, type DictionaryModule, type MapDictionary, type MapRecord, type TheBigMap } from '@shared/big-map-reading.ts'
import { isParticipantKind, type ParticipantRef } from '@shared/participants.ts'
import { filesMatching } from '@shared/paths.ts'
import type { PanelRecord } from '@shared/types.ts'

import { statedInRepository } from '../db/stated-in-repository.ts'
import { theMasterPipeline } from './master-pipeline.ts'
import { linksFrom, linksTo } from '../db/links-to-and-from.ts'
import { liveHere } from '@shared/live-here.ts'
import { PanelError } from './panel-error.ts'
import { getRecordsWithIds } from './records/reading.ts'
import { listRepositories } from '../db/list-repositories.ts'

const byTitleThenId = (a: MapRecord, b: MapRecord): number => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)

/**
 * The big map of a project whose master is marked, read by id: the master, its steps, the pipelines hung on them and their steps.
 * The presentation store reads the master's boxes here too (src/server/lib/presentation.ts), so the map, this dictionary and the
 * store name the same boxes.
 */
export function theBigMapOf(project: string, masterId: string): TheBigMap {
  const records = new Map<string, PanelRecord>()
  const keep = (found: ReadonlyMap<string, PanelRecord>): void => {
    for (const record of found.values()) if (liveHere(record, project)) records.set(record.id, record)
  }
  keep(getRecordsWithIds([masterId]))
  const master = records.get(masterId)!
  const blockIds = blockIdsOf(master)
  keep(getRecordsWithIds(blockIds))
  const partOf = linksTo(blockIds, 'part_of')
  keep(getRecordsWithIds(partOf.map((link) => link.fromId)))
  const pipelines = [...records.values()].filter((record) => record.kind === 'pipeline' && record.id !== masterId)
  keep(getRecordsWithIds(pipelines.flatMap((pipeline) => blockIdsOf(pipeline))))
  return readTheBigMap(master, records, partOf.map((link) => ({ ...link, type: 'part_of' })))
}

/** The module's `owner` field, when it names a participant. */
function theOwnerOf(module: PanelRecord): ParticipantRef | null {
  const owner = module.data['owner'] as { kind?: unknown; id?: unknown } | null | undefined
  if (owner === null || typeof owner !== 'object' || !isParticipantKind(owner.kind) || typeof owner.id !== 'string') return null
  return { kind: owner.kind, id: owner.id }
}

export function readTheMapDictionary(project: string, asked: { path: string } | { module: string }): MapDictionary {
  const master = theMasterPipeline(project)
  const modules: { record: PanelRecord; matched: DictionaryModule['matched'] }[] = []
  const others: MapDictionary['others'] = []

  if ('path' in asked) {
    const matchedOf = new Map<string, DictionaryModule['matched']>()
    for (const repository of listRepositories(project)) {
      for (const stated of statedInRepository(repository.id, project)) {
        if (filesMatching(stated.pattern, [asked.path]).length === 0) continue
        const matched = matchedOf.get(stated.recordId) ?? []
        matched.push({ repository: { id: repository.id, title: repository.name }, pattern: stated.pattern, relation: stated.relation, authority: stated.authority })
        matchedOf.set(stated.recordId, matched)
      }
    }
    const records = getRecordsWithIds(matchedOf.keys())
    for (const [id, matched] of matchedOf) {
      const record = records.get(id)
      if (!liveHere(record, project)) continue
      if (record.kind === 'module') modules.push({ record, matched })
      else others.push({ id: record.id, title: record.title, kind: record.kind })
    }
  } else {
    const record = getRecordsWithIds([asked.module]).get(asked.module)
    if (!liveHere(record, project) || record.kind !== 'module') {
      throw new PanelError(
        `There is no live module "${asked.module}" in this project, so the dictionary has nothing to look up. Ask with ` +
          '?path=<a file path> to find the modules that state a file.',
        404,
        undefined,
        undefined,
        undefined,
        { code: 'mapDictionaryNoSuchModule', values: { module: asked.module } },
      )
    }
    modules.push({ record, matched: [] })
  }

  const map = master.state === 'marked' ? theBigMapOf(project, master.id) : null
  const implemented = new Map<string, Set<string>>()
  for (const link of map === null ? [] : linksFrom(modules.map((one) => one.record.id), ['implements'])) {
    implemented.set(link.fromId, (implemented.get(link.fromId) ?? new Set()).add(link.toId))
  }

  return {
    asked,
    master,
    modules: modules
      .map(({ record, matched }) => ({
        id: record.id,
        title: record.title,
        matched,
        owner: theOwnerOf(record),
        places: map === null ? null : thePlacesOf(map, implemented.get(record.id) ?? new Set()),
      }))
      .sort(byTitleThenId),
    others: others.sort(byTitleThenId),
  }
}
