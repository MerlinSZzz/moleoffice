// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A person's own tag and the registered agents they have marked with it. */
export interface AgentTag {
  name: string
  colour: string
  agents: string[]
}
export type PersonalAgentMark = Pick<AgentTag, 'name' | 'colour'>

function luminance(hex: string): number {
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * parts[0]! + 0.7152 * parts[1]! + 0.0722 * parts[2]!
}

/** A mark must remain visible on the light and dark page and panel grounds. */
export function agentTagColourIsVisible(colour: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return false
  const value = luminance(colour)
  return ['#ffffff', '#f3efe4', '#09090b', '#131315'].every((ground) => {
    const background = luminance(ground)
    return (Math.max(value, background) + 0.05) / (Math.min(value, background) + 0.05) >= 3
  })
}
