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
/** Below this distance we hard-snap (no drift). */
const SNAP_LOCK_PX = 30;
/** Fixed attraction per frame when inside radius (compounds quickly). */
const PULL_PER_FRAME = 0.18;

let lastSnapLog = 0;
const SNAP_LOG_THROTTLE_MS = 400;

/** Center of a rect in container space (no cached base; avoids capture timing, resize, parent transforms). */
function centerInContainer(rect, cr) {
  return {
    x: rect.left - cr.left + rect.width / 2,
    y: rect.top - cr.top + rect.height / 2,
  };
}

function checkSnap(draggableInstance, draggedEl, allWrappers, container) {
  const dragRect = draggedEl.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  const { x: dragCenterX, y: dragCenterY } = centerInContainer(dragRect, cr);

  let closestTarget = null;
  let closestDist = SNAP_RADIUS;

  for (const target of allWrappers) {
    if (target === draggedEl) continue;
    const targetRect = target.getBoundingClientRect();
    const { x: targetCenterX, y: targetCenterY } = centerInContainer(targetRect, cr);
    const dx = targetCenterX - dragCenterX;
    const dy = targetCenterY - dragCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < closestDist) {
      closestDist = distance;
      closestTarget = target;
    }
  }

  if (closestTarget) {
    const targetRect = closestTarget.getBoundingClientRect();
    const { x: targetCenterX, y: targetCenterY } = centerInContainer(targetRect, cr);
    const dx = targetCenterX - dragCenterX;
    const dy = targetCenterY - dragCenterY;

    if (closestDist < SNAP_LOCK_PX) {
      draggableInstance.setX(draggableInstance.x + dx, true);
      draggableInstance.setY(draggableInstance.y + dy, true);
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

  createScope({
    defaults: { ease: 'linear' },
  }).add(() => {
    wrappers.forEach((el) => {
      el.dataset.initialized = 'true';
      el.classList.add('draggable');
      const d = createDraggable(el, {
        container,
        containerFriction: 0.35,
        onDrag: () => checkSnap(d, el, wrappers, container),
        onUpdate: () => checkSnap(d, el, wrappers, container),
      });
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