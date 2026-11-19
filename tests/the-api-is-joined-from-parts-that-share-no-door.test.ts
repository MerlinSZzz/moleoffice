// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { joinApiParts } from '../src/web/api-parts/join.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Every folder under `folder`, itself included, as paths from the checkout. */
function foldersUnder(folder: string): string[] {
  const below = readdirSync(join(ROOT, folder), { withFileTypes: true }).filter((one) => one.isDirectory())
  return [folder, ...below.flatMap((one) => foldersUnder(`${folder}/${one.name}`))]
}

describe('the parts of `api` are joined, and share no door', () => {
  it('refuses a door that two parts both declare, naming the door and both parts', () => {
    const first = { readThis: () => 1 }
    const second = { readThat: () => 2, readThis: () => 3 }
    let said = ''
    expect(() => {
      try {
        joinApiParts({}, { firstDoors: first, secondDoors: second })
      } catch (error) {
        said = (error as Error).message
        throw error
      }
    }).toThrow()
    for (const word of ['readThis', 'firstDoors', 'secondDoors']) expect(said, 'the refusal names the door and both parts').toContain(word)
    // THE FILE'S OWN DOORS ARE A PART TOO: a part may not declare one of them either.
    expect(() => joinApiParts({ readThat: () => 0 }, { secondDoors: second })).toThrow(/readThat/)
  })

  it('hands back every door of every part, each the very function its part declared', () => {
    const own = { readOwn: () => 0 }
    const first = { readThis: () => 1 }
    const second = { readThat: () => 2 }
    const joined = joinApiParts(own, { secondDoors: second, firstDoors: first })
    expect(Object.keys(joined).sort()).toEqual(['readOwn', 'readThat', 'readThis'])
    expect(joined.readOwn).toBe(own.readOwn)
    expect(joined.readThis).toBe(first.readThis)
    expect(joined.readThat).toBe(second.readThat)
  })

  it('loads no module of the page from a folder named api, which is how a request to the API is told apart', () => {
    // The page's modules are served from src/web, from src/shared through the @shared alias, and from src/config.
    const named = ['src/web', 'src/shared', 'src/config'].flatMap(foldersUnder).filter((path) => path.endsWith('/api'))
    expect(named, 'folders the page loads modules from that are named api').toEqual([])
  })
})
