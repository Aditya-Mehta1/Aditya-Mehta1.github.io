(function() {
  const section = document.querySelector('.listening-section');
  const preview = section.querySelector('.listening-preview');
  const source = preview.querySelector('.listening-source');
  const heading = section.querySelector('.listening-heading');
  const current = heading.querySelector('.listening-current');
  const feed = source.dataset.src;
  const canHover = window.matchMedia('(hover: hover)');
  const feedRowHeight = 56;
  const visibleRows = 4;
  const columnRows = 5;
  const inset = 17;
  let statusPending = false;
  let statusCheckedAt = -Infinity;
  let latestTrack;
  let nowPlaying;
  let history;
  let open = false;
  let intentTimer;
  let closeTimer;
  let hideTimer;
  let positionFrame;

  function loadFeed(stamp) {
    source.src = feed + '&t=' + stamp;
  }

  async function refreshStatus() {
    if (document.hidden || statusPending || performance.now() - statusCheckedAt < 45000) return;
    statusPending = true;
    statusCheckedAt = performance.now();
    try {
      const response = await fetch('https://lastfm-last-played.biancarosa.com.br/aditya-mehta/latest-song', {
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Listening status unavailable');
      const track = (await response.json())?.track;
      const key = track ? track.name + '\n' + track.artist?.['#text'] : '';
      if (latestTrack !== undefined && key !== latestTrack) loadFeed(Date.now());
      latestTrack = key;
      current.hidden = track?.['@attr']?.nowplaying !== 'true';
      nowPlaying = current.hidden ? undefined : { name: track.name, artist: track.artist?.['#text'] || '' };
    } catch {
      current.hidden = true;
      nowPlaying = undefined;
    } finally {
      labelNowPlaying();
      const historyCurrent = history?.querySelector('.listening-current');
      if (historyCurrent) historyCurrent.hidden = current.hidden;
      section.classList.toggle('is-playing', !current.hidden);
      statusPending = false;
    }
  }

  function crop(part, url) {
    const frame = document.createElement('span');
    frame.className = 'listening-' + part;
    const image = new Image();
    image.alt = '';
    image.decoding = 'async';
    image.src = url;
    frame.append(image);
    return frame;
  }

  function row(index, url) {
    const element = document.createElement('span');
    element.className = 'listening-row';
    element.dataset.index = index;
    element.style.setProperty('--track', index);
    element.append(crop('art', url), crop('copy', url));
    return element;
  }

  function labelNowPlaying() {
    for (const first of section.querySelectorAll('.listening-row[data-index="0"]')) {
      const copy = first.querySelector('.listening-copy');
      copy.classList.toggle('is-text', Boolean(nowPlaying));
      copy.replaceChildren();
      if (nowPlaying) {
        const name = document.createElement('span');
        const artist = document.createElement('span');
        name.className = 'listening-track';
        artist.className = 'listening-artist';
        name.textContent = nowPlaying.name;
        artist.textContent = nowPlaying.artist;
        copy.append(name, artist);
      } else {
        copy.append(crop('copy', source.currentSrc || source.src).firstChild);
      }
    }
  }

  function positionHistory() {
    if (!history || !open) return;
    history.classList.toggle('is-single', window.innerWidth < 600);
    const label = heading.getBoundingClientRect();
    const rows = preview.getBoundingClientRect();
    const origin = { top: label.top, left: rows.left, right: Math.max(label.right, rows.right), bottom: rows.bottom };
    const width = history.offsetWidth;
    const height = history.offsetHeight;
    const left = Math.max(8, Math.min(origin.left - inset, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(origin.top - inset, window.innerHeight - height - 8));
    history.style.left = left + 'px';
    history.style.top = top + 'px';
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
    if (history.showPopover && !history.matches(':popover-open')) history.showPopover();
    positionHistory();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (open) history.classList.add('is-open');
    }));
  }

  function closeHistory() {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    if (!history || !open) return;
    open = false;
    history.classList.remove('is-open');
    history.inert = true;
    history.setAttribute('aria-hidden', 'true');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (history.hidePopover && history.matches(':popover-open')) history.hidePopover();
      history.hidden = true;
    }, 240);
  }

  function buildHistory(count, url) {
    const panel = document.createElement('div');
    panel.id = 'listening-history';
    panel.className = 'listening-history';
    panel.setAttribute('popover', 'manual');
    panel.setAttribute('aria-hidden', 'true');
    panel.hidden = true;
    panel.inert = true;
    panel.style.setProperty('--feed-height', source.naturalHeight + 'px');
    const surface = document.createElement('a');
    surface.className = 'history-surface';
    surface.href = preview.href;
    surface.setAttribute('aria-label', 'My latest ' + count + ' tracks on Last.fm');
    const title = heading.cloneNode(true);
    title.classList.add('history-heading');
    title.setAttribute('aria-hidden', 'true');
    surface.append(title);
    for (let start = 0; start < count; start += columnRows) {
      const column = document.createElement('span');
      column.className = 'history-column';
      column.setAttribute('aria-hidden', 'true');
      for (let index = start; index < Math.min(count, start + columnRows); index++) column.append(row(index, url));
      surface.append(column);
    }
    panel.append(surface);
    return panel;
  }

  async function render() {
    const url = source.currentSrc || source.src;
    try {
      await source.decode().catch(() => {});
      const count = source.naturalHeight / feedRowHeight;
      if (source.naturalWidth !== 260 || !Number.isInteger(count) || count < 1) throw new Error('Unexpected feed layout');
      const rows = document.createElement('span');
      rows.className = 'listening-rows';
      rows.setAttribute('aria-hidden', 'true');
      rows.style.setProperty('--feed-height', source.naturalHeight + 'px');
      for (let index = 0; index < Math.min(count, visibleRows); index++) rows.append(row(index, url));
      preview.querySelector('.listening-rows')?.remove();
      preview.append(rows);
      preview.classList.add('is-ready');

      const reopen = open;
      if (history) {
        open = false;
        clearTimeout(hideTimer);
        if (history.hidePopover && history.matches(':popover-open')) history.hidePopover();
        history.remove();
        history = undefined;
      }
      if (count > visibleRows) {
        history = buildHistory(count, url);
        section.append(history);
        if (reopen) openHistory();
      }
      if (nowPlaying) labelNowPlaying();
    } catch {
      if (!preview.classList.contains('is-ready')) section.hidden = true;
    }
  }

  source.addEventListener('load', render);
  source.addEventListener('error', () => {
    if (!preview.classList.contains('is-ready')) section.hidden = true;
  });
  section.addEventListener('pointerenter', event => {
    refreshStatus();
    clearTimeout(closeTimer);
    if (event.pointerType !== 'mouse' || !canHover.matches) return;
    clearTimeout(intentTimer);
    intentTimer = setTimeout(() => openHistory(), open ? 0 : 180);
  });
  section.addEventListener('pointerleave', () => {
    clearTimeout(intentTimer);
    closeTimer = setTimeout(closeHistory, 160);
  });
  document.addEventListener('pointerdown', event => {
    if (open && !section.contains(event.target)) closeHistory();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      const restore = history.contains(document.activeElement);
      closeHistory();
      if (restore) preview.focus({ preventScroll: true });
    }
  });
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, { passive: true });
  loadFeed(Math.floor(Date.now() / 60000));
  refreshStatus();
  setInterval(refreshStatus, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshStatus();
  });
})();
