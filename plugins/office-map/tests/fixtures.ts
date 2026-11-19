// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { PLUGIN_READ_INTERFACE, type PluginPeopleView, type PluginProjectsView, type PluginTalkView } from '../../../src/shared/plugin-read.ts'
import type { ReadWork } from '../src/read.ts'

export const context = { interface: PLUGIN_READ_INTERFACE, kind: 'context', plugin: 'office-map', page: 'main', language: 'en', theme: 'light', reducedMotion: false, project: 'garden' } as const
export const projects: PluginProjectsView = {
  interface: PLUGIN_READ_INTERFACE, view: 'projects', narrowedByPermission: null,
  projects: [{ id: 'garden', name: 'Garden' }, { id: 'library', name: 'Library' }],
}
export const agent = (id: string, patch: Partial<PluginPeopleView['agents'][number]> = {}): PluginPeopleView['agents'][number] => ({
  kind: 'agent', id, handle: id, name: `Agent ${id}`, role: 'worker', retired: false, visitor: false,
  startedBy: null, createdAt: '2026-01-01 10:00:00', projects: ['garden'],
  appearance: { version: 2, style: 'c-forest', lookId: 'bare' }, appearanceChosen: false,
  scale: { version: 1, roleAtGeneration: 'worker', value: .4 }, presence: [{ project: 'garden', colour: 'green', word: 'Available' }],
  ...patch,
})
export const people: PluginPeopleView = {
  interface: PLUGIN_READ_INTERFACE, view: 'people', narrowedByPermission: null,
  people: [{ kind: 'person', id: 'same', handle: 'reader', name: 'Reader' }],
  agents: [agent('same'), agent('oak', { role: 'supervisor', scale: { version: 1, roleAtGeneration: 'supervisor', value: .85 } }),
    agent('reed', { startedBy: { kind: 'agent', id: 'oak' }, projects: ['library'], presence: [{ project: 'library', colour: 'grey', word: 'No recent signal' }] })],
}
export const workRow = (id: string, patch: Partial<ReadWork['work'][number]> = {}): ReadWork['work'][number] => ({
  id, project: 'garden', agent: 'same', title: `Work ${id}`, detail: 'work_open', recordedState: { state: 'custom' },
  doing: 'Checking a drawing', executing: false, association: 'started this run', updatedAt: '2026-01-01 10:01:00', runStanding: 'working', ...patch,
})
export const work: ReadWork = {
  interface: PLUGIN_READ_INTERFACE, view: 'work', narrowedByPermission: null,
  work: [workRow('run-a'), workRow('run-b', { detail: 'executing', executing: true }),
    workRow('task-c', { association: 'work claim', runStanding: null }), workRow('block-d', { association: 'work claim', runStanding: null })],
}
export const talk = (patch: Partial<PluginTalkView> = {}): PluginTalkView => ({
  interface: PLUGIN_READ_INTERFACE, view: 'talk', narrowedByPermission: null,
  messages: [], last: null, more: false,
  subtraction: { candidates: 0, carried: 0, leftOut: 0, shortened: 0 }, leftOutGroups: [], refusal: null,
  withdrawn: { ids: [], last: '0', more: false, subtraction: { candidates: 0, carried: 0, leftOut: 0, shortened: 0 }, leftOutGroups: [] },
  ...patch,
})
export const legacy = {
  version: 1, seed: 'fixture', age: 'adult', presentation: 'neutral', height: 'medium', build: 'round', fur: 'slate', expression: 'happy',
  top: { item: 'hoodie', colour: 'blue' }, trousers: null, shoes: null, head: null, face: null, badge: null, neck: null,
}
export const apron = { version: 3, style: 'c-forest', lookId: 'sand-apron', fur: 'original', cloth: 'original', body: { x: 1, y: 1 }, accessory: 'none' }
