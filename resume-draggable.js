/**
 * Makes the resume, Acrobat, and bin icons draggable (anime.js 4).
 * When close enough to another icon, animate centers into alignment. No magnetic force.
 *
 * SPA requirement: this module must be loaded globally in the base layout <head> of every
 * entry-point HTML (not inside #content). Scripts inserted via innerHTML are not executed,
 * so if this were only in the home fragment it would never run after AJAX navigation.
 * Loaded once, it listens for contentLoaded and re-inits when home content appears.
 */
import { createScope, createDraggable, animate } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

const SNAP_RADIUS = 1670;
/** Below this distance we animate centers into alignment. */
const SNAP_LOCK_PX = 42.0;
/** Min ms between opening the resume PDF (only when resume is thrown into Acrobat). */
const PDF_OPEN_COOLDOWN_MS = 10000;

let isSnapping = false;
let lastPdfOpenTime = 0;
/** Number of icons destroyed by the bin (Resume + Acrobat = 2 max). */
let binDestroyCount = 0;

/** Container-relative base position for each icon, captured once at init. */
const basePositions = new WeakMap();

function getBasePosition(el, container) {
  let base = basePositions.get(el);
  if (base) return base;

  const cr = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();

  base = {
    left: r.left - cr.left,
    top: r.top - cr.top,
  };

  basePositions.set(el, base);
  return base;
}

function isBin(wrapper) {
  return wrapper.classList.contains('draggable-icon-bin');
}
function isAcrobat(wrapper) {
  return wrapper.classList.contains('draggable-icon-adobe');
}
function isResume(wrapper) {
  return wrapper.classList.contains('draggable-icon-resume');
}

/**
 * Update the bin icon image based on how many items have been destroyed (1 → half empty, 2 → full).
 */
function updateBinImage(binWrapper) {
  const img = binWrapper?.querySelector('.resume-button-img');
  if (!img) return;
  if (binDestroyCount >= 2) {
    img.src = 'assets/binfull.png';
  } else if (binDestroyCount >= 1) {
    img.src = 'assets/binhalfempty.png';
  }
}

/**
 * When two icons have aligned: bin + anything → other vanishes; Acrobat + Resume → open PDF in new tab.
 */
function runAlignedBehaviors(draggedEl, targetEl) {
  if (isBin(draggedEl)) {
    targetEl.classList.add('icon-vanished');
    binDestroyCount++;
    updateBinImage(draggedEl);
    return;
  }
  if (isBin(targetEl)) {
    draggedEl.classList.add('icon-vanished');
    binDestroyCount++;
    updateBinImage(targetEl);
    return;
  }
  if (isResume(draggedEl) && isAcrobat(targetEl)) {
    const now = Date.now();
    if (now - lastPdfOpenTime >= PDF_OPEN_COOLDOWN_MS) {
      lastPdfOpenTime = now;
      const href = draggedEl.getAttribute('data-resume-href');
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    }
  }
}

/**
 * Animate the dragged icon so its center matches the target center.
 * Uses DOM rects for real visual positions. Syncs draggable x/y during animation.
 */
function alignCenters(d, draggedEl, targetEl, container) {
  const cr = container.getBoundingClientRect();
  const dragRect = draggedEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const dragCenterX = dragRect.left - cr.left + dragRect.width / 2;
  const dragCenterY = dragRect.top - cr.top + dragRect.height / 2;
  const targetCenterX = targetRect.left - cr.left + targetRect.width / 2;
  const targetCenterY = targetRect.top - cr.top + targetRect.height / 2;
  const dx = targetCenterX - dragCenterX;
  const dy = targetCenterY - dragCenterY;

  d.velocityX = 0;
  d.velocityY = 0;

  const endX = d.x + dx;
  const endY = d.y + dy;
  const state = { x: d.x, y: d.y };

  animate(state, {
    x: endX,
    y: endY,
    duration: 250,
    ease: 'out(2)',
    onUpdate() {
      d.setX(state.x, false);
      d.setY(state.y, false);
    },
    onComplete() {
      d.setX(endX, false);
      d.setY(endY, false);
      runAlignedBehaviors(draggedEl, targetEl);
    },
  });
}

function checkSnap(draggableInstance, draggedEl, allWrappers, container, wrapperToDraggable) {
  const base = getBasePosition(draggedEl, container);
  const dragW = draggedEl.offsetWidth;
  const dragH = draggedEl.offsetHeight;
  const dragCenterX = base.left + draggableInstance.x + dragW / 2;
  const dragCenterY = base.top + draggableInstance.y + dragH / 2;

  if (draggedEl.classList.contains('icon-vanished')) return;

  let closestTarget = null;
  let closestDist = SNAP_RADIUS;

  for (const target of allWrappers) {
    if (target === draggedEl || target.classList.contains('icon-vanished')) continue;
    const targetBase = getBasePosition(target, container);
    const targetD = wrapperToDraggable.get(target);
    const targetX = targetD ? targetD.x : 0;
    const targetY = targetD ? targetD.y : 0;
    const targetCenterX = targetBase.left + targetX + target.offsetWidth / 2;
    const targetCenterY = targetBase.top + targetY + target.offsetHeight / 2;
    const dx = targetCenterX - dragCenterX;
    const dy = targetCenterY - dragCenterY;
    const distance = Math.hypot(dx, dy);
    if (distance < closestDist) {
      closestDist = distance;
      closestTarget = target;
    }
  }

  if (closestTarget && closestDist < SNAP_LOCK_PX && !isSnapping) {
    isSnapping = true;
    alignCenters(draggableInstance, draggedEl, closestTarget, container);
    setTimeout(() => { isSnapping = false; }, 300);
  }
}

function initResumeScope() {
  if (document.querySelector('.draggable-icon-wrapper[data-initialized]')) return;

  const wrappers = Array.from(document.querySelectorAll('.draggable-icon-wrapper'));
  if (!wrappers.length) return;

  const container = document.querySelector('.resume-drag-container') || document.body;
  console.log('[Magnetic snap] Ready. Icons:', wrappers.length, '| Snap radius:', SNAP_RADIUS, 'px');

  wrappers.forEach((el) => getBasePosition(el, container));

  const wrapperToDraggable = new Map();

  createScope({
    defaults: { ease: 'linear' },
  }).add(() => {
    wrappers.forEach((el) => {
      el.dataset.initialized = 'true';
      el.classList.add('draggable');
      const d = createDraggable(el, {
        container,
        containerFriction: 0.35,
        onDrag: () => checkSnap(d, el, wrappers, container, wrapperToDraggable),
        onUpdate: () => checkSnap(d, el, wrappers, container, wrapperToDraggable),
      });
      wrapperToDraggable.set(el, d);
    });
    return () => wrappers.forEach((el) => el.classList.remove('draggable'));
  });
}

document.addEventListener('contentLoaded', (e) => {
  const url = e.detail?.url ?? location.href;
  const isHome = !url.includes('applications');

  if (isHome) {
    initResumeScope();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.draggable-icon-wrapper')) {
    initResumeScope();
  }
});