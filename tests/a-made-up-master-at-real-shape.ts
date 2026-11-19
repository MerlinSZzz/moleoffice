// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Stores the invented 34-box master in a test or throwaway office, without importing a test runner. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { TheDoors, FileLink } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'

type Step = { key: string; title: string; state: string | null; tier?: string | null }
type RecordInFile = Step & { kind: string; role: string }
interface File {
  pipeline: { key: string; title: string }
  steps: Step[]
  waitsOn: FileLink[]
  blockPipelines: { key: string; title: string; partOf: string; boxes: string[] }[]
  records: RecordInFile[]
  extras: { key: string; title: string }[]
  session: { key: string; title: string }
  links: FileLink[]
}
export const MASTER = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/a-made-up-master-at-real-shape.json', import.meta.url)), 'utf8')) as File

export function storeTheMadeUpMaster(doors: TheDoors, workspace: string) {
  const id: Record<string, string> = {}
  const linkNamed = new Map<string, string>()
  const containmentIds: string[] = []
  const person = doors.api.HUMAN
  const pipeline = (key: string, title: string) => {
    id[key] = doors.api.createRecord({ kind: 'pipeline', title, workspaceId: workspace, actor: person, data: { blockIds: [] } }).id
  }
  const step = (under: string, item: Step) => {
    id[item.key] = doors.blocks.addBlock(id[under]!, { name: item.title, state: (item.state ?? 'todo') as 'todo' }, person).block.id
    if (item.tier) doors.api.patchRecord(id[item.key]!, { dataPatch: { tier: item.tier } }, person)
  }
  const link = (item: FileLink) => {
    const type = item.type as Parameters<TheDoors['api']['createLink']>[0]['type']
    const made = doors.api.createLink({ fromId: id[item.from]!, toId: id[item.to]!, type, actor: person })
    linkNamed.set(made.id, `${item.from} ${item.type} ${item.to}`)
  }
  pipeline(MASTER.pipeline.key, MASTER.pipeline.title)
  for (const item of MASTER.steps) step(MASTER.pipeline.key, item)
  const records = new Map(MASTER.records.map((item) => [item.key, item]))
  for (const block of MASTER.blockPipelines) {
    pipeline(block.key, block.title)
    containmentIds.push(doors.api.createLink({ fromId: id[block.key]!, toId: id[block.partOf]!, type: 'part_of', actor: person }).id)
    for (const box of block.boxes) step(block.key, records.get(box)!)
  }
  for (const item of MASTER.records.filter((record) => record.kind === 'module')) {
    id[item.key] = doors.api.createRecord({ kind: 'module', title: item.title, workspaceId: workspace, actor: person, data: { context: 'Made up for a test of a drawing.' } }).id
  }
  for (const extra of MASTER.extras) pipeline(extra.key, extra.title)
  id[MASTER.session.key] = doors.api.createRecord({ kind: 'session', title: MASTER.session.title, workspaceId: workspace, actor: person, data: { state: 'running' } }).id
  for (const item of [...MASTER.waitsOn, ...MASTER.links]) link(item)
  return { id, linkNamed, containmentIds, pipeline: id[MASTER.pipeline.key]!, master: id[MASTER.pipeline.key]! }
}
