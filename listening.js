(function() {
  const root = document.documentElement;
  const section = document.querySelector('.listening-section');
  const preview = section.querySelector('.listening-preview');
  const cover = preview.querySelector('.listening-cover');
  const caption = preview.querySelector('.listening-now');
  const earlier = section.querySelector('.listening-earlier');
  const strip = earlier.querySelector('.listening-strip');
  const current = section.querySelector('.listening-current');
  const endpoint = 'https://ps-website-helper.track-aditya-mehta.workers.dev/api/listening';
  const canHover = window.matchMedia('(hover: hover)');
  const bayer = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  const stripCount = 5;
  const columnRows = 5;
  const inset = 17;
  const haloCell = 2;
  const haloReach = 20;
  const haloShift = 10;
  const haloDensity = .66;
  const halo = document.createElement('canvas');
  const disc = document.createElement('span');
  let statusPending = false;
  let statusCheckedAt = -Infinity;
  let artwork;
  let haloSize = 0;
  let tracks = [];
  let nextPage = null;
  let paging = false;
  let blockedUntil = 0;
  let retryTimer;
  let staleTimer;
  let surface;
  let more;
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

  async function getPage(page) {
    if (Date.now() < blockedUntil) throw new Error('More history available in a minute');
    const response = await fetch(endpoint + '?page=' + page, {
      credentials: 'omit', signal: AbortSignal.timeout(7000),
    });
    if (response.status === 429) {
      const seconds = Math.max(1, Math.min(300, Number(response.headers.get('Retry-After')) || 60));
      blockedUntil = Date.now() + seconds * 1000;
      throw new Error('More history available in a minute');
    }
    if (!response.ok) throw new Error('Could not load history. Try again');
    const data = await response.json();
    if (data.page !== page || !Array.isArray(data.tracks) || data.tracks.length > 11
      || (data.nextPage !== null && (data.nextPage !== page + 1 || data.nextPage > 10))) {
      throw new Error('Listening history unavailable');
    }
    return data;
  }

  async function refreshStatus() {
    if (document.hidden || open || paging || statusPending || performance.now() - statusCheckedAt < 60000) return;
    statusPending = true;
    statusCheckedAt = performance.now();
    try {
      const data = await getPage(1);
      if (open || paging) return;
      const track = data.tracks[0];
      current.hidden = !track?.nowPlaying || Date.now() - Date.parse(data.fetchedAt) > 120000;
      clearTimeout(staleTimer);
      if (!current.hidden) {
        staleTimer = setTimeout(() => {
          current.hidden = true;
          section.classList.remove('is-playing');
        }, Math.max(0, 120000 - (Date.now() - Date.parse(data.fetchedAt))));
      }
      if (track) showTrack(track.name, track.artist, track.image);
      strip.replaceChildren(...data.tracks.slice(0, stripCount).map((track, index) => row(track, index, false)));
      tracks = [];
      nextPage = data.nextPage;
      buildHistory();
      appendTracks(data.tracks);
      section.hidden = data.tracks.length === 0;
    } catch {
      current.hidden = true;
      if (!tracks.length) section.hidden = true;
    } finally {
      section.classList.toggle('is-playing', !current.hidden);
      statusPending = false;
    }
  }

  function row(track, index, linked) {
    const element = document.createElement(linked ? 'a' : 'span');
    element.className = 'listening-row';
    element.dataset.index = index;
    if (linked) element.href = track.url || preview.href;
    const art = document.createElement('span');
    art.className = 'listening-art';
    if (track.image) {
      const image = new Image();
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = track.image;
      image.addEventListener('error', () => { image.hidden = true; });
      art.append(image);
    }
    element.append(art);
    if (linked) {
      const copy = document.createElement('span');
      copy.className = 'listening-copy';
      const name = document.createElement('span');
      const artist = document.createElement('span');
      name.className = 'listening-track';
      artist.className = 'listening-artist';
      name.textContent = track.name;
      artist.textContent = track.artist;
      copy.append(name, artist);
      element.append(copy);
    }
    return element;
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
    strip.setAttribute('aria-expanded', 'true');
    if (history.showPopover && !history.matches(':popover-open')) history.showPopover();
    positionHistory();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (open) {
        history.classList.add('is-open');
        if (surface.scrollHeight <= surface.clientHeight + 48) loadMore();
      }
    }));
  }

  function closeHistory() {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    if (!history || !open) return;
    open = false;
    history.classList.remove('is-open');
    strip.setAttribute('aria-expanded', 'false');
    if (history.contains(document.activeElement)) strip.focus({ preventScroll: true });
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
    more = document.createElement('button');
    more.type = 'button';
    more.className = 'listening-more';
    more.setAttribute('aria-live', 'polite');
    more.textContent = 'Load more';
    more.addEventListener('click', loadMore);
    surface.addEventListener('scroll', () => {
      if (surface.scrollTop > 0 && surface.scrollTop + surface.clientHeight >= surface.scrollHeight - 48) loadMore();
    }, { passive: true });
    surface.append(more);
    history.append(surface);
    earlier.append(history);
  }

  function appendTracks(incoming) {
    const seen = new Set(tracks.map(track => JSON.stringify([track.playedAt, track.name, track.artist])));
    const added = incoming.filter(track => {
      if (track.nowPlaying) return false;
      const key = JSON.stringify([track.playedAt, track.name, track.artist]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (let start = 0; start < added.length; start += columnRows) {
      const column = document.createElement('div');
      column.className = 'history-column';
      for (let index = start; index < Math.min(added.length, start + columnRows); index++) {
        column.append(row(added[index], tracks.length + index, true));
      }
      surface.insertBefore(column, more);
    }
    tracks.push(...added);
    more.hidden = nextPage === null;
    if (nextPage === null) {
      const end = document.createElement('p');
      end.className = 'listening-end';
      end.textContent = tracks.length ? 'End of recent history' : 'No recent plays';
      surface.append(end);
    }
    schedulePosition();
  }

  async function loadMore() {
    if (!open || paging || more.disabled || nextPage === null) return;
    paging = true;
    more.disabled = true;
    more.textContent = 'Loading…';
    try {
      const data = await getPage(nextPage);
      nextPage = data.nextPage;
      appendTracks(data.tracks);
      more.textContent = 'Load more';
    } catch (error) {
      more.textContent = error.message;
    } finally {
      paging = false;
      more.disabled = Date.now() < blockedUntil;
      if (more.disabled) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          more.disabled = false;
          more.textContent = 'Load more';
        }, blockedUntil - Date.now());
      }
    }
  }

  section.addEventListener('pointerenter', refreshStatus);
  strip.addEventListener('click', () => {
    if (!open) openHistory();
  });
  earlier.addEventListener('pointerenter', event => {
    clearTimeout(closeTimer);
    if (event.pointerType !== 'mouse' || !canHover.matches) return;
    clearTimeout(intentTimer);
    intentTimer = setTimeout(openHistory, 100);
  });
  earlier.addEventListener('pointerleave', event => {
    clearTimeout(intentTimer);
    if (event.pointerType === 'mouse' && !earlier.contains(document.activeElement)) {
      closeTimer = setTimeout(closeHistory, 160);
    }
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
  refreshStatus();
  setInterval(refreshStatus, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshStatus();
  });
})();
