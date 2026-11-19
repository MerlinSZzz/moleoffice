// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
// The most-linked records of every kind, so that the pages checked are the ones that draw one
// record several times. Prints the ids on one line, for region-dups.mjs to take.
//
// usage: MOLE_OFFICE_API=http://127.0.0.1:<api port> MOLE_OFFICE_WORKSPACE=<ws> node pick-pages.mjs [perKind]
const API = whereIsTheApi()
const WORKSPACE = whichWorkspace()
const PER_KIND = Number(process.argv[2] ?? '2')

const headers = {
  'x-mole-office-workspace': WORKSPACE,
  // The caller's own key and name when it holds a key; 'claude-code/builder-a-pointing-box' when it holds none.
  ...anAgentsToolHeaders({ withoutAKey: 'claude-code/builder-a-pointing-box' }),
  'x-mole-office-session': '8LYjNDW6IExe',
  'x-mole-office-trace': 'pointing-box-build',
  'x-mole-office-purpose': 'module-work',
  'content-type': 'application/json',
}

const listing = await (await fetch(`${API}/api/records`, { headers })).json()
const byKind = new Map()
for (const record of listing.records) {
  const seen = byKind.get(record.kind) ?? []
  seen.push(record)
  byKind.set(record.kind, seen)
}

const picked = []
for (const [kind, list] of byKind) {
  const scored = []
  for (const record of list.slice(0, 30)) {
    const one = await (await fetch(`${API}/api/records/${record.id}`, { headers })).json()
    scored.push({ id: record.id, kind, links: (one.links ?? []).length })
  }
  scored.sort((a, b) => b.links - a.links)
  for (const row of scored.slice(0, PER_KIND)) {
    if (row.links > 0) picked.push(row)
  }
}

for (const row of picked) process.stderr.write(`${row.id.padEnd(14)} ${row.kind.padEnd(18)} links=${String(row.links)}\n`)
console.log(picked.map((row) => row.id).join(' '))
