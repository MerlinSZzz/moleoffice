# The role card portraits

Eighteen pictures: three for each of the six role cards. They are what criterion **P47** asks
for (`design/permissions/ACCEPTANCE.md` section 8): three portraits for each role, all in one style,
the style of the three moles in `reference/moleagents.png`.

A card's page shows one of them, and a person or an agent picks which of their role's three it is.

## The six roles

Five are the agent cards of `design/permissions/roles.json`, and each one's props come from what its
card says it is for:

| Role | What its card says it is for | What its portraits show |
| --- | --- | --- |
| `worker` | It builds one part of one module and reports what it did. | A hard hat and a workbench: a spanner on a bolt, a socket wrench and spare parts, a finished part held up to the light. |
| `investigator` | It reads, measures and plans, and it builds nothing. | A magnifying glass, a paper map and a notebook: peering through the glass, crouched over the map on the floor, pointing at a map on a pinboard. |
| `supervisor` | It holds one piece of work, starts the agents that do it, and is answerable for them. | A clipboard over a small site: directing with a raised paw, watching from a low platform, reading a plan on a board. |
| `secretary` | It is the one agent whose job is the person. | A tidy desk, a headset or a telephone and an in-tray: the appointment book, the telephone handset, sorting letters. |
| `inspector` | It checks whether a started agent's work followed the rules. | A checklist, a stamp and a lamp: ticking the list, stamping a document under a desk lamp, a torch raised over a machine. |

One is a person's card, from **P45**:

| Role | Who it is | What its portraits show |
| --- | --- | --- |
| `administrator` | Any person with no other role: "*&lt;name&gt;*, administrator of the Office". | Keys, a big desk and the office building behind: holding up the key ring, seated over a ledger, unlocking the door. |

**Every portrait is a mole.** No portrait here is a likeness of a real face.

## The style, and where it comes from

The style comes from `reference/moleagents.png` — the three moles. Looking at that picture:

It is a flat cartoon vector drawing. Every shape is bounded by a **thick dark navy outline of even
weight**, and the colour inside is **cel shading**: two or three flat tones, a hard edge between
them, no gradient and no texture anywhere. Each mole has **dark slate blue-grey fur** with a cool
blue cast, a **soft tan-beige muzzle** ending in a rounded glossy black nose, **tan-beige paws**
with pale blunt claws, and a few fine whiskers. All three wear **small round wire-rimmed
spectacles** over large white eyes with round black pupils and a single white highlight. The
proportions are a **storybook mascot's**: a big head, short limbs, a slightly chubby body, rounded
everywhere, and an expression that is friendly and competent at once.

The clothes are ordinary modern work clothes in a **muted palette** — a mid-blue hoodie, an
olive-green hoodie with headphones, a warm yellow hard hat with a headlamp over a blue work shirt.
The props are drawn in the same flat greys and blues with the same heavy outline: a grey laptop, an
olive clipboard with a yellow pencil, a tablet. What is on the screens is **abstract**, bars and
squiggles, never readable words. The background is **plain white**, with nothing behind the
characters at all.

Each portrait here keeps that: **one mole**, square, 1024 by 1024, on white, three-quarter view or
full body, with no lettering anywhere in the picture. A card portrait is drawn larger than an
avatar, so unlike `design/avatars/generated/` nothing here is shrunk to 512.

## How they were made

`node tools/portraits-from-openrouter.mjs --all` — the tool beside
`tools/avatars-from-openrouter.mjs`, asking `openai/gpt-image-2` through OpenRouter's
`POST /api/v1/images`.

**The reference picture was sent with every prompt.**
[OpenRouter's image-generation documentation](https://openrouter.ai/docs/features/multimodal/image-generation),
read on 6 September 2026, says the endpoint takes `input_references`, an array of
`{ type: 'image_url', image_url: { url } }` where the url may be a base64 data url. So
`reference/moleagents.png` goes with each prompt as a data url. It was tried once before the run:
`openai/gpt-image-2` accepted it and drew a picture. **The style is carried in words as well** — the
same paragraph, describing the reference, opens every prompt — because a model that weighs
a reference lightly still reads the words. Both were sent on every call; neither was a fallback for
the other.

**Every picture was looked at.** One that broke the style — a realistic mole, a human being, a
different palette, any text in the picture — was drawn again once, and where the second was no
better the better of the two was kept and it is said so below.

### What was drawn twice, and why

**Nothing was.** Every picture here was looked at and every one was kept, so every row in the
table below is a first attempt and nothing in it is marked replaced.

**What every request cost is below**, one row per call, taken from `usage.cost` in the reply. The
pictures that were replaced are still in that table, because their money was still spent.

<!-- runs:start -->

*Everything from here to the end of this file is written by
`tools/portraits-from-openrouter.mjs` out of `public/portraits/runs.json`. Edit the tool or the
ledger, not this block.*

## Every request made

18 requests to the image model,
18 pictures kept, **$0.3245** spent in all.
A row marked replaced is a picture that was drawn again; its money was still spent.

| Picture | Run | Date | Model | Reference sent | `usage.cost` | Kept |
| --- | --- | --- | --- | --- | --- | --- |
| `worker/worker-1.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0157 | yes |
| `worker/worker-2.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0229 | yes |
| `worker/worker-3.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `investigator/investigator-1.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `investigator/investigator-2.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `investigator/investigator-3.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0229 | yes |
| `supervisor/supervisor-1.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `supervisor/supervisor-2.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `supervisor/supervisor-3.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `secretary/secretary-1.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `secretary/secretary-2.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `secretary/secretary-3.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `inspector/inspector-1.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0229 | yes |
| `inspector/inspector-2.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0228 | yes |
| `inspector/inspector-3.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0229 | yes |
| `administrator/administrator-1.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `administrator/administrator-2.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0156 | yes |
| `administrator/administrator-3.png` | 1 | 2026-09-06 | `openai/gpt-image-2` | yes | $0.0229 | yes |

## The prompt each picture was drawn from

Every prompt is the same style paragraph followed by that picture's own scene. Both halves are
printed here in full, exactly as they were sent.

### `worker/worker-1.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0157. 1123299 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is a workshop worker standing three-quarter view at a wooden workbench, wearing a warm yellow hard hat with a small round headlamp and a mid-blue work shirt with rolled sleeves. One paw holds a grey spanner and is tightening a bolt on a small grey machine part clamped on the bench; the other paw steadies the part. An open red-brown toolbox with a few screwdrivers sits on the bench beside it. Full body, cheerful and absorbed in the work.
```

### `worker/worker-2.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0229. 1083108 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is a workshop worker crouching down on one knee beside a small grey machine, seen from three-quarter view, wearing a yellow hard hat with a headlamp and a blue work shirt under a canvas tool belt full of screwdrivers. One paw turns a socket wrench on the machine, the other holds a small replacement part up to look at it. Two or three spare bolts and a wrench lie neatly on the floor. Full body, concentrating.
```

### `worker/worker-3.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1036138 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is a workshop worker sitting on a low wooden stool at a bench, three-quarter view, wearing a blue work shirt and a yellow hard hat pushed back with clear safety goggles resting on its brim. It holds a finished small metal part up in one paw and inspects it with a satisfied smile; a soldering iron in a stand and a coil of wire are on the bench. Full body, relaxed and pleased with the work.
```

### `investigator/investigator-1.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 995673 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an investigator standing in three-quarter view, holding a large round magnifying glass with a brown handle up beside its face and peering through it. It wears an olive-green field jacket with big pockets over a blue shirt, a rolled paper map tucked under the other arm and a small notebook poking out of a pocket. Full body, curious and alert.
```

### `investigator/investigator-2.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1095549 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an investigator crouched over a large unrolled paper map spread on the floor, seen from three-quarter view above, wearing an olive-green field jacket. One paw holds a round magnifying glass over the map, the other holds a yellow pencil about to mark a spot; an open notebook lies beside the map with abstract squiggly lines for notes. Full body, intent.
```

### `investigator/investigator-3.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0229. 1252500 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an investigator standing three-quarter view at a cork pinboard, pointing at a pinned paper map with a yellow pencil while several small pinned notes with abstract squiggly lines surround it. It wears an olive-green field jacket over a blue shirt, with a round magnifying glass hanging on a cord around its neck and a small notebook in one paw. Full body, explaining what it found.
```

### `supervisor/supervisor-1.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1060309 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is a site supervisor standing three-quarter view holding an olive-green clipboard with a pencil clipped to it in one paw, the other paw raised and pointing to direct the work. It wears a yellow hard hat and a mid-blue work shirt. Behind and smaller: two stacked wooden crates and a short section of grey scaffold. Full body, calm and in charge.
```

### `supervisor/supervisor-2.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1048497 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is a site supervisor standing on a low wooden platform in three-quarter view, looking out over a very small building site, an olive-green clipboard held against its chest in both paws. It wears a yellow hard hat and a warm yellow high-visibility vest over a blue shirt. Behind and much smaller: a tiny yellow crane and two crates. Full body, watchful and steady.
```

### `supervisor/supervisor-3.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1116994 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is a site supervisor standing three-quarter view with one paw on its hip and an olive-green clipboard tucked under the other arm, studying a large paper plan pinned to a board, the plan showing only abstract lines and rectangles. It wears a yellow hard hat, a blue work shirt, and a small silver whistle on a cord round its neck. Two orange traffic cones stand beside it. Full body, considering.
```

### `secretary/secretary-1.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1005800 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an office secretary seated three-quarter view at a very tidy wooden desk, wearing a slim black headset with a microphone, a neat mid-blue shirt and a grey waistcoat. One paw rests on an open appointment book of blank ruled pages, the other holds a pen. On the desk: a wire in-tray with a neat stack of papers and a cup of pens, all squared up. Upper body and desk, attentive and welcoming.
```

### `secretary/secretary-2.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1137091 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an office secretary standing three-quarter view beside a tidy wooden desk, holding the handset of an old grey corded telephone to its ear with one paw and a small slip of paper with abstract squiggly writing in the other. It wears a neat mid-blue shirt and a grey waistcoat. On the desk: the telephone base, a wire in-tray and a wire out-tray, both tidy. Full body, listening carefully.
```

### `secretary/secretary-3.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1352170 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an office secretary seated three-quarter view at a tidy wooden desk, sorting letters into a two-level wire in-tray with both paws, wearing a slim black headset and a soft olive-green cardigan over a blue shirt. On the desk: a small grey desk lamp switched on with a warm glow, and a neat stack of grey folders. Upper body and desk, quick and unhurried at once.
```

### `inspector/inspector-1.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0229. 954449 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an inspector standing three-quarter view, holding a long paper checklist of abstract ruled lines and small tick boxes in one paw and marking a tick with a yellow pencil in the other. It wears a grey-blue jacket over a blue shirt and its small round spectacles are pushed down its snout so it can look over them. A small silver handheld torch is clipped to its breast pocket. Full body, exacting but kindly.
```

### `inspector/inspector-2.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0228. 1194812 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an inspector leaning over a plain wooden desk in three-quarter view, pressing a round wooden rubber stamp down onto a sheet of paper with one paw, a checklist of abstract ruled lines lying beside it. A grey desk lamp is switched on above with a warm pool of light. It wears a grey-blue jacket and round spectacles. Upper body and desk, decisive.
```

### `inspector/inspector-3.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0229. 1028158 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is an inspector standing three-quarter view with a small silver torch raised in one paw, its beam a pale flat cone shining onto a grey machine housing it is examining. An olive-green clipboard with a checklist of abstract ruled lines is tucked under the other arm and a round wooden stamp sits in its breast pocket. It wears a grey-blue jacket and round spectacles. Full body, searching.
```

### `administrator/administrator-1.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1092406 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is the administrator of an office, standing three-quarter view in front of a big wooden desk, holding up a large iron ring of three brass keys in one paw. It wears a smart grey waistcoat over a mid-blue shirt with the sleeves rolled. Behind, smaller and simply drawn, is a small square office building with plain windows. Full body, welcoming and responsible.
```

### `administrator/administrator-2.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0156. 1376279 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is the administrator of an office, seated three-quarter view behind a big wooden desk with both paws resting on an open ledger of blank ruled pages. A large iron ring of brass keys lies on the desk beside a cup of pens. Through a plain window behind it, drawn small and simply, is a small square office building. It wears a grey waistcoat over a blue shirt. Upper body and desk, settled and in charge.
```

### `administrator/administrator-3.png`, run 1

Asked of `openai/gpt-image-2` on 2026-09-06 at 1024 by 1024, with the reference picture sent as `input_references`, and it cost $0.0229. 1148189 bytes came back.

```text
Flat cartoon vector illustration in the exact style of the reference picture: one friendly, slightly chubby anthropomorphic mole, drawn with thick dark navy outlines of even weight and cel shading in two or three flat tones with no gradients, no airbrushing and no texture. The mole has dark slate blue-grey fur with a cool blue tint, a soft tan-beige muzzle and a shiny black rounded nose, tan-beige paws with pale blunt claws, a few fine whiskers, small round wire-rimmed spectacles, and large white eyes with round black pupils and one white highlight. Clothes are simple modern work clothes in a muted palette of mid-blue, olive green, grey and warm yellow. Props are drawn in flat greys, blues and warm browns with the same heavy outline. Storybook mascot proportions: a large head, short limbs, rounded shapes, a warm and competent expression. Plain pure white background, no scenery beyond the props named, no border, no frame, no shadow on the ground beyond a simple flat one. ABSOLUTELY NO TEXT: no letters, words, numbers, labels, signage, logos, watermark or signature anywhere in the picture; writing on paper or a screen is only abstract squiggly lines and bars. Exactly one mole, no second character, no human being, centred in the square. The mole is the administrator of an office, standing three-quarter view turning a large brass key in the lock of a plain wooden door, a canvas satchel over one shoulder and the rest of the key ring hanging from its paw. It wears a grey waistcoat over a mid-blue shirt. Behind, smaller and simply drawn, is a small square office building. Full body, arriving to open up for the day.
```

<!-- runs:end -->
