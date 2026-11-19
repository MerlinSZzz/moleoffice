// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A BLOCK IS CALLED IN THE PICKER.
 * `aBlockName` and the `NamedBlock` shape it reads were moved byte for byte out of
 * src/server/lib/checklist-evidence.ts, with no change of behaviour. That file re-exports both.
 */

export interface NamedBlock {
  id?: unknown
  type?: unknown
  heading?: unknown
  caption?: unknown
  text?: unknown
}

/**
 * What a block is called in the picker: its heading, a heading block's words, an image's caption, or its first words. A
 * checklist's reading names a manual section's block with it too (lib/checklists.ts), so the two say one name.
 */
export function aBlockName(block: NamedBlock): string {
  const said = [block.heading, block.type === 'heading' ? block.text : undefined, block.caption, block.text].find(
    (one): one is string => typeof one === 'string' && one.trim() !== '',
  )
  return said === undefined ? `${String(block.type ?? 'block')} ${String(block.id)}` : said.trim()
}
