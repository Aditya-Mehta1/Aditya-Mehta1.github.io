(function() {
  const root = document.documentElement;
  const section = document.querySelector('.listening-section');
  const preview = section.querySelector('.listening-preview');
  const cover = preview.querySelector('.listening-cover');
  const caption = preview.querySelector('.listening-now');
  const earlier = section.querySelector('.listening-earlier');
  const strip = earlier.querySelector('.listening-strip');
  const source = earlier.querySelector('.listening-source');
  const current = section.querySelector('.listening-current');
  const feed = source.dataset.src;
  const canHover = window.matchMedia('(hover: hover)');
  const bayer = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  const feedRowHeight = 56;
  const stripCount = 5;
  const columnRows = 5;
  const inset = 17;
  const haloCell = 2;
  const haloReach = 20;
  const haloShift = 10;
  const haloDensity = .66;
  const retryDelays = [400, 1200, 3000];
  const halo = document.createElement('canvas');
  const disc = document.createElement('span');
  let statusPending = false;
  let statusCheckedAt = -Infinity;
  let latestTrack;
  let nowPlaying;
  let artwork;
  let haloSize = 0;
  let feedReady = false;
  let feedAttempt = 0;
  let history;
  let open = false;
  let intentTimer;
  let closeTimer;
  let hideTimer;
  let positionFrame;
  let tintTimer;

  section.classList.add('is-live');
  halo.className = 'listening-halo';
  disc.className = 'listening-disc';
  cover.append(halo, disc);
  document.querySelectorAll('.wash-phrase, mark').forEach((element, index) => element.style.setProperty('--order', index));

  function loadFeed(stamp) {
    source.src = feed + '&t=' + stamp;
  }

  function linear(channel) {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
  }

  function polar(red, green, blue) {
    const r = linear(red);
    const g = linear(green);
    const b = linear(blue);
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    const lightness = .2104542553 * l + .793617785 * m - .0040720468 * s;
    const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
    const c = .0259040371 * l + .7827717662 * m - .808675766 * s;
    return [lightness, Math.hypot(a, c), Math.atan2(c, a)];
  }

  function palette(image) {
    const size = 24;
    const bins = 24;
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = size;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const weight = new Float64Array(bins);
    const x = new Float64Array(bins);
    const y = new Float64Array(bins);
    const chroma = new Float64Array(bins);
    for (let index = 0; index < size * size; index++) {
      const [lightness, colour, angle] = polar(pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]);
      const share = Math.pow(colour, 1.5) * (lightness > .2 && lightness < .93 ? 1 : .25);
      const bin = Math.floor(((angle / (2 * Math.PI) + 1) % 1) * bins) % bins;
      weight[bin] += share;
      x[bin] += Math.cos(angle) * share;
      y[bin] += Math.sin(angle) * share;
      chroma[bin] += colour * share;
    }
    const spread = bin => weight[bin] + .5 * (weight[(bin + 1) % bins] + weight[(bin + bins - 1) % bins]);
    let best = 0;
    for (let bin = 1; bin < bins; bin++) if (spread(bin) > spread(best)) best = bin;
    if (!weight[best]) return { hue: 0, chroma: 0 };
    return { hue: (Math.atan2(y[best], x[best]) * 180 / Math.PI + 360) % 360, chroma: chroma[best] / weight[best] };
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function tint(image) {
    let colours = { wash: '', accent: '', tone: '' };
    try {
      const { hue, chroma } = palette(image);
      if (chroma > .035) {
        const angle = hue.toFixed(1);
        const lift = .12 * Math.max(0, Math.cos((hue - 100) * Math.PI / 180));
        colours = {
          wash: 'oklch(91% ' + clamp(chroma * .8, .055, .1).toFixed(3) + ' ' + angle + ')',
          accent: 'oklch(' + ((.63 + lift) * 100).toFixed(1) + '% ' + clamp(chroma * 1.2, .12, .19).toFixed(3) + ' ' + angle + ')',
          tone: 'oklch(' + ((.75 + lift * .6) * 100).toFixed(1) + '% ' + clamp(chroma * 1.1, .1, .17).toFixed(3) + ' ' + angle + ')',
        };
      }
    } catch {
      return;
    }
    root.classList.add('is-tinting');
    clearTimeout(tintTimer);
    tintTimer = setTimeout(() => root.classList.remove('is-tinting'), 1200);
    paint(colours);
  }

  function paint(colours) {
    for (const name of ['wash', 'accent', 'tone']) {
      if (colours[name]) root.style.setProperty('--' + name, colours[name]);
      else root.style.removeProperty('--' + name);
    }
    drawHalo(true);
  }

  function drawHalo(force) {
    const size = Math.round(cover.clientWidth);
    if (!size || (!force && size === haloSize)) return;
    haloSize = size;
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const probeContext = probe.getContext('2d', { willReadFrequently: true });
    probeContext.fillStyle = '#767676';
    probeContext.fillStyle = getComputedStyle(root).getPropertyValue('--tone').trim();
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

  function showArtwork(url) {
    if (url === artwork) return;
    artwork = url;
    if (!url) {
      section.classList.add('no-cover');
      return;
    }
    const sizes = [url.replace('/300x300/', '/500x500/'), url];
    const image = new Image();
    image.className = 'listening-artwork';
    image.alt = '';
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      if (artwork !== url) return;
      const previous = cover.querySelectorAll('.listening-artwork');
      cover.append(image);
      section.classList.remove('no-cover');
      section.classList.add('has-cover');
      tint(image);
      requestAnimationFrame(() => requestAnimationFrame(() => image.classList.add('is-shown')));
      setTimeout(() => previous.forEach(element => element.remove()), 300);
    });
    image.addEventListener('error', () => {
      if (artwork !== url) return;
      if (sizes.length) image.src = sizes.shift();
      else if (!section.classList.contains('has-cover')) section.classList.add('no-cover');
    });
    image.src = sizes.shift();
  }

  function showTrack(title, performer, art) {
    const name = document.createElement('span');
    const artist = document.createElement('span');
    name.className = 'listening-track';
    artist.className = 'listening-artist';
    name.textContent = title;
    artist.textContent = performer;
    caption.replaceChildren(name, artist);
    showArtwork(art);
  }

  async function latestSong() {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch('https://lastfm-last-played.biancarosa.com.br/aditya-mehta/latest-song', {
          credentials: 'omit', cache: 'no-store', priority: 'high', signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Listening status unavailable');
        const track = (await response.json())?.track;
        if (!track?.name) throw new Error('Listening status unavailable');
        return track;
      } catch (error) {
        if (attempt === retryDelays.length) throw error;
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
    }
  }

  async function refreshStatus() {
    if (document.hidden || statusPending || performance.now() - statusCheckedAt < 45000) return;
    statusPending = true;
    statusCheckedAt = performance.now();
    try {
      const track = await latestSong();
      const artist = track.artist?.['#text'] || '';
      const art = track.image?.find(image => image.size === 'extralarge')?.['#text'] || '';
      const key = track.name + '\n' + artist;
      if (latestTrack !== undefined && key !== latestTrack) loadFeed(Date.now());
      latestTrack = key;
      current.hidden = track['@attr']?.nowplaying !== 'true';
      nowPlaying = current.hidden ? undefined : { name: track.name, artist };
      showTrack(track.name, artist, art);
    } catch {
      current.hidden = true;
      nowPlaying = undefined;
      if (!section.classList.contains('has-cover')) section.classList.add('no-cover');
    } finally {
      labelNowPlaying();
      section.classList.toggle('is-playing', !current.hidden);
      statusPending = false;
      reveal();
    }
  }

  function reveal() {
    const empty = section.classList.contains('no-cover') && !feedReady;
    section.hidden = empty && source.dataset.failed === 'true';
    const linked = section.classList.contains('no-cover');
    strip.tabIndex = linked ? 0 : -1;
    if (linked) {
      strip.removeAttribute('aria-hidden');
      strip.setAttribute('aria-label', preview.getAttribute('aria-label'));
    } else {
      strip.setAttribute('aria-hidden', 'true');
      strip.removeAttribute('aria-label');
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

  function row(index, url, parts) {
    const element = document.createElement('span');
    element.className = 'listening-row';
    element.dataset.index = index;
    element.style.setProperty('--track', index);
    element.append(...parts.map(part => crop(part, url)));
    return element;
  }

  function labelNowPlaying() {
    const first = history?.querySelector('.listening-row[data-index="0"]');
    if (!first) return;
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

  function positionHistory() {
    if (!history || !open) return;
    history.classList.toggle('is-single', window.innerWidth < 600);
    const origin = strip.getBoundingClientRect();
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
    }, 200);
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
    for (let start = 0; start < count; start += columnRows) {
      const column = document.createElement('span');
      column.className = 'history-column';
      column.setAttribute('aria-hidden', 'true');
      for (let index = start; index < Math.min(count, start + columnRows); index++) column.append(row(index, url, ['art', 'copy']));
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
      strip.style.setProperty('--feed-height', source.naturalHeight + 'px');
      strip.replaceChildren();
      for (let index = 0; index < Math.min(count, stripCount); index++) strip.append(row(index, url, ['art']));
      feedReady = true;
      feedAttempt = 0;
      delete source.dataset.failed;
      section.classList.add('has-feed');

      const reopen = open;
      if (history) {
        open = false;
        clearTimeout(hideTimer);
        if (history.hidePopover && history.matches(':popover-open')) history.hidePopover();
        history.remove();
        history = undefined;
      }
      if (count > 1) {
        history = buildHistory(count, url);
        earlier.append(history);
        if (reopen) openHistory();
      }
      if (nowPlaying) labelNowPlaying();
    } catch {
      feedFailed();
    }
    reveal();
  }

  function feedFailed() {
    if (feedAttempt < retryDelays.length) {
      setTimeout(() => loadFeed(Date.now()), retryDelays[feedAttempt++]);
      return;
    }
    if (!feedReady) source.dataset.failed = 'true';
    reveal();
  }

  source.addEventListener('load', render);
  source.addEventListener('error', feedFailed);
  section.addEventListener('pointerenter', refreshStatus);
  earlier.addEventListener('pointerenter', event => {
    clearTimeout(closeTimer);
    if (event.pointerType !== 'mouse' || !canHover.matches) return;
    clearTimeout(intentTimer);
    intentTimer = setTimeout(() => openHistory(), open ? 0 : 100);
  });
  earlier.addEventListener('pointerleave', () => {
    clearTimeout(intentTimer);
    closeTimer = setTimeout(closeHistory, 160);
  });
  document.addEventListener('pointerdown', event => {
    if (open && !earlier.contains(event.target)) closeHistory();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) closeHistory();
  });
  window.addEventListener('resize', () => {
    drawHalo(false);
    schedulePosition();
  });
  window.addEventListener('scroll', schedulePosition, { passive: true });
  drawHalo(true);
  loadFeed(Math.floor(Date.now() / 60000));
  refreshStatus();
  setInterval(refreshStatus, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshStatus();
  });
})();
