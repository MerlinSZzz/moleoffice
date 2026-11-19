// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
export interface PoolResult { letter: string; sha12: string }
export interface PrivatePool { available(): boolean; add(value: Buffer, options?: { deadline?: number; signal?: AbortSignal }): Promise<PoolResult> }
export interface TrustedPoolTool {
  version: number
  executable: string
  prefixArgs: string[]
  by: string
  /** The adapter verifies the external helper and all shared writers, including recovery after a lost reply. */
  verified: { installed: boolean; privateStdin: boolean; noDiagnostics: boolean; isolation: boolean; flock: boolean; recovery: boolean; dumpPrevention: boolean; ownerWatch: boolean; processIdentity: boolean }
  /** Fixed invocation, no inherited secrets. The adapter records the process group/identity and owns its abort watcher. */
  execute(input: { executable: string; args: string[]; input: Buffer; operationId: string; deadline: number; signal: AbortSignal }): Promise<unknown>
  /** Metadata only. Never retry add-stdin or return a token during reconciliation. */
  reconcile(input: { operationId: string; sha12: string; deadline: number; signal: AbortSignal }): Promise<unknown>
}
/** Installed adapters are trusted host code, never a request or an environment switch. */
export function privatePool(options?: { tool?: TrustedPoolTool | null }): PrivatePool
