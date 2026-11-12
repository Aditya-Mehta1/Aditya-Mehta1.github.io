const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(process.argv[2] || 'listening.js', 'utf8');
assert.match(source, /\}\)\(\);\s*$/);
const epoch = Date.parse('2026-11-11T12:00:00Z');
const settle = () => new Promise(setImmediate);
const track = i => ({
  name: 'Track ' + i, artist: 'Artist', album: 'Album ' + Math.floor(i / 2),
  playedAt: new Date(epoch - (i + 1) * 180000).toISOString(),
  nowPlaying: false, image: null, url: 'https://www.last.fm/music/Artist/Track-' + i,
});
const snapshot = (page = 1, options = {}) => ({
  page, nextPage: page < 10 ? page + 1 : null, fetchedAt: new Date(epoch).toISOString(),
  tracks: Array.from({ length: 10 }, (_, i) => track((page - 1) * 10 + i)),
  ...options,
});
const liveSnapshot = (options = {}) => snapshot(1, {
  tracks: [{ ...track(-1), name: 'Live', album: 'Live album', playedAt: null, nowPlaying: true }, ...snapshot().tracks],
  ...options,
});
const response = (body, status = 200, retry = '60') => ({
  ok: status === 200, status, headers: { get: () => retry }, json: async () => body,
});
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function widget(initial = snapshot()) {
  let now = 0;
  let handler = page => response({ ...snapshot(page), fetchedAt: new Date(epoch + now).toISOString() });
  let first = true;
  let timerId = 0;
  const timers = new Map();
  const requests = [];
  const documentListeners = {};
  const nodes = {};
  class Element {
    constructor() {
      const classes = new Set();
      Object.assign(this, {
        dataset: {}, attrs: {}, children: [], listeners: {}, clientWidth: 0, clientHeight: 360,
        scrollHeight: 1000, offsetWidth: 530, offsetHeight: 360, offsetTop: 0,
        href: 'https://www.last.fm/', style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
        classList: {
          add: (...names) => names.forEach(name => classes.add(name)),
          remove: (...names) => names.forEach(name => classes.delete(name)),
          contains: name => classes.has(name),
          toggle(name, value = !classes.has(name)) { if (value) classes.add(name); else classes.delete(name); },
        },
      });
    }
    append(...elements) { this.children.push(...elements); }
    insertBefore(element, before) { this.children.splice(this.children.indexOf(before), 0, element); }
    replaceChildren(...elements) { this.children = elements; }
    remove() { this.removed = true; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    scrollTo() {}
    querySelector(key) { return nodes[key] || null; }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { left: 10, right: 178, top: 400, bottom: 436 }; }
    contains(element) { return this.children.includes(element); }
    focus() { context.document.activeElement = this; }
    matches() { return Boolean(this.popoverOpen); }
    showPopover() { this.popoverOpen = true; }
    hidePopover() { this.popoverOpen = false; }
  }
  for (const key of ['section', 'preview', 'cover', 'now', 'earlier', 'strip', 'toggle', 'current', 'theme']) {
    nodes['.listening-' + key] = new Element();
  }
  nodes['.listening-current'].hidden = true;
  const context = {
    document: {
      documentElement: new Element(), querySelector: key => nodes[key] || null,
      querySelectorAll: () => [], createElement: () => new Element(), hidden: false,
      addEventListener: (name, listener) => { documentListeners[name] = listener; },
    },
    window: {
      matchMedia: () => ({ matches: true }), innerWidth: 1280, innerHeight: 800, addEventListener() {},
    },
    Image: Element, performance: { now: () => now },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [epoch + now])); }
      static now() { return epoch + now; }
    },
    AbortSignal, requestAnimationFrame: callback => { callback(); return 1; },
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, at: now + Math.max(1, delay) });
      return timerId;
    },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, init) => {
      const page = Number(new URL(url).searchParams.get('page'));
      requests.push({ page, at: now, init });
      if (first) { first = false; return typeof initial === 'function' ? initial(page) : response(initial); }
      return handler(page);
    },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.probe = { refreshStatus, openHistory, closeHistory, loadMore, activate, step,
      get: () => ({ open, history, statusPending, paging, more, historyStatus, historyFailed,
        list, tracks, albums, active, following, nextPage, staleTimer, blockedUntil }) };
  })();`), context);
  return {
    ...context.probe, nodes, requests, timers, context,
    reply: callback => { handler = callback; },
    jump: ms => { now += ms; },
    visible: async value => {
      context.document.hidden = !value;
      documentListeners.visibilitychange();
      await settle();
    },
    async advance(ms) {
      const target = now + ms;
      let count = 0;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        assert.ok(++count < 1000, 'Timers must not spin or create an automatic retry loop');
        const [id, timer] = next;
        now = Math.max(now, timer.at);
        timers.delete(id);
        timer.callback();
        await settle();
      }
      now = target;
      await settle();
    },
    playing: () => !nodes['.listening-current'].hidden,
    freshResponse: body => response({ ...body, fetchedAt: new Date(epoch + now).toISOString() }),
  };
}

test('polling waits only the remaining minute after an early interaction', async () => {
  const w = widget();
  await settle();
  await w.advance(59000);
  await w.refreshStatus();
  assert.equal(w.requests.length, 1);
  await w.advance(999);
  assert.equal(w.requests.length, 1);
  await w.advance(1);
  assert.equal(w.requests.length, 2);
  await w.advance(60000);
  assert.equal(w.requests.length, 3);
});

test('history stays open and live status updates when a deferred refresh completes', async () => {
  const w = widget();
  await settle();
  const hold = deferred();
  w.reply(() => hold.promise);
  w.jump(60000);
  const pending = w.refreshStatus();
  w.openHistory();
  const history = w.get().history;
  hold.resolve(w.freshResponse(liveSnapshot()));
  await pending;
  assert.equal(w.get().history, history);
  assert.equal(history.hidden, false);
  assert.equal(history.inert, false);
  assert.equal(history.attrs['aria-hidden'], 'false');
  assert.equal(w.nodes['.listening-toggle'].attrs['aria-expanded'], 'true');
  assert.equal(w.get().statusPending, false);
  assert.equal(w.playing(), true);
  w.reply(() => response(null, 503));
  await w.advance(60000);
  assert.equal(w.playing(), false);
  assert.equal(w.get().history, history);
  assert.equal(w.get().tracks.length, 10);
  w.reply(() => w.freshResponse(liveSnapshot()));
  await w.advance(60000);
  assert.equal(w.playing(), true);
});

test('keeping history open does not stop minute status updates or reset history', async () => {
  const w = widget(liveSnapshot());
  await settle();
  w.reply(() => w.freshResponse(liveSnapshot()));
  w.openHistory();
  const history = w.get().history;
  await w.advance(180000);
  assert.equal(w.requests.length, 4);
  assert.equal(w.playing(), true);
  assert.equal(w.get().history, history);
  assert.equal(history.hidden, false);
});

test('visibility resume clears expired playing before a slow refresh returns', async () => {
  const w = widget(liveSnapshot());
  await settle();
  await w.visible(false);
  w.jump(180000);
  const hold = deferred();
  w.reply(() => hold.promise);
  await w.visible(true);
  assert.equal(w.playing(), false);
  hold.resolve(w.freshResponse(liveSnapshot()));
  await settle();
  assert.equal(w.playing(), true);
});

test('selecting older albums hides playing and preserves selection across updates', async () => {
  const w = widget(liveSnapshot());
  await settle();
  const key = w.get().albums[1].key;
  w.activate(key);
  assert.equal(w.playing(), false);
  w.reply(() => w.freshResponse(liveSnapshot()));
  await w.advance(60000);
  assert.equal(w.get().active, key);
  assert.equal(w.get().following, false);
  w.activate(w.get().albums[0].key);
  assert.equal(w.playing(), true);
  assert.equal(w.get().following, true);
  w.reply(() => w.freshResponse(snapshot(1, { nextPage: null })));
  await w.advance(60000);
  assert.equal(w.playing(), false);
  w.closeHistory();
  await w.advance(60000);
  assert.equal(w.get().nextPage, null);
});

test('paging is sequential, deduplicates overlap, and stops at page ten', async () => {
  const w = widget();
  await settle();
  await w.loadMore();
  assert.equal(w.requests.length, 1);
  w.openHistory();
  const hold = deferred();
  w.reply(() => hold.promise);
  const pending = w.loadMore();
  await w.loadMore();
  await w.refreshStatus();
  assert.equal(w.requests.length, 2);
  hold.resolve(response(snapshot(2, { tracks: [track(9), ...snapshot(2).tracks.slice(1)] })));
  await pending;
  assert.equal(w.get().tracks.length, 19);
  w.reply(page => response(snapshot(page)));
  for (let page = 3; page <= 10; page++) await w.loadMore();
  assert.equal(w.get().nextPage, null);
  assert.equal(w.get().more.hidden, true);
  assert.equal(w.get().tracks.length, 99);
  await w.loadMore();
  assert.deepEqual(w.requests.map(request => request.page), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('paging failure preserves rows and only an explicit retry fetches again', async () => {
  const w = widget();
  await settle();
  w.openHistory();
  w.reply(() => response(null, 503));
  await w.loadMore();
  assert.equal(w.get().tracks.length, 10);
  assert.equal(w.get().nextPage, 2);
  assert.equal(w.get().more.textContent, 'Try again');
  assert.equal(w.get().historyStatus.textContent, 'Couldn’t load more tracks.');
  w.get().list.scrollTop = 1000;
  w.get().list.listeners.scroll();
  assert.equal(w.requests.length, 2);
  w.reply(page => response(snapshot(page)));
  await w.loadMore();
  assert.equal(w.get().tracks.length, 20);
  assert.equal(w.get().historyFailed, false);
  assert.equal(w.get().historyStatus.hidden, true);
});

test('429 countdown survives close/reopen and ending it does not retry', async () => {
  const w = widget();
  await settle();
  w.openHistory();
  w.reply(() => response(null, 429, '3'));
  await w.loadMore();
  assert.equal(w.get().more.textContent, 'Try again in 3s');
  assert.equal(w.get().more.disabled, true);
  assert.equal(w.get().historyStatus.textContent, 'More tracks are temporarily unavailable.');
  await w.loadMore();
  assert.equal(w.requests.length, 2);
  w.closeHistory();
  await w.advance(1000);
  w.openHistory();
  assert.equal(w.get().more.textContent, 'Try again in 2s');
  await w.advance(2000);
  assert.equal(w.get().more.textContent, 'Try again');
  assert.equal(w.get().more.disabled, false);
  assert.equal(w.get().historyStatus.textContent, 'You can try again now.');
  assert.equal(w.requests.length, 2);
  w.get().list.listeners.scroll();
  assert.equal(w.requests.length, 2);
});

test('hidden tabs do not start or automatically chain older pages', async () => {
  const w = widget();
  await settle();
  w.openHistory();
  const hold = deferred();
  w.reply(() => hold.promise);
  const pending = w.loadMore();
  await w.visible(false);
  w.get().list.scrollHeight = 100;
  hold.resolve(response(snapshot(2)));
  await pending;
  assert.equal(w.requests.length, 2);
  await w.loadMore();
  assert.equal(w.requests.length, 2);
});

test('re-reading the same cached snapshot cannot extend live freshness', async () => {
  const w = widget(liveSnapshot());
  await settle();
  w.reply(() => response(liveSnapshot()));
  await w.advance(119999);
  assert.equal(w.playing(), true);
  await w.advance(1);
  assert.equal(w.playing(), false);
  assert.equal(w.nodes['.listening-section'].classList.contains('is-playing'), false);
});

test('status refresh catches up as soon as paging releases a due minute tick', async () => {
  const w = widget(liveSnapshot());
  await settle();
  await w.advance(59000);
  w.openHistory();
  const hold = deferred();
  w.reply(page => page === 2 ? hold.promise : w.freshResponse(liveSnapshot()));
  const pending = w.loadMore();
  await w.advance(2000);
  assert.equal(w.requests.length, 2);
  hold.resolve(response(snapshot(2)));
  await pending;
  await settle();
  assert.deepEqual(w.requests.map(request => [request.page, request.at]), [[1, 0], [2, 59000], [1, 61000]]);
  assert.equal(w.playing(), true);
});

test('a status 429 immediately disables shared history paging without automatic retries', async () => {
  const w = widget(liveSnapshot());
  await settle();
  w.openHistory();
  w.reply(() => response(null, 429, '3'));
  await w.advance(60000);
  assert.equal(w.get().more.textContent, 'Try again in 3s');
  assert.equal(w.get().more.disabled, true);
  assert.equal(w.get().historyStatus.hidden, false);
  assert.equal(w.get().historyFailed, true);
  await w.advance(3000);
  w.get().list.scrollTop = 1000;
  w.get().list.listeners.scroll();
  assert.equal(w.requests.length, 2);
  w.reply(page => response(snapshot(page)));
  await w.loadMore();
  assert.equal(w.requests.length, 3);
  assert.equal(w.get().historyFailed, false);
});
