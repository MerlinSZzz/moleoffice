// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CHANGES, PACK_FORMAT, WHOLE, fingerprintOf, foldManifests, type NamedManifest, type PackManifest } from './manifest.ts'
import { Zip64Reader } from './zip64.ts'

export const PACK_NAME = /^mole-office-pack-\d{8}-\d{6}-(whole|changes)\.zip$/

/** Read only the manifest and its exact stored bytes. */
export async function readManifest(folder: string, name: string): Promise<NamedManifest> {
  if (!PACK_NAME.test(name)) throw new Error(`${name}: the pack name is not recognised`)
  const reader = await Zip64Reader.open(join(folder, name))
  try {
    const names = reader.names()
    if (names.at(-1) !== 'manifest.json') throw new Error(`${name}: manifest.json is missing or is not the last entry`)
    const chunks: Buffer[] = []
    for await (const chunk of reader.read('manifest.json')) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    let manifest: PackManifest
    try { manifest = JSON.parse(bytes.toString('utf8')) as PackManifest }
    catch { throw new Error(`${name}: manifest.json is not valid JSON`) }
    if (manifest === null || typeof manifest !== 'object' || manifest.format !== PACK_FORMAT || (manifest.pack !== WHOLE && manifest.pack !== CHANGES) || !name.endsWith(`-${manifest.pack}.zip`)) throw new Error(`${name}: manifest.json has an invalid format or kind`)
    return { name, fingerprint: fingerprintOf(bytes), manifest }
  } finally { await reader.close() }
}

/** Read names and manifests, retaining an explanation for each file that cannot be read. */
export async function inspectPacks(folder: string): Promise<{ packs: NamedManifest[]; notes: string[]; names: string[] }> {
  const names = (await readdir(folder)).sort()
  const packs: NamedManifest[] = []
  const notes: string[] = []
  for (const name of names) {
    try { packs.push(await readManifest(folder, name)) }
    catch (error) { notes.push(`${name}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  return { packs, notes, names }
}

/** Follow the named links and check the fingerprint of each earlier manifest. */
export function followChain(newest: NamedManifest, packs: readonly NamedManifest[]): NamedManifest[] {
  const byName = new Map(packs.map((item) => [item.name, item]))
  const reversed: NamedManifest[] = []
  const seen = new Set<string>()
  let current = newest
  while (true) {
    if (seen.has(current.name)) throw new Error(`${current.name}: the pack chain has a cycle`)
    seen.add(current.name)
    reversed.push(current)
    if (current.manifest.pack === WHOLE) break
    const link = current.manifest.previous
    if (link === null || typeof link !== 'object' || typeof link.name !== 'string' || typeof link.manifestSha256 !== 'string') throw new Error(`${current.name}: the previous pack is missing from its manifest`)
    const previous = byName.get(link.name)
    if (previous === undefined) throw new Error(`${current.name}: the previous pack ${link.name} is missing or unreadable; expected ${link.manifestSha256}`)
    if (previous.fingerprint !== link.manifestSha256) throw new Error(`${link.name}: manifest fingerprint does not match ${link.manifestSha256} expected by ${current.name}`)
    current = previous
  }
  const chain = reversed.reverse()
  try { foldManifests(chain) }
  catch (error) { throw new Error(`${newest.name}: ${error instanceof Error ? error.message : String(error)}`) }
  return chain
}
