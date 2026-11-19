// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PrivateLoginCapability, PrivateLoginState } from '../shared/private-sandbox-login.ts'
export interface PrivateLoginBinding { version: number; binding: string; generation: string; nonce?: string; attempt?: string; code?: string }
export interface RecordedPrivateProcess {
  /** The group and start identity are recorded by the trusted adapter at spawn, before any callback. */
  pgid: number
  identity: string
  matchesIdentity(pgid: number, identity: string): boolean
  signalGroup(pgid: number, signal: 'SIGTERM'): void
  /** These remove only this operation's owned scratch and private parser/input buffers. */
  disposeScratch(): void
  clear(): void
  writeCode(code: string): void | Promise<void>
}
export interface PrivateParser { feed(channel: string, bytes: Uint8Array): unknown[]; clear(): void }
export interface VerifiedNativeAdapter {
  version: number
  executable: string
  args: string[]
  allowedSignInOrigins: string[]
  /** Dump prevention covers the holder, native child and scratch; storage includes external native stores. */
  verified: { protocol: boolean; callback: boolean; code?: boolean; storageIsolation: boolean; dumpPrevention: boolean; ownerWatch: boolean }
  createParser(): PrivateParser
  /** The adapter owns an isolated callback listener outside the office HTTP stack and verifies native state. */
  start(input: { executable: string; args: string[]; deadline: number; signal: AbortSignal; environment: Readonly<Record<string, never>>; output(channel: string, bytes: Uint8Array): void; exit(code: number): void; error(error?: unknown): void; disconnected(): void }): Promise<RecordedPrivateProcess> | RecordedPrivateProcess
}
export interface PrivateLoginService {
  capability(): PrivateLoginCapability
  start(ref: PrivateLoginBinding): Promise<PrivateLoginState>
  status(ref: PrivateLoginBinding): PrivateLoginState
  signIn(ref: PrivateLoginBinding): { url: string }
  code(ref: PrivateLoginBinding): Promise<PrivateLoginState>
  cancel(ref: PrivateLoginBinding): PrivateLoginState
  disconnect(ref: PrivateLoginBinding): void
  expire(): void
  close(): void
  settled(): Promise<void>
  handle(request: Record<string, unknown>): Promise<Record<string, unknown>>
}
export function createPrivateLogin(options?: { adapter?: VerifiedNativeAdapter | null; pool?: {available(): boolean; add(value: Buffer, options?: {deadline: number; signal: AbortSignal}): Promise<{letter: string; sha12: string}>} | null; now?: () => number; schedule?: (fn: () => void, milliseconds: number) => () => void; [testTrap: string]: unknown }): PrivateLoginService
