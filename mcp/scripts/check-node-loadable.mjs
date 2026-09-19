#!/usr/bin/env bun
/* Does the server's import graph still load under plain Bun / Node?
 *
 * This exists because bundler runtimes resolve modules differently than plain runtimes —
 * `import.meta.glob`, `?raw`, or a stray `.jsx` import all work in the frontend bundler.
 * The server does not run under a bundler. So a client-only import can land in a shared
 * lib module and still kill the server at startup. That is exactly what happened once:
 * `history.js` began importing `t` from `i18n.js` (import.meta.glob over the locale packs,
 * plus React), and the server died on `import`.
 *
 * Run by bare runtime on purpose — being outside a bundler environment IS the check.
 *
 * Importing the two entry modules is enough on its own: everything the server touches hangs off
 * them, so a lib module that grows a browser-only dependency next year fails here without this
 * list being updated. The named list below only exists to point at the culprit instead of at a
 * stack trace ten frames deep.
 */
const LIB = new URL('../../frontend/src/lib/', import.meta.url)

// Every frontend/src/lib module the server reaches today. Named individually so a failure says
// which one, rather than which import chain.
const MODULES = [
  'i18n-core.js', 'format.js', 'exercises.js', 'exercises-data.js',
  'history.js', 'muscles.js', 'onerm.js', 'progression.js'
]

let failed = 0
for (const m of MODULES) {
  try {
    await import(new URL(m, LIB))
    console.log(`  ok    ${m}`)
  } catch (e) {
    failed++
    console.error(`  FAIL  ${m} — ${e.message}`)
  }
}

// The real assertion: the server's own entry points, which pull the whole graph transitively.
// A module added to the graph later is covered by this even if the list above never learns it.
for (const entry of ['../src/state.js', '../src/tools.js']) {
  try {
    await import(new URL(entry, import.meta.url))
    console.log(`  ok    mcp/${entry.replace('../', '')}`)
  } catch (e) {
    failed++
    console.error(`  FAIL  mcp/${entry.replace('../', '')} — ${e.message}`)
  }
}

if (failed) {
  console.error(`\n${failed} module(s) do not load under plain runtime — the MCP server would not start.`)
  process.exit(1)
}
console.log('\nthe whole MCP import graph loads under plain runtime.')
