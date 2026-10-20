(function() {
  const section = document.querySelector('.listening-section');
  const preview = section.querySelector('.listening-preview');
  const source = preview.querySelector('.listening-source');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = window.matchMedia('(hover: hover)');
  let disclosure;
  let history;
  let open = false;
  let pinned = false;
  let dismissed = false;
  let restoringFocus = false;
  let intentTimer;
  let closeTimer;
  let hideTimer;
  let revealFrame;
  let positionFrame;
  let generation = 0;
  let waitingToOpen = false;
  const current = section.querySelector('.listening-current');
  let statusPending = false;
  let statusCheckedAt = -Infinity;

  async function refreshStatus() {
    if (document.hidden || statusPending || performance.now() - statusCheckedAt < 45000) return;
    statusPending = true;
    statusCheckedAt = performance.now();
    try {
      const response = await fetch('https://lastfm-last-played.biancarosa.com.br/aditya-mehta/latest-song', {
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Listening status unavailable');
      const data = await response.json();
      current.hidden = data?.track?.['@attr']?.nowplaying !== 'true';
    } catch {
      current.hidden = true;
    } finally {
      statusPending = false;
    }
  }

  preview.classList.add('is-pending');

  function makeRows(indices, url, height, images) {
    const rows = document.createElement('span');
    rows.className = 'listening-crops';
    rows.setAttribute('aria-hidden', 'true');
    rows.style.setProperty('--feed-height', height + 'px');
    rows.style.setProperty('--art-feed-height', height * 1.625 + 'px');
    for (const index of indices) {
      const row = document.createElement('span');
      row.className = 'listening-crop-row';
      row.style.setProperty('--track', index);
      for (const part of ['art', 'copy']) {
        const crop = document.createElement('span');
        crop.className = 'listening-crop-' + part;
        const image = new Image();
        image.alt = '';
        image.decoding = 'async';
        image.src = url;
        images.push(image);
        crop.append(image);
        row.append(crop);
      }
      rows.append(row);
    }
    return rows;
  }

  function positionHistory() {
    if (!history || history.hidden) return;
    const origin = preview.getBoundingClientRect();
    const column = Math.max(244, Math.min(260, origin.width));
    const wide = Number(history.dataset.count) > 5 && window.innerWidth >= column * 2 + 76;
    const width = wide ? column * 2 + 52 : column + 32;
    history.classList.toggle('is-single', !wide);
    history.style.width = width + 'px';
    history.style.setProperty('--column-width', column + 'px');
    const height = history.offsetHeight;
    const left = Math.max(12, Math.min(origin.right + 16 - width, window.innerWidth - width - 12));
    const top = Math.max(12, Math.min(origin.top - 16, window.innerHeight - height - 12));
    history.style.left = left + 'px';
    history.style.top = top + 'px';
    const inset = [origin.top - top, left + width - origin.right, top + height - origin.bottom, origin.left - left];
    history.style.setProperty('--collection-origin', inset.map(value => Math.max(0, value) + 'px').join(' '));
  }

  function openHistory(pin = false) {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    waitingToOpen = true;
    if (!history) return;
    pinned = pinned || pin;
    if (open) return;
    clearTimeout(hideTimer);
    open = true;
    history.hidden = false;
    history.inert = false;
    history.setAttribute('aria-hidden', 'false');
    if (history.showPopover && !history.matches(':popover-open')) history.showPopover();
    positionHistory();
    disclosure.setAttribute('aria-expanded', 'true');
    revealFrame = requestAnimationFrame(() => history.classList.add('is-open'));
  }

  function closeHistory(restore = false) {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    cancelAnimationFrame(revealFrame);
    waitingToOpen = false;
    if (!history) return;
    open = false;
    pinned = false;
    history.classList.remove('is-open');
    history.setAttribute('aria-hidden', 'true');
    disclosure.setAttribute('aria-expanded', 'false');
    if (restore && history.contains(document.activeElement)) {
      restoringFocus = true;
      disclosure.focus({ preventScroll: true });
      restoringFocus = false;
    }
    history.inert = true;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (history.hidePopover && history.matches(':popover-open')) history.hidePopover();
      history.hidden = true;
    }, reducedMotion.matches ? 0 : 200);
  }

  function clearHistory() {
    closeHistory();
    clearTimeout(hideTimer);
    if (history) history.remove();
    history = undefined;
    if (disclosure) {
      const label = document.createElement('p');
      label.className = 'listening-label';
      label.textContent = 'listening to';
      disclosure.replaceWith(label);
      disclosure = undefined;
    }
    preview.querySelectorAll('.listening-crops').forEach(crops => crops.remove());
  }

  async function prepareListening() {
    const version = ++generation;
    const url = source.src;
    try {
      await source.decode();
      if (version !== generation || url !== source.src) return;
      const count = source.naturalHeight / 56;
      source.hidden = false;
      preview.classList.add('is-loaded');
      if (source.naturalWidth !== 260 || !Number.isInteger(count) || count < 3 || count > 10) {
        source.hidden = true;
        preview.classList.remove('is-loaded', 'is-enhanced');
        clearHistory();
        return;
      }
      const images = [];
      const compact = makeRows([0, 1, 2], url, source.naturalHeight, images);
      const expanded = document.createElement('section');
      expanded.id = 'listening-history';
      expanded.className = 'listening-history';
      expanded.dataset.count = count;
      expanded.setAttribute('popover', 'manual');
      expanded.setAttribute('aria-label', 'Listening history from Last.fm');
      expanded.setAttribute('aria-hidden', 'true');
      expanded.hidden = true;
      expanded.inert = true;
      expanded.innerHTML = '<div class="history-surface"><a class="history-tracks"><span class="history-column history-newest"></span><span class="history-column history-older"></span></a><div class="history-footer"><button type="button" class="history-close">Close</button></div></div>';
      const tracks = expanded.querySelector('.history-tracks');
      tracks.href = preview.href;
      tracks.setAttribute('aria-label', 'View my latest ' + count + ' tracks on Last.fm');
      expanded.querySelector('.history-newest').append(makeRows(Array.from({ length: Math.min(5, count) }, (_, index) => index), url, source.naturalHeight, images));
      expanded.querySelector('.history-older').append(makeRows(Array.from({ length: Math.max(0, count - 5) }, (_, index) => index + 5), url, source.naturalHeight, images));
      await Promise.all(images.map(image => image.decode()));
      if (version !== generation || url !== source.src) return;
      if (images.some(image => image.naturalWidth !== 260 || image.naturalHeight !== source.naturalHeight)) return;
      const reopen = open || (waitingToOpen && !dismissed && (section.matches(':hover') || section.contains(document.activeElement)));
      const wasPinned = pinned;
      const scrollTop = history?.querySelector('.history-tracks').scrollTop || 0;
      const focusedControl = history?.contains(document.activeElement) ? document.activeElement.className : '';
      closeHistory();
      clearTimeout(hideTimer);
      if (history) history.remove();
      history = expanded;
      if (!disclosure) {
        disclosure = document.createElement('button');
        disclosure.type = 'button';
        disclosure.className = 'listening-label';
        disclosure.textContent = 'listening to';
        disclosure.setAttribute('aria-label', 'Show listening history from Last.fm');
        disclosure.setAttribute('aria-controls', 'listening-history');
        disclosure.setAttribute('aria-expanded', 'false');
        section.querySelector('.listening-label').replaceWith(disclosure);
        disclosure.addEventListener('click', () => {
          if (open && pinned) {
            dismissed = true;
            closeHistory();
          } else {
            dismissed = false;
            openHistory(true);
          }
        });
      }
      history.querySelector('.history-close').addEventListener('click', () => {
        dismissed = true;
        closeHistory(true);
      });
      preview.querySelectorAll('.listening-crops').forEach(previous => previous.remove());
      preview.append(compact);
      preview.classList.add('is-enhanced');
      section.append(history);
      if (reopen) {
        openHistory(wasPinned);
        tracks.scrollTop = scrollTop;
        if (focusedControl === 'history-tracks' || focusedControl === 'history-close') {
          history.querySelector('.' + focusedControl).focus({ preventScroll: true });
        }
      }
    } catch {
      if (version !== generation || url !== source.src) return;
      source.hidden = true;
      preview.classList.remove('is-loaded', 'is-enhanced');
      clearHistory();
    } finally {
      if (version === generation) preview.classList.remove('is-pending');
    }
  }

  section.addEventListener('pointerenter', event => {
    refreshStatus();
    clearTimeout(closeTimer);
    if (event.pointerType !== 'mouse' || !canHover.matches) return;
    dismissed = false;
    clearTimeout(intentTimer);
    intentTimer = setTimeout(() => openHistory(), history && !history.hidden ? 0 : 180);
  });
  section.addEventListener('pointerleave', () => {
    clearTimeout(intentTimer);
    if (!pinned && !section.contains(document.activeElement)) closeTimer = setTimeout(() => closeHistory(), 140);
  });
  section.addEventListener('focusin', () => {
    clearTimeout(closeTimer);
    if (restoringFocus) return;
    dismissed = false;
    openHistory();
  });
  section.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (!section.contains(document.activeElement) && (!section.matches(':hover') || dismissed)) closeHistory();
    });
  });
  document.addEventListener('pointerdown', event => {
    if (!section.contains(event.target)) closeHistory();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      dismissed = true;
      closeHistory(true);
    }
  });
  function schedulePosition() {
    if (!open || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionHistory();
      positionFrame = 0;
    });
  }
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, { passive: true });
  source.addEventListener('load', prepareListening);
  source.addEventListener('error', prepareListening);
  if (source.complete) prepareListening();
  refreshStatus();
  setInterval(refreshStatus, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshStatus();
  });
})();
