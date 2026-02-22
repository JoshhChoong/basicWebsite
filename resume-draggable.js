/**
 * Makes the resume, Acrobat, and bin icons draggable (anime.js 4).
 * Magnetic snap: only snap to another icon when within SNAP_RADIUS; otherwise free movement.
 *
 * SPA requirement: this module must be loaded globally in the base layout <head> of every
 * entry-point HTML (not inside #content). Scripts inserted via innerHTML are not executed,
 * so if this were only in the home fragment it would never run after AJAX navigation.
 * Loaded once, it listens for contentLoaded and re-inits when home content appears.
 */
import { createScope, createDraggable } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

const SNAP_RADIUS = 160;
/** Below this distance we full-snap so centers align in one frame (no smoothing). */
const SNAP_LOCK_PX = 12;
/** Attraction per frame when inside radius. */
const PULL_PER_FRAME = 0.11;

let lastSnapLog = 0;
const SNAP_LOG_THROTTLE_MS = 400;

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

function checkSnap(draggableInstance, draggedEl, allWrappers, container, wrapperToDraggable) {
  const base = getBasePosition(draggedEl, container);
  const dragW = draggedEl.offsetWidth;
  const dragH = draggedEl.offsetHeight;
  const dragCenterX = base.left + draggableInstance.x + dragW / 2;
  const dragCenterY = base.top + draggableInstance.y + dragH / 2;

  let closestTarget = null;
  let closestDist = SNAP_RADIUS;

  for (const target of allWrappers) {
    if (target === draggedEl) continue;
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

  if (closestTarget) {
    const targetBase = getBasePosition(closestTarget, container);
    const targetD = wrapperToDraggable.get(closestTarget);
    const targetX = targetD ? targetD.x : 0;
    const targetY = targetD ? targetD.y : 0;
    const targetCenterX = targetBase.left + targetX + closestTarget.offsetWidth / 2;
    const targetCenterY = targetBase.top + targetY + closestTarget.offsetHeight / 2;
    const dx = targetCenterX - dragCenterX;
    const dy = targetCenterY - dragCenterY;

    if (closestDist < SNAP_LOCK_PX) {
      draggableInstance.setX(targetCenterX - base.left - dragW / 2, false);
      draggableInstance.setY(targetCenterY - base.top - dragH / 2, false);
      draggableInstance.velocityX = 0;
      draggableInstance.velocityY = 0;
      return;
    }

    draggableInstance.setX(draggableInstance.x + dx * PULL_PER_FRAME, true);
    draggableInstance.setY(draggableInstance.y + dy * PULL_PER_FRAME, true);

    if (Date.now() - lastSnapLog > SNAP_LOG_THROTTLE_MS) {
      lastSnapLog = Date.now();
      const label = closestTarget.classList.contains('draggable-icon-adobe') ? 'Acrobat' : closestTarget.classList.contains('draggable-icon-bin') ? 'Bin' : 'Resume';
      console.log('[Magnetic snap] Pull toward', label, '| distance:', Math.round(closestDist), 'px');
    }
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