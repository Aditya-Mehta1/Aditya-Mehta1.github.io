(function() {
  const trigger = document.querySelector('a[href="https://x.com/anvisha/status/2077086289954771038"]');
  const group = trigger && trigger.closest('.bio-group');
  const item = trigger && trigger.closest('li');
  if (!group || !item || group.querySelector('.launch-preview-space')) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = window.matchMedia('(hover: hover)');
  const space = document.createElement('div');
  space.className = 'launch-preview-space';
  space.setAttribute('aria-hidden', 'true');
  space.innerHTML = '<span class="launch-preview-measure"><span class="launch-preview-spacer"><span class="launch-preview-size"></span></span></span>';
  item.append(space);

  const panel = document.createElement('a');
  panel.id = 'launch-preview';
  panel.className = 'launch-preview';
  panel.href = trigger.href;
  panel.setAttribute('aria-label', 'Watch the Layerize launch on X');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;

  const poster = document.createElement('img');
  poster.className = 'launch-preview-poster';
  poster.alt = '';
  poster.width = 640;
  poster.height = 360;

  const video = document.createElement('video');
  video.className = 'launch-preview-video';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'none';
  video.width = 640;
  video.height = 360;
  video.setAttribute('aria-hidden', 'true');
  panel.append(poster, video);
  trigger.after(panel);
  trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-expanded', 'false');

  let open = false;
  let dismissed = false;
  let restoringFocus = false;
  let prepared = false;
  let closedAt = -Infinity;
  let intentTimer;
  let closeTimer;
  let positionFrame;

  function hasPreviewFocus() {
    return document.activeElement === trigger || panel.contains(document.activeElement);
  }

  function positionPreview() {
    const bounds = space.getBoundingClientRect();
    const height = bounds.width * 9 / 16;
    panel.style.left = bounds.left + 'px';
    panel.style.top = bounds.top + 8 + 'px';
    panel.style.width = bounds.width + 'px';
    panel.style.height = height + 'px';
    panel.style.setProperty('--launch-clip', Math.max(0, height - Math.max(0, bounds.height - 8)) + 'px');
  }

  function schedulePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      positionPreview();
    });
  }

  function syncPlayback() {
    if (open && !document.hidden && !reducedMotion.matches && !video.hidden) {
      video.muted = true;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function openPreview() {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    if (open) {
      syncPlayback();
      return;
    }
    open = true;
    if (!prepared || video.error) {
      prepared = true;
      video.hidden = false;
      poster.src = 'images/layerize-launch.jpg';
      video.preload = reducedMotion.matches ? 'metadata' : 'auto';
      video.poster = poster.src;
      video.src = 'videos/layerize-launch.mp4';
      video.load();
    }
    positionPreview();
    group.classList.add('is-launch-open');
    panel.inert = false;
    panel.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    syncPlayback();
  }

  function closePreview(restore = false) {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    if (open) closedAt = performance.now();
    open = false;
    video.pause();
    if (restore && panel.contains(document.activeElement)) {
      restoringFocus = true;
      trigger.focus({ preventScroll: true });
      restoringFocus = false;
    }
    group.classList.remove('is-launch-open');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || !canHover.matches || dismissed) return;
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    intentTimer = setTimeout(openPreview, performance.now() - closedAt < 500 ? 0 : 160);
  });
  trigger.addEventListener('pointerleave', () => {
    if (!open) clearTimeout(intentTimer);
  });
  group.addEventListener('pointerenter', () => {
    dismissed = false;
    clearTimeout(closeTimer);
  });
  group.addEventListener('pointerleave', () => {
    clearTimeout(intentTimer);
    clearTimeout(closeTimer);
    if (!hasPreviewFocus()) closeTimer = setTimeout(() => closePreview(), 140);
  });
  group.addEventListener('focusin', event => {
    if (restoringFocus) return;
    if (event.target === trigger || panel.contains(event.target)) {
      dismissed = false;
      openPreview();
    }
  });
  group.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (!hasPreviewFocus() && (!group.matches(':hover') || dismissed)) closePreview();
    });
  });
  document.addEventListener('pointerdown', event => {
    if (!trigger.contains(event.target) && !panel.contains(event.target)) {
      dismissed = true;
      closePreview();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      dismissed = true;
      closePreview(true);
    }
  });
  video.addEventListener('play', () => {
    if (!open) video.pause();
  });
  video.addEventListener('error', () => {
    video.hidden = true;
  });
  reducedMotion.addEventListener('change', syncPlayback);
  document.addEventListener('visibilitychange', syncPlayback);
  window.addEventListener('pageshow', syncPlayback);
  window.addEventListener('pagehide', () => video.pause());
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, { passive: true });
  const layoutObserver = new ResizeObserver(positionPreview);
  layoutObserver.observe(space);
  layoutObserver.observe(group.closest('.bio'));
  positionPreview();
})();
