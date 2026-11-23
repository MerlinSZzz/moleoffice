// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { CARD_RUNG_ATTRIBUTE } from '../../../lib/drawnat.ts'

export const LANES_CSS = `
.lanes-drawing .e-frame {
  position: relative;
  overflow: hidden;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}
.lanes-drawing .e-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.lanes-drawing .e-world > * { position: absolute; }
.lanes-drawing .e-card {
  box-sizing: border-box;
  padding: var(--pad);
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: none;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.lanes-drawing .e-card[data-role='module'] { border-radius: var(--radius-lg); }
.lanes-drawing .e-card[data-state='blocked'] { border: 2px solid var(--st-blocked-line); }
.lanes-drawing .e-card[data-state='failed'] { border: 2px solid var(--st-failed-line); }
.lanes-drawing .e-head { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.lanes-drawing .e-no { flex: none; font-size: var(--fs-1); font-weight: 700; color: var(--text-3); line-height: calc(var(--fs-2) * var(--lh-tight)); font-variant-numeric: tabular-nums; }
.lanes-drawing .e-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-2);
  font-weight: 700;
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: normal;
}
.lanes-drawing .e-parts { margin-top: 5px; overflow-wrap: anywhere; }
.lanes-drawing .e-part-heading { font-weight: 700; }
.lanes-drawing .e-detail { display: none; position: absolute; right: 0; bottom: 0; transform: translateY(100%); z-index: 3; background: var(--panel); color: var(--text); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); cursor: pointer; }
.lanes-drawing .e-card[data-selected='1'] .e-detail { display: block; }
.lanes-drawing .e-detail-reason { position: absolute; right: 0; bottom: 0; transform: translateY(200%); z-index: 4; padding: 4px; background: var(--panel); color: var(--text); border: 1px solid var(--border-strong); }
.lanes-drawing .e-detail-reason[hidden], .lanes-drawing .e-card:not([data-selected='1']) .e-detail-reason { display: none; }
.lanes-drawing .e-summary { margin-top: 5px; color: var(--text-2); overflow-wrap: anywhere; }
.lanes-drawing .e-chip-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 5px; }
.lanes-drawing .e-marks { display: flex; flex: none; align-items: center; gap: 5px; min-height: calc(var(--fs-2) * 1.35); }
.lanes-drawing .e-badge {
  padding: 0 6px;
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  font-weight: 700;
  color: var(--panel);
  background: var(--text-2);
  border: 1px solid var(--text-2);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.lanes-drawing .e-count { display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-1); line-height: 1.4; color: var(--text-2); min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.lanes-drawing .e-count::before { content: ''; box-sizing: border-box; width: 8px; height: 8px; border: 1.5px solid var(--text-3); border-radius: 1px; background: var(--panel-2); flex: none; }
.lanes-drawing .e-card[role='button'] { cursor: pointer; }
.lanes-drawing .e-card[role='button']:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.lanes-drawing .e-card[data-selected='1'] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.lanes-drawing .e-card[data-lit='1'] { border-color: var(--accent); }
.lanes-drawing .e-world > .e-selected-words { display: contents; }
.lanes-drawing .e-card[${CARD_RUNG_ATTRIBUTE}='1.5'] { padding: 4px var(--pad); }
.lanes-drawing .e-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--fs-2);
  height: calc(var(--fs-1) * var(--lh-tight));
  font-size: var(--fs-2);
  line-height: 1;
  color: var(--mk-tone);
  font-weight: 700;
}
.lanes-drawing .e-mark::before { content: var(--mk-glyph); }
.lanes-drawing .e-mark[data-state='todo']::before,
.lanes-drawing .e-mark[data-state='doing']::before { content: ''; box-sizing: border-box; width: 10px; height: 10px; border: 2px solid var(--mk-tone); border-radius: 50%; }
.lanes-drawing .e-mark[data-state='doing']::before { background: linear-gradient(90deg, var(--mk-tone) 50%, transparent 50%); }
.lanes-drawing .e-mark[data-state='todo'] { --mk-tone: var(--st-todo); }
.lanes-drawing .e-mark[data-state='doing'] { --mk-tone: var(--st-doing); }
.lanes-drawing .e-mark[data-state='done'] { --mk-tone: var(--st-done); --mk-glyph: var(--st-done-glyph); }
.lanes-drawing .e-mark[data-state='blocked'] { --mk-tone: var(--st-blocked); --mk-glyph: var(--st-blocked-glyph); }
.lanes-drawing .e-mark[data-state='failed'] { --mk-tone: var(--st-failed); --mk-glyph: var(--st-failed-glyph); }
.lanes-drawing .e-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--px-tone-line) 55%, var(--border-strong));
  border-style: var(--px-tone-border-style);
  border-radius: var(--radius-sm);
  background: var(--px-tone-bg);
  color: var(--px-tone);
  font-size: var(--fs-1);
  font-weight: var(--px-tone-weight);
  letter-spacing: .05em;
  line-height: var(--lh-tight);
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.lanes-drawing .e-chip::before { content: var(--px-glyph); }
.lanes-drawing .e-chip[data-package-state] { white-space: normal; overflow-wrap: anywhere; max-width: 100%; }
.lanes-drawing .e-chip[data-state='todo'] { --px-tone: var(--st-todo); --px-tone-bg: var(--st-todo-bg); --px-tone-line: var(--st-todo-line); --px-tone-weight: var(--st-todo-weight); --px-tone-border-style: var(--st-todo-border-style); --px-glyph: var(--st-todo-glyph); }
.lanes-drawing .e-chip[data-state='doing'] { --px-tone: var(--st-doing); --px-tone-bg: var(--st-doing-bg); --px-tone-line: var(--st-doing-line); --px-tone-weight: var(--st-doing-weight); --px-tone-border-style: var(--st-doing-border-style); --px-glyph: var(--st-doing-glyph); }
.lanes-drawing .e-chip[data-state='done'] { --px-tone: var(--st-done); --px-tone-bg: var(--st-done-bg); --px-tone-line: var(--st-done-line); --px-tone-weight: var(--st-done-weight); --px-tone-border-style: var(--st-done-border-style); --px-glyph: var(--st-done-glyph); }
.lanes-drawing .e-chip[data-state='blocked'] { --px-tone: var(--st-blocked); --px-tone-bg: var(--st-blocked-bg); --px-tone-line: var(--st-blocked-line); --px-tone-weight: var(--st-blocked-weight); --px-tone-border-style: var(--st-blocked-border-style); --px-glyph: var(--st-blocked-glyph); }
.lanes-drawing .e-chip[data-state='failed'] { --px-tone: var(--st-failed); --px-tone-bg: var(--st-failed-bg); --px-tone-line: var(--st-failed-line); --px-tone-weight: var(--st-failed-weight); --px-tone-border-style: var(--st-failed-border-style); --px-glyph: var(--st-failed-glyph); }
.lanes-drawing .e-area { box-sizing: border-box; }
.lanes-drawing .e-area[data-framed='1'] {
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-lg);
}
.lanes-drawing .e-area[data-frame='dashed'] { border-style: dashed; }
.lanes-drawing .e-area[data-framed='1'][data-nested='1'] { background: var(--panel-2); border-color: var(--border); }
.lanes-drawing .e-area[data-framed='1'][data-tint] { background: var(--e-tint); border-color: color-mix(in srgb, var(--e-tint) 70%, var(--text)); }
.lanes-drawing .e-band {
  position: absolute;
  box-sizing: border-box;
  background: var(--e-tint);
  border: 1px solid color-mix(in srgb, var(--e-tint) 82%, var(--text));
  border-radius: var(--radius-lg);
}
.lanes-drawing .e-heading { font-size: var(--fs-2); font-weight: 700; line-height: var(--lh-tight); color: var(--text); white-space: nowrap; }
.lanes-drawing .e-area-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-width: 0; }
.lanes-drawing .e-area-head > * { flex: none; white-space: nowrap; }
.lanes-drawing .e-lines { overflow: visible; pointer-events: none; }
.lanes-drawing .e-path { fill: none; stroke: var(--border-strong); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.lanes-drawing .e-path[data-tone='hard'] { stroke: var(--e-line); stroke-width: 2; }
.lanes-drawing .e-path[data-tone='partial'] { stroke: var(--st-todo); stroke-width: 2.25; }
.lanes-drawing .e-path[data-type='implements'] { stroke-width: 1.5; opacity: .85; }
.lanes-drawing .e-path[data-inferred='1'] { stroke-dasharray: 6 5; }
.lanes-drawing .e-arrow[data-tone='plain'] { fill: none; stroke: var(--border-strong); stroke-width: 1.5; }
.lanes-drawing .e-arrow[data-tone='hard'] { fill: var(--st-blocked); }
.lanes-drawing .e-arrow[data-tone='partial'] { fill: var(--st-todo); }
.lanes-drawing .e-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  font-size: var(--fs-1);
  line-height: 1.3;
  color: var(--text-2);
  white-space: nowrap;
}
.lanes-drawing .e-pill[data-tone='hard'] { color: var(--st-blocked); }
.lanes-drawing .e-pill[data-tone='partial'] { color: var(--text-2); }
.lanes-drawing .e-pill-word { font-weight: 600; }
.lanes-drawing .e-gate { display: inline-block; width: 9px; height: 9px; flex: none; }
.lanes-drawing .e-gate[data-gate='hard'] { background: var(--st-blocked); }
.lanes-drawing .e-gate[data-gate='partial'] { background: repeating-linear-gradient(90deg, var(--st-blocked) 0 2px, transparent 2px 4px); }
.lanes-drawing .e-gate-mark {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--panel);
  color: var(--st-blocked);
  border: 1px solid var(--st-blocked);
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.lanes-drawing .e-gate-mark[data-open='1'] { z-index: 5; }
.lanes-drawing .e-gate-mark[data-gate='partial'] { color: var(--st-todo); border-color: var(--st-todo); }
.lanes-drawing .e-gate-mark[data-gate='partial'][data-open='1'] { background: var(--st-todo); }
.lanes-drawing .e-gate-mark[data-open='1'] { background: var(--st-blocked); color: var(--panel); }
.lanes-drawing .e-gate-mark:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.lanes-drawing .e-gate-glyph { width: 16px; height: 16px; flex: none; }
.lanes-drawing .e-gate-words {
  position: absolute;
  padding: 3px 5px;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  text-align: left;
  white-space: nowrap;
}
.lanes-drawing .e-measure { position: absolute; left: -100000px; top: 0; visibility: hidden; }
.lanes-drawing .e-measure > * { position: absolute; }
.lanes-drawing .e-outline { display: flex; flex-direction: column; gap: var(--pad-lg); min-width: 0; }
.lanes-drawing .e-outline-area { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.lanes-drawing .e-outline-area[data-nested='1'] { padding-left: var(--pad-lg); border-left: var(--rail) solid var(--border); }
.lanes-drawing .e-outline-area[data-tint] { padding: var(--pad); background: var(--e-tint); border: 1px solid color-mix(in srgb, var(--e-tint) 82%, var(--text)); border-radius: var(--radius-lg); }
.lanes-drawing .e-outline h3 { font-size: var(--fs-2); font-weight: 700; color: var(--text); margin: 0; }
.lanes-drawing .e-outline h4 { font-size: var(--fs-1); font-weight: 700; color: var(--text-2); margin: 0; }
.lanes-drawing .e-outline ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
.lanes-drawing .e-outline li { min-width: 0; }
.lanes-drawing .e-outline .e-card { width: 100%; box-shadow: none; }
.lanes-drawing .e-outline .e-said { margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.lanes-drawing .e-said li { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); overflow-wrap: normal; }
.lanes-drawing .e-said .e-pill-word { color: var(--text-3); }
.lanes-drawing .e-badge { color:var(--badge-text, var(--lanes-badge-text-0)); background:var(--badge-fill, var(--lanes-badge-0)); border-color:var(--badge-fill, var(--lanes-badge-0)); }
.lanes-drawing .e-badge[data-module='0'] { --badge-fill:var(--lanes-badge-0); --badge-text:var(--lanes-badge-text-0); }
.lanes-drawing .e-badge[data-module='1'] { --badge-fill:var(--lanes-badge-1); --badge-text:var(--lanes-badge-text-1); }
.lanes-drawing .e-badge[data-module='2'] { --badge-fill:var(--lanes-badge-2); --badge-text:var(--lanes-badge-text-2); }
.lanes-drawing .e-badge[data-module='3'] { --badge-fill:var(--lanes-badge-3); --badge-text:var(--lanes-badge-text-3); }
.lanes-drawing .e-badge[data-module='4'] { --badge-fill:var(--lanes-badge-4); --badge-text:var(--lanes-badge-text-4); }
.lanes-drawing .e-badge[data-module='5'] { --badge-fill:var(--lanes-badge-5); --badge-text:var(--lanes-badge-text-5); }
.lanes-drawing .e-badge[data-module='6'] { --badge-fill:var(--lanes-badge-6); --badge-text:var(--lanes-badge-text-6); }
.lanes-drawing .e-badge[data-module='7'] { --badge-fill:var(--lanes-badge-7); --badge-text:var(--lanes-badge-text-7); }
.lanes-drawing .e-badge[data-module='8'] { --badge-fill:var(--lanes-badge-8); --badge-text:var(--lanes-badge-text-8); }
.lanes-drawing .e-badge[data-module='9'] { --badge-fill:var(--lanes-badge-9); --badge-text:var(--lanes-badge-text-9); }
.lanes-drawing .e-badge[data-module='10'] { --badge-fill:var(--lanes-badge-10); --badge-text:var(--lanes-badge-text-10); }
.lanes-drawing .e-badge[data-module='11'] { --badge-fill:var(--lanes-badge-11); --badge-text:var(--lanes-badge-text-11); }
.lanes-drawing .e-badge[data-module='12'] { --badge-fill:var(--lanes-badge-12); --badge-text:var(--lanes-badge-text-12); }
.lanes-drawing .e-path[data-tone='plain'] { stroke:var(--e-line); stroke-width:2; }
.lanes-drawing .e-path[data-tone='red'] { stroke:var(--st-blocked); stroke-width:2; }
.lanes-drawing .e-path[data-active='1'], .lanes-drawing .e-selected-lines .e-path { stroke:var(--accent); stroke-width:3; opacity:1; }
.lanes-drawing .e-path[data-dim='1'] { opacity:.4; }
.lanes-drawing .e-card[data-dim='1'] { background:color-mix(in srgb, var(--panel) 65%, transparent); border-color:color-mix(in srgb, var(--border-strong) 65%, transparent); }
.lanes-drawing .e-card[data-dim='1'][data-state='blocked'] { border-color:color-mix(in srgb, var(--st-blocked-line) 65%, transparent); }
.lanes-drawing .e-card[data-dim='1'][data-state='failed'] { border-color:color-mix(in srgb, var(--st-failed-line) 65%, transparent); }
.lanes-drawing .e-card[data-dim='1'] .e-title { color:color-mix(in srgb, var(--text) 75%, transparent); }
.lanes-drawing .e-card[data-dim='1'] .e-no { color:color-mix(in srgb, var(--text-3) 85%, transparent); }
.lanes-drawing .e-card[data-dim='1'] .e-count { color:color-mix(in srgb, var(--text-2) 85%, transparent); }
.lanes-drawing .e-card[data-dim='1'] .e-chip { color:color-mix(in srgb, var(--px-tone) 95%, transparent); background:color-mix(in srgb, var(--px-tone-bg) 95%, transparent); }
.lanes-drawing .e-card[data-dim='1'] .e-badge { color:color-mix(in srgb, var(--badge-text, var(--lanes-badge-text-0)) 99.5%, transparent); background:color-mix(in srgb, var(--badge-fill, var(--lanes-badge-0)) 99.5%, transparent); border-color:color-mix(in srgb, var(--badge-fill, var(--lanes-badge-0)) 99.5%, transparent); }
.lanes-drawing .e-arrow[data-tone='plain'] { stroke:var(--e-line); }
.lanes-drawing .e-frame { --e-line:var(--lanes-line); }
.lanes-drawing .e-key { text-align:right; font-size:12px; line-height:1.4; color:var(--text); padding:4px 3px; }
.lanes-drawing .e-key-line, .lanes-drawing .e-key-dash { color:var(--border-strong); font-weight:700; }
.lanes-drawing .e-key-hard { color:var(--st-blocked); }
.lanes-drawing .e-key-partial { color:var(--text-2); }
.lanes-drawing .e-key-detail { text-align:left; font-size:12px; }

.lanes-drawing .e-selected-words > .e-pill { position:absolute; }
.lanes-drawing .e-pill[data-tone="hard"] { color:var(--text-2); }

.lanes-drawing .e-key { position:absolute; right:5px; bottom:3px; z-index:3; display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:3px; box-sizing:border-box; max-width:calc(100% - 10px); padding:2px 3px; background:var(--panel-2); }
.lanes-drawing .e-key > .e-block-legend-entry { max-width:100%; white-space:normal; overflow-wrap:anywhere; }
.lanes-drawing .e-block-legend-entry a { overflow-wrap:anywhere; }
.lanes-drawing .e-key-sample { width:40px; height:14px; flex:none; overflow:visible; }
.lanes-drawing .e-key-compact .e-key-sample { width:28px; }
.lanes-drawing .e-key-compact > span:has(.e-key-sample) { margin-left:8px; gap:4px; }
.lanes-drawing .e-key-stroke { fill:none; stroke:var(--e-line); stroke-width:2; vector-effect:non-scaling-stroke; }
.lanes-drawing .e-key-detail { margin-top:4px; }

.lanes-drawing .e-key > span { display:inline-flex; align-items:center; gap:3px; white-space:nowrap; }


.lanes-drawing .e-count::before { content:none; }
.lanes-drawing .e-arrow[data-tone="partial"] { fill:var(--e-line); stroke:var(--e-line); stroke-width:1; }

.lanes-drawing .e-mark[data-state='unrecorded'] { --mk-tone:var(--text-2); --mk-glyph:'?'; }
.lanes-drawing .e-mark[data-state='done']::before { content:''; width:8px; height:5px; border-left:2px solid var(--mk-tone); border-bottom:2px solid var(--mk-tone); transform:rotate(-45deg) translateY(-1px); }
.lanes-drawing .e-key-mark { width:12px; height:12px; font-size:12px; font-style:normal; }
.lanes-drawing .e-key-mark[data-state='todo']::before, .lanes-drawing .e-key-mark[data-state='doing']::before { width:9px; height:9px; }

.lanes-drawing .e-card .e-marks { gap:2px; }
.lanes-drawing .e-card .e-mark { width:10px; }
.lanes-drawing .e-path[data-tone='partial'], .lanes-drawing .e-partial-companion { fill:none; stroke:var(--e-line); stroke-width:2; vector-effect:non-scaling-stroke; }
.lanes-drawing .e-partial-companion { pointer-events:none; }
.lanes-drawing .e-card .e-badge { padding-left:3px; padding-right:3px; }
.lanes-drawing .e-card .e-head { gap:3px; }

.lanes-drawing .e-partial-companion[data-dim='1'] { opacity:.4; }
.lanes-drawing .e-partial-companion[data-active='1'], .lanes-drawing .e-path[data-tone='partial'][data-active='1'] { stroke:var(--accent); }

.lanes-drawing .e-chip[data-state='unrecorded'] { --px-tone:var(--text-2); --px-tone-bg:transparent; --px-tone-line:var(--border); --px-tone-weight:600; --px-tone-border-style:dashed; --px-glyph:''; }

.lanes-drawing .e-title:is(a):hover, .lanes-drawing .e-title:is(a):focus-visible { text-decoration: underline; }
.lanes-drawing .e-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.lanes-drawing .e-key { font-size: 12px; }

.lanes-drawing { min-width: 0; }
.lanes-drawing:fullscreen { box-sizing: border-box; width: 100vw; height: 100vh; background: var(--bg); padding: var(--pad); overflow: auto; }
.lanes-drawing .lanes-controls { display:flex; align-items:stretch; overflow-x:auto; background:var(--panel); border:var(--border-w) solid var(--border); border-radius:var(--radius-sm); box-shadow:var(--elev-1); font-size:var(--fs-1); }
.lanes-drawing .lanes-controls button { appearance:none; border:0; border-right:var(--border-w) solid var(--border); background:transparent; cursor:pointer; padding:4px 9px; color:var(--text-2); font:inherit; line-height:1.6; white-space:nowrap; }
.lanes-drawing .lanes-controls button:hover { background:var(--hover); color:var(--text); }
.lanes-drawing .lanes-controls > span { display:inline-flex; align-items:center; justify-content:center; min-width:3.4em; padding:0 7px; color:var(--text-3); border-right:var(--border-w) solid var(--border); }
.lanes-drawing .e-outline .e-card { position: relative; }
.lanes-drawing .lanes-not-drawn { margin: 0 0 8px; font-size: var(--fs-2); color: var(--text-2); }
.lanes-drawing .lanes-being-drawn { margin: 0; padding: 0 9px; align-self: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-2); color: var(--text-2); }
.lanes-drawing .lanes-not-drawn-open { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; }

`
