const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {
    Object.assign(this, {
      dataset: {}, attrs: {}, children: [], clientWidth: 0, clientHeight: 360,
      scrollHeight: 1000, offsetWidth: 530, offsetHeight: 360,
      href: 'https://www.last.fm/',
      style: { setProperty() {}, removeProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    });
  }
  append(...nodes) { this.children.push(...nodes); }
  insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
  replaceChildren(...nodes) { this.children = nodes; }
  remove() { this.removed = true; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener() {}
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 10, right: 178, top: 400, bottom: 436 }; }
  contains() { return false; }
}

const nodes = Object.fromEntries(['section', 'preview', 'cover', 'now', 'earlier', 'strip', 'current']
  .map(key => ['.listening-' + key, new Element()]));
for (const element of Object.values(nodes)) element.querySelector = key => nodes[key];
let now = 0;
let requests = 0;
let finishRefresh;
const data = () => ({
  page: 1, nextPage: 2, fetchedAt: new Date().toISOString(),
  tracks: Array.from({ length: 10 }, (_, i) => ({
    name: 'Track ' + i, artist: 'Artist', playedAt: String(i),
    nowPlaying: false, image: null, url: null,
  })),
});
const context = {
  document: {
    documentElement: new Element(), querySelector: key => nodes[key],
    querySelectorAll: () => [], createElement: () => new Element(),
    hidden: false, addEventListener() {},
  },
  window: {
    matchMedia: () => ({ matches: true }), innerWidth: 1280, innerHeight: 800,
    addEventListener() {},
  },
  Image: Element, performance: { now: () => now }, Date, JSON, Set, Math,
  Number, Array, Error, AbortSignal,
  requestAnimationFrame: callback => { callback(); return 1; },
  setTimeout: () => 1, clearTimeout() {}, setInterval() {},
  fetch: async () => {
    if (++requests === 2) await new Promise(resolve => { finishRefresh = resolve; });
    return { ok: true, status: 200, json: async () => data() };
  },
};
vm.createContext(context);
const source = fs.readFileSync(process.argv[2] || 'listening.js', 'utf8');
assert.match(source, /\}\)\(\);\s*$/);
vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.probe = { refreshStatus, openHistory, closeHistory,
    get: () => ({ open, history, statusPending, expanded: strip.attrs['aria-expanded'] }) };
})();`), context);

(async () => {
  await new Promise(setImmediate);
  now = 61000;
  const pending = context.probe.refreshStatus();
  context.probe.openHistory();
  const opened = context.probe.get();
  assert.equal(opened.open, true);
  assert.equal(opened.history.hidden, false);
  finishRefresh();
  await pending;
  const resolved = context.probe.get();
  assert.equal(resolved.history, opened.history, 'Pending refresh must preserve the opened panel');
  assert.equal(resolved.history.hidden, false);
  assert.equal(resolved.history.inert, false);
  assert.equal(resolved.statusPending, false);
  assert.equal(resolved.expanded, 'true');
  context.probe.closeHistory();
  context.probe.openHistory();
  assert.equal(context.probe.get().history.hidden, false);
  assert.equal(requests, 2);
  console.log('PASS: deferred refresh preserves opened history and releases its pending flag');
})().catch(error => { console.error(error); process.exitCode = 1; });
