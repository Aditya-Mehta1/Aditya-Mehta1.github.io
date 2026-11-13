(function() {
  const root = document.documentElement;
  const section = document.querySelector('.listening-section');
  const preview = section.querySelector('.listening-preview');
  const cover = preview.querySelector('.listening-cover');
  const caption = preview.querySelector('.listening-now');
  const earlier = section.querySelector('.listening-earlier');
  const strip = earlier.querySelector('.listening-strip');
  const toggle = earlier.querySelector('.listening-toggle');
  const current = section.querySelector('.listening-current');
  const themeToggle = section.querySelector('.listening-theme');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const endpoint = 'https://ps-website-helper.track-aditya-mehta.workers.dev/api/listening';
  const profile = preview.href;
  const canHover = window.matchMedia('(hover: hover)');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const bayer = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const artworkHost = /^https:\/\/lastfm(?:-img)?\.freetls\.fastly\.net\//;
  const thumbStep = 44;
  const inset = 17;
  const haloCell = 2;
  const haloReach = 20;
  const haloShift = 10;
  const haloDensity = .66;
  const halo = document.createElement('canvas');
  const disc = document.createElement('span');
  const sleeve = document.createElement('span');
  const warmed = new Set();
  const runs = new Map();
  let statusPending = false;
  let statusCheckedAt = -Infinity;
  let refreshTimer;
  let artwork;
  let haloSize = 0;
  let live = null;
  let freshUntil = 0;
  let summary = [];
  let tracks = [];
  let albums = [];
  let active = null;
  let following = true;
  let stripKeys;
  let nextPage = null;
  let paging = false;
  let blockedUntil = 0;
  let retryTimer;
  let staleTimer;
  let flourishTimer;
  let surface;
  let albumRow;
  let list;
  let lastRun;
  let seeking = null;
  let more;
  let historyStatus;
  let historyFailed = false;
  let history;
  let open = false;
  let intentTimer;
  let closeTimer;
  let hideTimer;
  let positionFrame;
  let tintTimer;
  let lit = null;
  let glance = null;
  let wanted = null;
  let glanceTimer;
  let immersive = false;
  let pinned = false;
  let peeking = false;
  let peekTimer;
  let swapTimer;
  let dragFrom = null;
  let dragged = false;
  let wheelTotal = 0;
  let wheelLast = 0;
  let wheelSteppedAt = null;
  let wheelIdle;

  section.classList.add('is-live');
  halo.className = 'listening-halo';
  disc.className = 'listening-disc';
  sleeve.className = 'listening-sleeve';
  cover.append(halo, disc, sleeve);
  const phrases = document.querySelectorAll('.wash-phrase, mark');
  phrases.forEach((element, index) => element.style.setProperty('--order', index));

  function swap(apply) {
    root.classList.add('is-swapping');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => root.classList.remove('is-swapping'), 400);
    apply();
  }

  let accentPicker;
  const accentCache = new Map();

  async function tint(image) {
    const selectedMode = immersive;
    const key = image.currentSrc || image.src;
    let colours = accentCache.get(key);
    try {
      if (!colours) {
        const { pickAccent } = await (accentPicker ||= import('./album-accent.js'));
        if ((glance || lit) !== image || immersive !== selectedMode) return;
        colours = pickAccent(image);
        accentCache.set(key, colours);
        if (accentCache.size > 12) accentCache.delete(accentCache.keys().next().value);
      }
    } catch {
      accentPicker = undefined;
      return;
    }
    clearTimeout(tintTimer);
    if (root.style.getPropertyValue('--paper')) {
      root.classList.remove('is-tinting');
      swap(() => paint(colours));
      return;
    }
    root.classList.add('is-tinting');
    tintTimer = setTimeout(() => root.classList.remove('is-tinting'), 1200);
    paint(colours);
  }

  function paint(colours) {
    for (const name of ['wash', 'accent', 'tone', 'mark']) {
      if (colours[name]) root.style.setProperty('--' + name, colours[name]);
      else root.style.removeProperty('--' + name);
    }
    for (const name of ['paper', 'ink', 'ink-2', 'ink-3', 'chip-0', 'chip-1', 'chip-2', 'chip-ink-0', 'chip-ink-1', 'chip-ink-2']) root.style.removeProperty('--' + name);
    root.classList.toggle('has-mark', Boolean(colours.mark));
    root.style.colorScheme = '';
    themeMeta?.setAttribute('content', '#fafafa');
    drawHalo(true);
  }

  let themeBuilder;
  const themeCache = new Map();

  async function immerse(image) {
    const key = image.currentSrc || image.src;
    try {
      const { createTheme, applyTheme } = await (themeBuilder ||= import('./album-theme.js?v=2'));
      if ((glance || lit) !== image || !immersive) return;
      let theme = themeCache.get(key);
      if (!theme) {
        theme = createTheme(image);
        themeCache.set(key, theme);
        if (themeCache.size > 12) themeCache.delete(themeCache.keys().next().value);
      }
      clearTimeout(tintTimer);
      swap(() => {
        root.classList.remove('is-tinting');
        applyTheme(theme);
        phrases.forEach((element, index) => { element.dataset.chip = index % theme.chips.length; });
        root.classList.toggle('has-mark', !theme.underline);
        themeMeta?.setAttribute('content', theme.paper);
        drawHalo(true);
      });
    } catch {
      themeBuilder = undefined;
      if ((glance || lit) === image && immersive) tint(image);
    }
  }

  function settle() {
    const image = glance || lit;
    if (image && immersive) immerse(image);
    else if (image) tint(image);
    else if (!immersive || !section.classList.contains('has-cover')) paint({});
  }

  function colour(image) {
    lit = image;
    settle();
  }

  function setMode(drop) {
    const next = pinned || peeking;
    if (drop) {
      clearTimeout(glanceTimer);
      wanted = null;
    }
    if (immersive === next && !(drop && glance)) return;
    immersive = next;
    if (drop) glance = null;
    settle();
  }

  function glanceAt(album) {
    if (!album.image || album.key === active) {
      setMode(true);
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.addEventListener('load', () => {
      if (wanted !== image) return;
      glance = image;
      settle();
    });
    wanted = image;
    image.src = album.image.replace('/300x300/', '/500x500/');
  }

  function drawHalo(force) {
    const size = Math.round(cover.clientWidth);
    if (!size || (!force && size === haloSize)) return;
    haloSize = size;
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const probeContext = probe.getContext('2d', { willReadFrequently: true });
    probeContext.fillStyle = '#767676';
    probeContext.fillStyle = root.style.getPropertyValue('--tone') || getComputedStyle(root).getPropertyValue('--tone').trim();
    probeContext.fillRect(0, 0, 1, 1);
    const [red, green, blue] = probeContext.getImageData(0, 0, 1, 1).data;
    const span = size + haloReach * 2;
    const cells = Math.ceil(span / haloCell);
    halo.width = halo.height = cells;
    halo.style.width = halo.style.height = cells * haloCell + 'px';
    halo.style.left = halo.style.top = haloShift - haloReach + 'px';
    const context = halo.getContext('2d');
    const frame = context.createImageData(cells, cells);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const left = x * haloCell - haloReach;
        const top = y * haloCell - haloReach;
        const across = left < 0 ? -left / haloShift : Math.max(0, left - size) / haloReach;
        const down = top < 0 ? -top / haloShift : Math.max(0, top - size) / haloReach;
        const density = Math.max(0, 1 - Math.hypot(across, down)) ** 1.7 * haloDensity;
        const index = (y * cells + x) * 4;
        frame.data[index] = red;
        frame.data[index + 1] = green;
        frame.data[index + 2] = blue;
        frame.data[index + 3] = density > (bayer[(y % 8) * 8 + (x % 8)] + .5) / 64 ? 255 : 0;
      }
    }
    context.putImageData(frame, 0, 0);
  }

  function showArtwork(url, direction = 0) {
    if (url === artwork) return;
    artwork = url;
    lit = null;
    if (!url) {
      sleeve.replaceChildren();
      section.classList.remove('has-cover');
      paint({});
      return;
    }
    const sizes = [url.replace('/300x300/', '/500x500/'), url];
    const image = new Image();
    image.className = 'listening-artwork';
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      if (artwork !== url) return;
      const previous = [...sleeve.children];
      if (direction && !calm.matches) {
        image.classList.add('is-sliding');
        image.style.setProperty('--from', direction * 100 + '%');
        flourish();
      }
      sleeve.append(image);
      section.classList.add('has-cover');
      colour(image);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        image.classList.add('is-shown');
        for (const element of previous) {
          element.style.setProperty('--to', direction * -100 + '%');
          element.classList.add('is-leaving');
        }
      }));
      setTimeout(() => previous.forEach(element => element.remove()), 380);
    });
    image.addEventListener('error', () => {
      if (artwork !== url) return;
      if (sizes.length) {
        image.src = sizes.shift();
        return;
      }
      lit = null;
      sleeve.replaceChildren();
      section.classList.remove('has-cover');
      paint({});
    });
    image.src = sizes.shift();
  }

  function flourish() {
    clearTimeout(flourishTimer);
    cover.classList.remove('is-out');
    cover.classList.add('is-switching');
    flourishTimer = setTimeout(() => {
      cover.classList.remove('is-switching');
      cover.classList.add('is-out');
      flourishTimer = setTimeout(() => cover.classList.remove('is-out'), 900);
    }, 340);
  }

  function bump(by) {
    cover.style.setProperty('--bump', by * -6 + 'px');
    cover.classList.remove('is-bumping');
    void cover.offsetWidth;
    cover.classList.add('is-bumping');
  }

  function warm(album) {
    if (!album?.image || warmed.has(album.image)) return;
    warmed.add(album.image);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.src = album.image.replace('/300x300/', '/500x500/');
  }

  function ago(iso) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return '';
    const minutes = Math.max(1, Math.round((Date.now() - then) / 60000));
    if (minutes < 60) return minutes + 'm';
    if (minutes < 1440) return Math.floor(minutes / 60) + 'h';
    if (minutes < 10080) return Math.floor(minutes / 1440) + 'd';
    const date = new Date(then);
    return months[date.getMonth()] + ' ' + date.getDate();
  }

  function albumKey(track) {
    return JSON.stringify([track.album, track.image || track.artist]);
  }

  function identity(track) {
    return JSON.stringify([track.playedAt, track.name, track.artist]);
  }

  function clean(track) {
    if (typeof track?.name !== 'string' || !track.name || typeof track.artist !== 'string') return null;
    return {
      name: track.name,
      artist: track.artist,
      album: typeof track.album === 'string' && track.album ? track.album : null,
      image: typeof track.image === 'string' && artworkHost.test(track.image) ? track.image : null,
      playedAt: typeof track.playedAt === 'string' ? track.playedAt : null,
      nowPlaying: track.nowPlaying === true,
    };
  }

  async function getPage(page) {
    if (Date.now() < blockedUntil) throw new Error('History temporarily busy');
    const response = await fetch(endpoint + '?page=' + page, {
      credentials: 'omit', signal: AbortSignal.timeout(7000),
    });
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const seconds = /^\d+$/.test(retryAfter) ? Number(retryAfter)
        : Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000);
      blockedUntil = Date.now() + (Number.isSafeInteger(seconds) && seconds >= 0 ? Math.max(1, seconds) : 60) * 1000;
      throw new Error('History temporarily busy');
    }
    if (!response.ok) throw new Error('Could not load history. Try again');
    const data = await response.json();
    if (data.page !== page || !Array.isArray(data.tracks) || data.tracks.length > 11
      || (data.nextPage !== null && (data.nextPage !== page + 1 || data.nextPage > 10))) {
      throw new Error('Listening history unavailable');
    }
    return {
      fetchedAt: data.fetchedAt, nextPage: data.nextPage, tracks: data.tracks.map(clean).filter(Boolean),
      albums: Array.isArray(data.albums) && data.albums.length <= 101 ? data.albums.map(clean).filter(Boolean) : [],
    };
  }

  function collect() {
    const found = new Map();
    for (const track of [live, ...summary, ...tracks]) {
      const key = track && albumKey(track);
      if (key && !found.has(key)) found.set(key, { ...track, key });
    }
    albums = [...found.values()];
  }

  function position() {
    return albums.findIndex(album => album.key === active);
  }

  function thumb(album, jump) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'listening-thumb';
    button.dataset.key = album.key;
    button.title = (album.album || album.name) + ' — ' + album.artist;
    button.setAttribute('aria-label', 'Show ' + (album.album || album.name) + ' by ' + album.artist);
    if (album.image) {
      const image = new Image();
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.draggable = false;
      image.addEventListener('error', () => {
        if (image.src === album.image) image.hidden = true;
        else image.src = album.image;
      });
      image.src = album.image.replace('/300x300/', '/174s/');
      button.append(image);
    }
    button.addEventListener('click', () => {
      activate(album.key);
      if (jump) seek(album.key);
    });
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return;
      clearTimeout(glanceTimer);
      glanceTimer = setTimeout(() => glanceAt(album), 120);
    });
    button.addEventListener('pointerleave', () => {
      clearTimeout(glanceTimer);
      glanceTimer = setTimeout(() => setMode(true), 160);
    });
    return button;
  }

  function mark() {
    for (const button of earlier.querySelectorAll('.listening-thumb')) {
      const selected = button.dataset.key === active;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  function show(direction = 0) {
    const index = position();
    const album = albums[index];
    const playing = Boolean(album?.nowPlaying) && Date.now() < freshUntil;
    current.hidden = !playing;
    section.classList.toggle('is-playing', playing);
    if (!album) return;
    const name = document.createElement('span');
    const artist = document.createElement('span');
    name.className = 'listening-track';
    artist.className = 'listening-artist';
    name.textContent = album.name;
    artist.textContent = album.artist;
    caption.replaceChildren(name, artist);
    showArtwork(album.image, direction);
    mark();
    strip.scrollTo({ left: Math.max(0, position() - 1) * thumbStep });
  }

  function render() {
    collect();
    if (following || !albums.some(album => album.key === active)) {
      following = true;
      active = albums[0]?.key ?? null;
    }
    const keys = albums.map(album => album.key).join('\n');
    if (keys !== stripKeys) {
      stripKeys = keys;
      strip.replaceChildren(...albums.map(album => thumb(album, false)));
    }
    if (albumRow && keys !== albumRow.dataset.keys) {
      albumRow.dataset.keys = keys;
      albumRow.replaceChildren(...albums.map(album => thumb(album, true)));
    }
    show();
  }

  function activate(key) {
    const from = position();
    const to = albums.findIndex(album => album.key === key);
    if (to < 0 || to === from) return;
    active = key;
    following = to === 0;
    show(Math.sign(to - from));
    warm(albums[to + 1]);
    warm(albums[to - 1]);
  }

  function seek(key) {
    const run = runs.get(key);
    const reachable = run && run.offsetTop <= list.scrollHeight - list.clientHeight;
    seeking = reachable || nextPage === null ? null : key;
    if (run) list.scrollTo({ top: run.offsetTop });
    if (seeking) loadMore();
  }

  function step(by) {
    const next = albums[position() + by];
    if (next) activate(next.key);
    else bump(by);
  }

  function merge(incoming) {
    const known = new Set(tracks.map(identity));
    const past = incoming.tracks.filter(track => !track.nowPlaying);
    if (!past.some(track => known.has(identity(track)))) {
      tracks = [];
      known.clear();
      nextPage = incoming.nextPage;
    }
    if (incoming.nextPage === null) nextPage = null;
    const added = past.filter(track => {
      const key = identity(track);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    tracks = [...added, ...tracks];
  }

  async function refreshStatus() {
    const elapsed = performance.now() - statusCheckedAt;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshStatus, elapsed < 60000 ? 60000 - elapsed : 60000);
    if (document.hidden || paging || statusPending || elapsed < 60000) return;
    statusPending = true;
    statusCheckedAt = performance.now();
    try {
      const data = await getPage(1);
      const fetchedAt = Date.parse(data.fetchedAt);
      live = data.tracks.find(track => track.nowPlaying) || null;
      freshUntil = live && fetchedAt <= Date.now() ? fetchedAt + 120000 : 0;
      clearTimeout(staleTimer);
      if (Date.now() < freshUntil) {
        staleTimer = setTimeout(show, freshUntil - Date.now());
      }
      summary = data.albums;
      if (!open && !paging) {
        merge(data);
        buildHistory();
      }
      render();
      section.hidden = albums.length === 0;
    } catch {
      freshUntil = 0;
      if (albums.length) show();
      else section.hidden = true;
      if (more && Date.now() < blockedUntil) showCooldown();
    } finally {
      statusPending = false;
    }
  }

  function positionHistory() {
    if (!history || !open) return;
    const origin = earlier.getBoundingClientRect();
    history.style.setProperty('--room', Math.round(window.innerHeight - origin.top + inset - 8) + 'px');
    const width = history.offsetWidth;
    const height = history.offsetHeight;
    const left = Math.max(8, Math.min(origin.left - inset, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(origin.top - inset, window.innerHeight - height - 8));
    const player = section.getBoundingClientRect();
    history.style.left = left + 'px';
    history.style.top = top + 'px';
    history.style.setProperty('--hole-x', Math.round(player.left - 12) + 'px');
    history.style.setProperty('--hole-y', Math.round(player.top - 12) + 'px');
    history.style.setProperty('--hole-w', Math.round(player.width + 84) + 'px');
    history.style.setProperty('--hole-h', Math.round(Math.max(0, top - player.top + 12)) + 'px');
    const edges = [origin.top - top, left + width - origin.right, top + height - origin.bottom, origin.left - left];
    history.style.setProperty('--origin', edges.map(value => Math.max(0, value) + 'px').join(' '));
  }

  function schedulePosition() {
    if (!open || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      positionHistory();
    });
  }

  function openHistory() {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    if (!history) return;
    if (open) return;
    clearTimeout(hideTimer);
    open = true;
    history.hidden = false;
    history.inert = false;
    history.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    if (history.showPopover && !history.matches(':popover-open')) history.showPopover();
    positionHistory();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (open) {
        history.classList.add('is-open');
        if (!historyFailed && list.scrollHeight <= list.clientHeight + 48) loadMore();
      }
    }));
  }

  function closeHistory() {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    if (!history || !open) return;
    open = false;
    seeking = null;
    history.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (history.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    history.inert = true;
    history.setAttribute('aria-hidden', 'true');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (history.hidePopover && history.matches(':popover-open')) history.hidePopover();
      history.hidden = true;
    }, 200);
  }

  function buildHistory() {
    if (history) history.remove();
    clearTimeout(retryTimer);
    historyFailed = false;
    seeking = null;
    runs.clear();
    lastRun = undefined;
    history = document.createElement('div');
    history.id = 'listening-history';
    history.className = 'listening-history';
    history.setAttribute('popover', 'manual');
    history.setAttribute('aria-hidden', 'true');
    history.hidden = true;
    history.inert = true;
    surface = document.createElement('div');
    surface.className = 'history-surface';
    surface.setAttribute('role', 'region');
    surface.setAttribute('aria-label', 'Recent listening history');
    albumRow = document.createElement('div');
    albumRow.className = 'history-albums';
    albumRow.setAttribute('role', 'group');
    albumRow.setAttribute('aria-label', 'Recent albums');
    list = document.createElement('div');
    list.className = 'history-list';
    more = document.createElement('button');
    more.type = 'button';
    more.className = 'listening-more';
    more.setAttribute('aria-describedby', 'listening-status');
    more.textContent = 'Load more';
    more.addEventListener('click', loadMore);
    list.addEventListener('scroll', () => {
      if (!historyFailed && list.scrollTop > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 48) loadMore();
    }, { passive: true });
    historyStatus = document.createElement('p');
    historyStatus.id = 'listening-status';
    historyStatus.className = 'listening-status';
    historyStatus.setAttribute('role', 'status');
    historyStatus.hidden = true;
    list.append(more, historyStatus);
    surface.append(albumRow, list);
    history.append(surface);
    earlier.append(history);
    appendRows(tracks);
  }

  function appendRows(added) {
    for (const track of added) {
      const key = albumKey(track);
      if (!lastRun || lastRun.key !== key || lastRun.artist !== track.artist) {
        const run = document.createElement('div');
        const body = document.createElement('div');
        const artist = document.createElement('p');
        run.className = 'history-run';
        body.className = 'history-tracks';
        artist.className = 'history-artist';
        artist.textContent = track.album ? track.artist + ' · ' + track.album : track.artist;
        body.append(artist);
        run.append(thumb({ ...track, key }, false), body);
        list.insertBefore(run, more);
        if (!runs.has(key)) runs.set(key, run);
        lastRun = { key, artist: track.artist, body };
      }
      const row = document.createElement('a');
      const name = document.createElement('span');
      row.className = 'history-track';
      row.href = profile;
      name.className = 'history-name';
      name.textContent = track.name;
      row.append(name);
      if (track.playedAt) {
        const time = document.createElement('time');
        time.dateTime = track.playedAt;
        time.textContent = ago(track.playedAt);
        row.append(time);
      }
      lastRun.body.append(row);
    }
    more.hidden = nextPage === null;
    if (nextPage === null && !list.dataset.ended) {
      const end = document.createElement('p');
      list.dataset.ended = 'true';
      end.className = 'listening-end';
      end.textContent = tracks.length ? 'End of recent history' : 'No recent plays';
      list.append(end);
    }
    schedulePosition();
  }

  async function loadMore() {
    if (document.hidden || !open || paging || more.disabled || nextPage === null) return;
    let loaded = false;
    paging = true;
    more.disabled = true;
    more.textContent = 'Loading…';
    historyFailed = false;
    historyStatus.textContent = '';
    historyStatus.hidden = true;
    try {
      const data = await getPage(nextPage);
      const known = new Set(tracks.map(identity));
      const added = data.tracks.filter(track => {
        const key = identity(track);
        if (track.nowPlaying || known.has(key)) return false;
        known.add(key);
        return true;
      });
      nextPage = data.nextPage;
      tracks.push(...added);
      appendRows(added);
      render();
      more.textContent = 'Load more';
      loaded = true;
    } catch {
      historyFailed = true;
      historyStatus.textContent = Date.now() < blockedUntil
        ? 'More tracks are temporarily unavailable.'
        : 'Couldn’t load more tracks.';
      historyStatus.hidden = false;
      more.textContent = 'Try again';
    } finally {
      paging = false;
      more.disabled = false;
      if (Date.now() < blockedUntil) showCooldown();
    }
    refreshStatus();
    if (!loaded || !open) seeking = null;
    else if (seeking) seek(seeking);
    else if (list.scrollHeight <= list.clientHeight + 48) loadMore();
  }

  function showCooldown() {
    clearTimeout(retryTimer);
    const seconds = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
    historyFailed = true;
    historyStatus.hidden = false;
    historyStatus.textContent = seconds ? 'More tracks are temporarily unavailable.' : 'You can try again now.';
    more.disabled = seconds > 0;
    more.textContent = seconds ? 'Try again in ' + seconds + 's' : 'Try again';
    if (seconds) retryTimer = setTimeout(showCooldown, Math.min(1000, blockedUntil - Date.now()));
  }

  section.addEventListener('pointerenter', () => {
    refreshStatus();
    warm(albums[position() + 1]);
  });
  preview.addEventListener('pointerdown', event => {
    dragged = false;
    dragFrom = event.pointerType === 'mouse' && event.button !== 0 ? null : event.clientX;
  });
  preview.addEventListener('pointermove', event => {
    if (dragFrom === null || albums.length < 2 || Math.abs(event.clientX - dragFrom) < 28) return;
    step(event.clientX < dragFrom ? 1 : -1);
    dragFrom = null;
    dragged = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    preview.addEventListener(type, () => { dragFrom = null; });
  }
  preview.addEventListener('click', event => {
    if (dragged) event.preventDefault();
    dragged = false;
  });
  preview.addEventListener('dragstart', event => event.preventDefault());
  preview.addEventListener('wheel', event => {
    if (albums.length < 2 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    const size = Math.abs(event.deltaX);
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => {
      wheelTotal = 0;
      wheelLast = 0;
      wheelSteppedAt = null;
    }, 140);
    if (wheelSteppedAt !== null && event.timeStamp - wheelSteppedAt > 320 && size > wheelLast * 2 + 8) {
      wheelTotal = 0;
      wheelSteppedAt = null;
    }
    wheelLast = size;
    if (wheelSteppedAt !== null) return;
    wheelTotal += event.deltaX;
    if (Math.abs(wheelTotal) < 36) return;
    wheelSteppedAt = event.timeStamp;
    step(Math.sign(wheelTotal));
  }, { passive: false });
  preview.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1);
  });
  cover.addEventListener('animationend', () => cover.classList.remove('is-bumping'));
  themeToggle.addEventListener('click', () => {
    pinned = !pinned;
    if (!pinned) peeking = false;
    clearTimeout(peekTimer);
    themeToggle.setAttribute('aria-pressed', String(pinned));
    themeToggle.textContent = pinned ? 'matched' : 'match';
    setMode();
  });
  section.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(peekTimer);
    clearTimeout(glanceTimer);
    peekTimer = setTimeout(() => { peeking = true; setMode(); }, 140);
    glanceTimer = setTimeout(() => setMode(true), 160);
  });
  section.addEventListener('pointerleave', () => {
    clearTimeout(peekTimer);
    clearTimeout(glanceTimer);
    peekTimer = setTimeout(() => { peeking = false; setMode(true); }, 220);
  });
  toggle.addEventListener('click', () => {
    if (open) closeHistory();
    else openHistory();
  });
  earlier.addEventListener('pointerenter', event => {
    clearTimeout(closeTimer);
    if (event.pointerType !== 'mouse' || !canHover.matches) return;
    clearTimeout(intentTimer);
    intentTimer = setTimeout(openHistory, 100);
  });
  earlier.addEventListener('pointerleave', event => {
    clearTimeout(intentTimer);
    if (event.pointerType === 'mouse' && !earlier.querySelector(':focus-visible')) {
      closeTimer = setTimeout(closeHistory, 160);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (open && !earlier.contains(event.target)) closeHistory();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open) return;
    closeHistory();
    setMode(true);
  });
  window.addEventListener('resize', () => {
    drawHalo(false);
    schedulePosition();
  });
  window.addEventListener('scroll', schedulePosition, { passive: true });
  drawHalo(true);
  refreshStatus();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      show();
      refreshStatus();
    }
  });
})();
