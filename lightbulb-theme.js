/**
 * Lightbulb theme: when any draggable icon is on top of the lightbulb, use dark mode;
 * when no icon is on top, use light mode. Does not modify draggable logic.
 */
(function () {
  const OVERLAP_PX = 50;

  function getCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function isOnLightbulb(iconEl, lightbulbEl) {
    if (iconEl.classList.contains('icon-vanished')) return false;
    const a = getCenter(iconEl);
    const b = getCenter(lightbulbEl);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    return dist < OVERLAP_PX;
  }

  let lastAnyOn = null;

  function checkLightbulbTheme() {
    const lightbulb = document.querySelector('.draggable-icon-lightbulb');
    if (!lightbulb) {
      requestAnimationFrame(checkLightbulbTheme);
      return;
    }
    if (lightbulb.classList.contains('icon-vanished')) {
      if (lastAnyOn !== false) {
        lastAnyOn = false;
        if (typeof window.applyTheme === 'function') window.applyTheme('light');
      }
      requestAnimationFrame(checkLightbulbTheme);
      return;
    }
    const wrappers = document.querySelectorAll('.draggable-icon-wrapper:not(.draggable-icon-lightbulb)');
    let anyOn = false;
    for (const w of wrappers) {
      if (isOnLightbulb(w, lightbulb)) {
        anyOn = true;
        break;
      }
    }
    if (lastAnyOn !== anyOn && typeof window.applyTheme === 'function') {
      lastAnyOn = anyOn;
      window.applyTheme(anyOn ? 'dark' : 'light');
    }
    requestAnimationFrame(checkLightbulbTheme);
  }

  function startWhenReady() {
    if (document.querySelector('.draggable-icon-lightbulb')) {
      checkLightbulbTheme();
      return;
    }
    requestAnimationFrame(startWhenReady);
  }

  document.addEventListener('DOMContentLoaded', startWhenReady);
})();
