// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { ActionData } from '../src/action-data.ts'
import type { NativePixels } from '../src/look-png.ts'
const require = createRequire(import.meta.url), { PNG } = require('playwright-core/lib/utilsBundle')
export const hash = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')
export const reference = JSON.parse(readFileSync(new URL('./fixtures/round12-tuft/reference.json',import.meta.url),'utf8'))
const text = readFileSync(new URL('../src/tuft-actions.ts',import.meta.url),'utf8'), start = text.indexOf('const data = ')+13
export const data: ActionData = JSON.parse(text.slice(start,text.indexOf('\nexport default',start)))
for (const [key,source] of Object.entries(data.sources)) source.url = key
export const png = (bytes: Uint8Array): NativePixels => { const result = PNG.sync.read(Buffer.from(bytes)); return { width:result.width,height:result.height,channels:4,data:new Uint8Array(result.data) } }
export const source = (name: string): NativePixels => png(readFileSync(new URL('../assets/tuft-action-'+name+'.png',import.meta.url)))
export const readPixels = async (url: string): Promise<NativePixels> => url.startsWith('data:') ? png(Buffer.from(url.split(',')[1]!,'base64')) : source(url)
export const flush = async (): Promise<void> => { for (let i=0;i<100;i++) await Promise.resolve() }
export const deferred = <T>() => { let resolve!: (value:T) => void, reject!: (error:unknown) => void; const promise = new Promise<T>((yes,no) => { resolve=yes; reject=no }); return { promise,resolve,reject } }
