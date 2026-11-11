const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {
    Object.assign(this, {
      dataset: {}, attrs: {}, children: [], listeners: {}, clientWidth: 0, clientHeight: 360,
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
  addEventListener(type, listener) { this.listeners[type] = listener; }
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
let limited = true;
let wallClock = Date.now();
let timerId = 0;
const timers = new Map();
const data = (page = 1) => ({
  page, nextPage: page + 1, fetchedAt: new Date().toISOString(),
  tracks: Array.from({ length: 10 }, (_, i) => ({
    name: 'Track ' + ((page - 1) * 10 + i), artist: 'Artist', playedAt: String((page - 1) * 10 + i),
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
  Image: Element, performance: { now: () => now }, Date: class extends Date {
    static now() { return wallClock; }
  }, JSON, Set, Math,
  Number, Array, Error, AbortSignal,
  requestAnimationFrame: callback => { callback(); return 1; },
  setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
  clearTimeout: id => timers.delete(id), setInterval() {},
  fetch: async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    if (++requests === 2) await new Promise(resolve => { finishRefresh = resolve; });
    if (page === 2 && limited) return { ok: false, status: 429, headers: { get: () => '3' } };
    return { ok: true, status: 200, json: async () => data(page) };
  },
};
vm.createContext(context);
const source = fs.readFileSync(process.argv[2] || 'listening.js', 'utf8');
assert.match(source, /\}\)\(\);\s*$/);
vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.probe = { refreshStatus, openHistory, closeHistory, loadMore,
    get: () => ({ open, history, statusPending, more, historyStatus, historyFailed, surface, tracks, expanded: strip.attrs['aria-expanded'] }) };
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
  await context.probe.loadMore();
  let state = context.probe.get();
  assert.equal(requests, 3);
  assert.equal(state.more.disabled, true);
  assert.equal(state.more.textContent, 'Try again in 3s');
  assert.match(state.historyStatus.textContent, /temporarily unavailable/);
  assert.equal(state.historyStatus.hidden, false);
  await context.probe.loadMore();
  assert.equal(requests, 3, 'No request while retry countdown is active');
  for (const seconds of [2, 0]) {
    wallClock += seconds === 2 ? 1000 : 2000;
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    callback();
    assert.equal(state.more.textContent, seconds ? 'Try again in 2s' : 'Try again');
  }
  assert.equal(state.more.disabled, false);
  assert.equal(requests, 3, 'Countdown ending must not trigger an automatic retry');
  state.surface.scrollTop = state.surface.scrollHeight;
  state.surface.listeners.scroll();
  assert.equal(requests, 3, 'A layout or scroll event after a failure must not retry');
  assert.equal(state.historyFailed, true);
  limited = false;
  await context.probe.loadMore();
  state = context.probe.get();
  assert.equal(requests, 4);
  assert.equal(state.tracks.length, 20);
  assert.equal(state.more.textContent, 'Load more');
  assert.equal(state.historyStatus.hidden, true);
  assert.equal(state.historyStatus.textContent, '');
  assert.equal(state.historyFailed, false);
  console.log('PASS: cooldown counts down, preserves history and retries only on request');
})().catch(error => { console.error(error); process.exitCode = 1; });
