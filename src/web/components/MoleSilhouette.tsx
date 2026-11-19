// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MOLE, ALL IN BLACK, WITH A LARGE PLUS IN THE MIDDLE OF IT. Criterion P50.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SHOWS, AND WHY THE PICTURE IS DRAWN HERE RATHER THAN LOADED
 * ---------------------------------------------------------------------------------------
 *
 * The portrait shows a mole, all in black, with a large question mark or plus in the middle;
 * the other fields are empty and you fill them in after pressing into it.
 *
 * The six painted portraits are photographs of a character: 1024 by 1024 pixels, about a megabyte
 * each, in `design/portraits/`. This one is not a seventh of those. It is a shape standing where a
 * portrait will go, so it is drawn in the page — one path, no file to fetch, no request that can
 * fail, and it scales to whatever the block gives it.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SAME MOLE, AND IT IS THE SAME MOLE IN SILHOUETTE
 * ---------------------------------------------------------------------------------------
 *
 * The shape is the product's own mark, `src/web/mole-office-icon.svg`: the round head, the snout,
 * the two paws up at the sill. What is different is that every part of it is one ink. The mark uses
 * six colours to say which part is fur and which is muzzle; a silhouette says none of that on
 * purpose — it is a card nobody has filled in, and a face with eyes would be a character somebody
 * had chosen.
 *
 * `currentColor` FOR THE MOLE AND THE PANEL GROUND FOR THE PLUS. The house rule for a glyph drawn
 * in a page is that it takes the colour of the text around it, so this is black on a light theme
 * and white on a dark one without a second declaration. The plus is cut out of the body in the
 * ground colour, which is what keeps it readable at 64 pixels and at 240.
 *
 * IT IS NAMED, NOT HIDDEN. `role="img"` with a label, like the wordmark and unlike every decorative
 * glyph in ui.tsx: this picture IS the content of the block it stands in, and a reader who cannot
 * see it would otherwise meet a block with a title and nothing else.
 */

/**
 * WHAT A READER WHO CANNOT SEE THE PICTURE IS TOLD IT IS. The picture, and nothing else.
 *
 * It said what the picture STOOD FOR — a card nobody has written yet — and that is an absence, which
 * in this product goes through `Absence` in ui.tsx so its weight is chosen deliberately. What the
 * block stands for is already in the words beside it; a label describes the picture.
 */
export const A_MOLE_WITH_A_PLUS = 'A mole in black with a large plus in the middle'

export function MoleSilhouette({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={A_MOLE_WITH_A_PLUS}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* ONE INK FOR THE WHOLE ANIMAL. A silhouette is read from its OUTLINE, so what makes this a
          mole and not a dome is what breaks that outline: two round ears proud at the top, two paws
          hooked over the mound, and six whiskers leaving the body at snout height. Inside detail —
          eyes, a muzzle, fur — would be invisible in one ink, so none is drawn. */}
      <g fill="currentColor">
        {/* The mound it is coming out of. */}
        <path d="M0 60 C12 52 22 52 32 52 C42 52 52 52 64 60 L64 64 L0 64 Z" />
        {/* The body. */}
        <path d="M18 58 L18 32 A14 14 0 0 1 46 32 L46 58 Z" />
        {/* The two ears, proud of the head on both sides. */}
        <circle cx="20" cy="23" r="5.2" />
        <circle cx="44" cy="23" r="5.2" />
        {/* The two paws, hooked over the mound outside the body. */}
        <path d="M9.5 58 L9.5 52 A4.6 4.6 0 0 1 18.7 52 L18.7 58 Z" />
        <path d="M45.3 58 L45.3 52 A4.6 4.6 0 0 1 54.5 52 L54.5 58 Z" />
      </g>
      {/* THE WHISKERS, WHICH ARE WHAT MAKE IT AN ANIMAL. They leave the outline, so they are strokes
          rather than fill, and they take the same ink. */}
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M18 40 L5 36" />
        <path d="M18 43.5 L4 43.5" />
        <path d="M18 47 L5 50" />
        <path d="M46 40 L59 36" />
        <path d="M46 43.5 L60 43.5" />
        <path d="M46 47 L59 50" />
      </g>
      {/* THE PLUS, CUT OUT OF THE BODY. It is the panel's own ground rather than white, so it is a
          hole in the shape at every theme rather than a pale bar laid over a dark one. It is large
          on purpose: a LARGE question mark or plus. */}
      <g fill="var(--panel)">
        <rect x="28.4" y="26" width="7.2" height="22" rx="1.4" />
        <rect x="21" y="33.4" width="22" height="7.2" rx="1.4" />
      </g>
    </svg>
  )
}
