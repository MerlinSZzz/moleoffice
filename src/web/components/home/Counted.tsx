// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Keep counts easy to scan without splitting a translated sentence into English fragments. */
export function Counted({ text, as = 'b', firstStrong = false }: { text: string; as?: 'b' | 'span'; firstStrong?: boolean }) {
  return <>{text.split(/(\d+)/).map((part, index) => {
    if (!/^\d+$/.test(part)) return part
    const Number = firstStrong && index === 1 ? 'b' : as
    return <Number className="num" key={index}>{part}</Number>
  })}</>
}
