// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { fileRegistryAliases } from './index.ts'
/** Only the synthetic restore corpus calls this writer. */
export async function fillRegistryAliasProof(): Promise<string> {
  const {sqlite}=await import('../client.ts')
  const target=sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as {id:string}|undefined
  if(target===undefined) throw new Error('The synthetic restore corpus has no registry target for its alias.')
  fileRegistryAliases(sqlite,[{namespace:'agent-registry',aliasId:'synthetic-historical-registry-id',canonicalId:target.id}])
  return 'registry_aliases: one permanent typed historical identity filed through its writer'
}
