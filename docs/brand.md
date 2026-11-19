# The images

`assets/` holds 23 image files, 20 of them in `assets/architecture/`. The mark and
illustration are used unchanged; the architecture diagrams have English and Chinese versions
in SVG and PNG. SVG dimensions below are the canvas size; PNG dimensions are pixels.

| File | Size | Pixels | Where it is used |
|---|---:|---|---|
| `mole-office.png` | 209 KB | 477 × 406 | the mark, inline in the README heading at 64px wide |
| `illustration.png` | 3.6 MB | 2048 × 682 | the README hero, full width |
| `architecture.png` | 3.1 MB | 2048 × 1286 | legacy asset, kept on purpose; no image links remain |
| `assets/architecture/general-en.svg` | 1,594,513 bytes | 1800 × 1050 | linked from `README.md` and `readme/README_zh.md` |
| `assets/architecture/general-en.png` | 708,053 bytes | 3600 × 2100 | shown in `README.md`; linked from `readme/README_zh.md` |
| `assets/architecture/general-zh.svg` | 1,595,046 bytes | 1800 × 1050 | linked from `README.md` and `readme/README_zh.md` |
| `assets/architecture/general-zh.png` | 681,651 bytes | 3600 × 2100 | shown in `readme/README_zh.md`; linked from `README.md` |
| `assets/architecture/technical-en.svg` | 3,790,382 bytes | 2400 × 1550 | linked from `README.md` and `readme/README_zh.md` and `docs/architecture.md` |
| `assets/architecture/technical-en.png` | 1,402,413 bytes | 4800 × 3100 | shown in `README.md` and `docs/architecture.md`; linked from `readme/README_zh.md` |
| `assets/architecture/technical-zh.svg` | 3,791,831 bytes | 2400 × 1550 | linked from `README.md` and `readme/README_zh.md` and `docs/architecture.md` |
| `assets/architecture/technical-zh.png` | 1,364,968 bytes | 4800 × 3100 | shown in `readme/README_zh.md`; linked from `README.md` and `docs/architecture.md` |
| `assets/architecture/flow-en.svg` | 2,251,197 bytes | 2400 × 1010 | linked from `README.md` and `readme/README_zh.md` |
| `assets/architecture/flow-en.png` | 551,044 bytes | 4800 × 2020 | shown in `README.md`; linked from `readme/README_zh.md` |
| `assets/architecture/flow-zh.svg` | 2,251,869 bytes | 2400 × 1010 | linked from `README.md` and `readme/README_zh.md` |
| `assets/architecture/flow-zh.png` | 557,999 bytes | 4800 × 2020 | shown in `readme/README_zh.md`; linked from `README.md` |
| `assets/architecture/roles-en.svg` | 2,884,975 bytes | 2400 × 740 | no page links it |
| `assets/architecture/roles-en.png` | 695,169 bytes | 4800 × 1480 | no page links it |
| `assets/architecture/roles-zh.svg` | 2,885,514 bytes | 2400 × 740 | no page links it |
| `assets/architecture/roles-zh.png` | 668,449 bytes | 4800 × 1480 | no page links it |
| `assets/architecture/path-en.svg` | 2,451,605 bytes | 2400 × 730 | no page links it |
| `assets/architecture/path-en.png` | 616,819 bytes | 4800 × 1460 | no page links it |
| `assets/architecture/path-zh.svg` | 2,451,914 bytes | 2400 × 730 | no page links it |
| `assets/architecture/path-zh.png` | 583,828 bytes | 4800 × 1460 | no page links it |

## The mark

A flat vector mole sitting in an arched doorway cut into the letter M, drawn as a building facade or
a tunnel mouth. Four colours, transparent background. The mole wears a collar and an olive tie.

**It is 477 × 406, which is not square.** Anything that needs a square icon needs padding or a crop
first. Cropping to the mole's head alone would lose the M, which is the letterform carrying the name.

**At 64 pixels wide — the size the README asks for — the tie and the whiskers are about one pixel.**
What survives is the M with a dark shape in the arch. That reads as a mark; the character does not.

## What a favicon still needs, and it is not here

- A **square** source. Pad the 477 × 406 to square, or crop deliberately.
- A **hand-simplified small version.** At 16 pixels only the silhouette survives, and a mechanical
  downscale of this file will be mud.
- The sizes a browser and a launcher ask for: 16, 32, 48, and 180 or larger for an app icon. At 180
  and above the full mark including the tie is legible, so a large icon works from this source
  directly; only the small sizes need redrawing.

**The browser app has no favicon at all today.** `src/web/index.html` carries no icon link, so a
browser draws its default. Wiring one is part of the rename step, not of this document.

Nothing here supplies an SVG, an `.ico`, a monochrome mark, a dark-mode variant, a wordmark without
the mole, or a social card.

## The illustration

A painterly cutaway of an underground office: a person on the hillside above explaining what they
want, a mole taking notes, and the office below — a correspondence room, a main chamber with maps
and a wall of pinned notes, a filing cabinet, shelves of labelled binders, a hand-cart moving
material through, and miners heading out of a tunnel mouth with lamps.

It is the argument for "a durable project office for people and agents", drawn as a scene.

**It is 3.6 MB.** A README serves all of it on every view. Resize it before putting it anywhere the
app loads.

## The architecture diagrams

There are five diagrams: the overview (`general`), the architecture (`technical`), the development
flow (`flow`), the roles (`roles`) and the person's path (`path`). The overview is for anyone. The
architecture is for technical readers of the repository. The overview and the architecture show only
what is built today and carry no "intended architecture" caveat. The development flow shows one
round, from the next item to the landing and the live office. The roles picture shows the person,
the agents and the office's programs, and who starts and reports to whom. The person's path shows
six steps, from asking to deciding.

The overview is 1800 units wide. The other four are landscape and 2400 units wide, and their
smallest text is 12 px when a picture is shown 1200 wide.

All five are generated by `tools/architecture/draw.mjs` from `tools/architecture/diagrams.json`.
The SVG is the source, and the PNG is rendered from it. The generator needs Lato and Noto Sans CJK SC
and stops if either is missing. Re-running it redraws byte-identical pictures. Its own checks cover
the fonts, text sizes, overlaps, contrast and word budgets.

The old picture stays as a legacy asset.

## How to use them

The mascot and the story are a brand and explanatory layer. They are not a replacement for product
meaning, and normal product screens should not be decorated with them.

There is no licence file for the mark or the illustration.

## Colours

The application's colour source is `src/web/tokens.css`. Its tokens name roles, such as background,
text and accent, rather than hues; use those roles when styling the application.

The website has classic and pixel looks, each with light and dark colours.

| Role | Classic, light | Classic, dark | Pixel, light | Pixel, dark |
|---|---|---|---|---|
| Background | #f4efe3 | #17251e | #fff5dd | #17271f |
| Panel | #fcf9f0 | #22352b | #fffaf0 | #20382b |
| Second panel | #e8ecd9 | #2c4234 | #e8edce | #29422d |
| Border | #d8d4bf | #3c5143 | #bec5a3 | #4d6448 |
| Strong border | #8a9275 | #829580 | #667653 | #9eaf86 |
| Text | #283d34 | #f3eedc | #203a2e | #fff5dd |
| Secondary text | #4f6254 | #c4cdbc | #425641 | #d4dcc0 |
| Tertiary text | #5e6b56 | #a5b69e | #506246 | #bccda2 |
| Accent | #38654c | #c2d7a2 | #315b3e | #d0e3a0 |
| Text on accent | #fffaf0 | #17251e | #fffaf0 | #17271f |
| Soft accent | #e1e8d7 | #354b39 | #dbe7bb | #3f5635 |
| Shadow | — | — | #203a2e | #0c1912 |
| Gold | — | — | #e9bb53 | #e9bb53 |

The application and website use separate palettes: the application has cream and purple in light
mode and near-black and blue in dark mode, while the website uses cream and woodland greens.

## Type

The application's font stacks live in `src/web/tokens.css`. The interface defaults to system
sans-serif, with Segoe UI, Roboto, Helvetica Neue, Arial and Noto Sans among its fallbacks; Chinese
fallbacks include Noto Sans CJK SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB and Microsoft
YaHei. The monospace stack starts with Noto Sans Mono and includes Noto Sans Mono CJK SC and Sarasa
Mono SC for Chinese. The reading stack uses system serif, Georgia, Cambria and Noto Serif, with Noto
Serif CJK SC, Source Han Serif SC, Songti SC and SimSun for Chinese. The interface font setting can
select the sans-serif, monospace or reading stack.

The website's classic look uses system sans-serif, with Noto Sans CJK SC, PingFang SC or Microsoft
YaHei for Chinese. Headings use Georgia, with Noto Serif CJK SC or Songti SC for Chinese.

The pixel look uses Pixelify Sans for Latin headings and labels, and Fusion Pixel for Chinese
headings and labels. Body text uses Source Sans 3 and Noto Sans SC. Use the SIL Open Font Licence
versions of all four fonts. Promo films use the same fonts as the website's pixel look.

Some pixel fonts join `fi` and `ffi` into ligatures. Turn ligatures off for English.

## Words

Use these terms in Chinese:

| Term | Chinese |
|---|---|
| Agent | 智能体 |
| Key | 密钥 |
| Regulations | 规定 |
| World | 世界 |

World is always 世界, never 环境: 环境 already means a computer's environment.
The application's interface addresses the reader as 你. Release and promotional material call the
reader 用户. Write Chinese as Chinese, rather than translating it from another language.

In Chinese voice-over, pronounce Mole as 谋 (móu). On screen, write Mole Office.

Public material never shows internal paths, script names, addresses, ports or people's names.
