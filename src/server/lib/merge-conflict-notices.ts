// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Early notices carry git's observation. They never move the queued entry. */
import { getRecord } from './records.ts'
import { readMergeEntry, starterAgentOfARun } from './merge-queue.ts'
import { writeAMessage } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { stateWord } from '@shared/words.ts'

export function tellRenumberedMigrations(workspaceId: string, entry: {id: string; run: string}, mappings: readonly {from: string; to: string}[]): string {
  if (mappings.length === 0) return ''
  const run = getRecord(entry.run)
  const starter = run === null ? null : starterAgentOfARun(run)
  if (starter === null) return `Migration renumbering for ${entry.id} reached nobody: the run has no known starter.`
  const body = `Merge entry ${entry.id}: migrations renumbered at integration: ${mappings.map(({from, to}) => (from === to ? `${from} keeps its number and its when moves after main's newest` : `${from} -> ${to}`)).join(', ')}.`
  const message = writeAMessage({workspaceId, to: [{kind: 'agent', id: starter.id}], title: 'Migrations renumbered at integration', body, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'migrationsWereRenumbered'})
  return `Migration renumbering was told to the run's starter in message ${message}.`
}

export function tellEarlyConflicts(workspaceId: string, root: string, main: string, warnings: readonly {entry: string; tip: string; files: string[]; mayRenumber?: true}[]): string[] {
  const said: string[] = []
  const seen = new Set<string>()
  for (const warning of warnings) {
    if (seen.has(warning.entry)) continue
    seen.add(warning.entry)
    const record = getRecord(warning.entry)
    if (record === null || record.kind !== 'merge_entry' || record.workspaceId !== workspaceId) { said.push(`Early conflict notice for ${warning.entry} was not sent: the entry is not in this project.`); continue }
    const entry = readMergeEntry(record)
    if ((entry.state !== 'pinned' && entry.state !== 'judged') || entry.changeset.adapter !== 'git' || entry.changeset.root !== root || entry.changeset.commit !== warning.tip) { said.push(`Early conflict notice for ${warning.entry} was not sent: it no longer waits at the git tip that was replayed.`); continue }
    const run = getRecord(entry.run)
    const starter = run === null ? null : starterAgentOfARun(run)
    if (starter === null) { said.push(`Early conflict notice for ${entry.id} was not sent: its run has no known starter.`); continue }
    // AN ENTRY THAT CANNOT JOIN IS SENT BACK BY THE STATE MACHINE (bounceWhatCannotJoin); what reaches this notice is a
    // conflict only in migration files, which the rebase may renumber, or a report that named no lines.
    const body = `Merge entry ${entry.id} conflicts with main ${main} in: ${warning.files.join(', ')}. This is an early commit replay using git merge-tree. The entry remains ${stateWord(entry.state).text.toLowerCase()}; the queue's rebase still decides.${warning.mayRenumber === true ? ' Only migration files conflict, and the rebase may renumber them.' : ''}`
    const message = writeAMessage({
      workspaceId, to: [{ kind: 'agent', id: starter.id }], title: 'A queued entry conflicts with main',
      body, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'aQueuedEntryConflicts',
    })
    said.push(`Early conflict notice ${message} named ${warning.files.join(', ')} to the starter of run ${entry.run}.`)
  }
  return said
}
