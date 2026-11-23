// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The address of pdf.js's worker, as Vite gives it for a `?url` import, so TypeScript will let `ShownPdf` in
 * SummaryBlocks.tsx import it.
 *
 * pdf.js reads a PDF in a worker of its own, and the page must tell it where that worker's script is. Vite copies the
 * script into the build and the import gives its address, so the worker is the package's own file and is fetched only
 * when a PDF is first shown.
 *
 * ONE MODULE IS DECLARED, NOT `*?url`, for the reason graph/reactflow-css.d.ts gives: a wildcard would let any file
 * import any address without Vite's ambient types, a door this project has left shut.
 */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const address: string
  export default address
}
