/**
 * Lightbulb: (1) When any icon is on top of the lightbulb → dark mode; else light.
 * (2) When the lightbulb is snapped to another icon, put the lightbulb underneath (lower z-index).
 * Does not modify draggable/snap logic.
 */
(function () {
  const OVERLAP_PX = 50;
  const Z_ABOVE = 10;
  const Z_UNDERNEATH = 5;

  function getCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** True if icon center is within OVERLAP_PX of lightbulb center (icon on top of lightbulb). */
  function isOnLightbulb(iconEl, lightbulbEl) {
    if (iconEl.classList.contains('icon-vanished')) return false;
    return distance(getCenter(iconEl), getCenter(lightbulbEl)) < OVERLAP_PX;
  }

  /** True if lightbulb center is within OVERLAP_PX of another icon (lightbulb snapped to that icon). */
  function isLightbulbSnappedToIcon(lightbulbEl) {
    const others = document.querySelectorAll('.draggable-icon-wrapper:not(.draggable-icon-lightbulb)');
    const lbCenter = getCenter(lightbulbEl);
    for (const w of others) {
      if (w.classList.contains('icon-vanished')) continue;
      if (distance(lbCenter, getCenter(w)) < OVERLAP_PX) return true;
    }
    return false;
  }

  /** Put lightbulb underneath other icons when snapped to one; otherwise restore z-index. */
  function updateLightbulbZIndex(lightbulb) {
    lightbulb.style.zIndex = isLightbulbSnappedToIcon(lightbulb) ? String(Z_UNDERNEATH) : String(Z_ABOVE);
  }

  let lastAnyOn = null;

  function tick() {
    const lightbulb = document.querySelector('.draggable-icon-lightbulb');
    if (!lightbulb) {
      requestAnimationFrame(tick);
      return;
    }
    if (lightbulb.classList.contains('icon-vanished')) {
      if (lastAnyOn !== false) {
        lastAnyOn = false;
        if (typeof window.applyTheme === 'function') window.applyTheme('light');
      }
      requestAnimationFrame(tick);
      return;
    }

    updateLightbulbZIndex(lightbulb);

    const others = document.querySelectorAll('.draggable-icon-wrapper:not(.draggable-icon-lightbulb)');
    let anyOn = false;
    for (const w of others) {
      if (isOnLightbulb(w, lightbulb)) {
        anyOn = true;
        break;
      }
    }
    if (lastAnyOn !== anyOn && typeof window.applyTheme === 'function') {
      lastAnyOn = anyOn;
      window.applyTheme(anyOn ? 'dark' : 'light');
    }
    requestAnimationFrame(tick);
  }

  function startWhenReady() {
    if (document.querySelector('.draggable-icon-lightbulb')) {
      tick();
      return;
    }
    requestAnimationFrame(startWhenReady);
  }

  document.addEventListener('DOMContentLoaded', startWhenReady);
})();
