// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * React Flow's stylesheet, so TypeScript will let the canvas import it.
 *
 * The canvas does not work without this file: React Flow puts the pane transform, the node
 * positioning and the edge layer in it, and without them every card stacks at the top left. It is
 * imported by Canvas.tsx and by nothing else, so it travels in the same lazily-loaded chunk as the
 * canvas itself and is not fetched by a reader who never opens one.
 *
 * ONE MODULE IS DECLARED, NOT `*.css`. A wildcard would let any file in this repository import any
 * stylesheet from TypeScript without Vite's ambient types being present, which is a door this
 * project has deliberately left shut — src/web/main.tsx says so in its own comment and links the
 * application stylesheet from index.html instead. This declares the single third-party file the
 * canvas needs and nothing else.
 */
declare module '@xyflow/react/dist/style.css'
