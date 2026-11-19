// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The Office publishes read shapes; the map owns its per-agent cache facts. */
import type { PluginAsksTheSlot as HostAsk, PluginPeopleView, PluginReadView as HostReadView, PluginRosterView } from '../../../src/shared/plugin-read.ts'
export type PluginReadView = keyof import('./read.ts').Views & HostReadView
export type RosterAgent = PluginRosterView['agents'][number]
export type RosterView = PluginRosterView
/** The map sends declared views; the host's broader ask type also describes requests it refuses. */
export type PluginAsksTheSlot = Exclude<HostAsk, { ask: 'read' }> | (Omit<Extract<HostAsk, { ask: 'read' }>, 'view'> & { view: PluginReadView })
export interface ReadFailure { why: 'too-long'; bytes: number; limit: number }
export type Fact<T> = ({ status: 'unloaded'; error: string | null } | { status: 'absent'; receivedAt: number; error: string | null } | { status: 'loaded'; value: T; receivedAt: number; error: string | null }) & { pending?: boolean; revision?: number; failure?: ReadFailure | null }
export interface AgentFacts { people: Fact<PluginPeopleView['agents'][number]>; work: Fact<import('./read.ts').ReadWork['work']> }
export type Facts = Readonly<Record<string, AgentFacts>>
export const unloaded = (): Fact<never> => ({ status: 'unloaded', error: null })
