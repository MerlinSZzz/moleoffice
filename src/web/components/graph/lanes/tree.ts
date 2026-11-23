// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PackageState } from '@shared/delegation.ts'

/** Stored lanes use row, stack or grid; the page works out tiers when needed. */
export type LaneArrange = 'row' | 'stack' | 'grid' | 'tiers'

export interface LaneArea {
  key: string // Stored lane name.
  heading: { text: string; record: string | null } | null // Page resolves the stored lane head to its record title and id.
  arrange: LaneArrange // Stored lane arrangement, or tiers worked out by the page.
  columns: number | null // Stored lane column count.
  beside: { side: 'left' | 'right'; of: string } | null // Stored lane beside and of fields.
  tint: string | null // Stored lane tint token, --area-1 through --area-6.
  frame?: 'solid' | 'dashed' // Explicit frame style, or absent for the usual frame rule.
  items: ({ record: string } | { area: LaneArea })[] // Page orders record ids and child lanes from stored lane and order fields.
}

export interface LanesTree {
  level: 'boxes' | 'steps' // Page chooses the level for the pipeline.
  direction: 'down' // Page chooses the drawing direction.
  areas: LaneArea[] // Page builds the ordered tree from stored lanes.
  notPlaced: string[] // Page identifies records whose stored lane is not listed.
}

export interface DrawnRecord {
  id: string // Record id.
  kind: string // Record kind.
  title: string // Record title.
  detail?: { summary: string | null; shortForms: unknown } // Words actually written on this record.
  role: 'box' | 'step' | 'module' // Page determines the role from the pipeline and records.
  state: string | null // Record state, or null when absent.
  packageState?: PackageState // Page reads it for a step from the one package that names the step, as the old graph's card did; absent when none or two do.
  number: string | null // Page works out the step number.
  badges: { text: string; tone: number }[] // Page works out badges from record fields.
  counts: { carries: { thisPipeline: number; otherPipelines: number } | null; carriedBy: number | null; holds: number | null } // Page counts stored links and the record's own pipeline; a module's carries counts the drawn pipeline's steps and the steps of other pipelines drawn here; null where a count does not apply.
  href: string | null // Page works out the title destination.
}

export interface DrawnLink {
  id: string // Link id.
  type: string // Link type.
  from: string // Link fromId.
  to: string // Link toId.
  carries: string | null // What the link carries, in words (carriedWords), or null when it names nothing.
  gate: 'hard' | 'partial' | null // Link gate field, or null when absent.
  upTo: string | null // Link upTo field, or null when absent.
  stage?: string // A partial gate's reach in words (stageInAPipeline), absent where the reach is said as stored.
  inferred: boolean // Page identifies inferred links.
}

export interface LanesInput {
  pipeline: { id: string; title: string } // Pipeline record id and title.
  records: DrawnRecord[] // Page gathers records for this drawing.
  links: DrawnLink[] // Page gathers links for this drawing.
  tree: LanesTree // Page builds the tree from stored lanes and records.
  blockLegend?: { id: string; title: string; place: number; pipelines: { title: string; href: string }[] }[] // Blocks and their pipeline links for the layered master.
  byStep?: boolean // The untiered master is drawn by step.
}
