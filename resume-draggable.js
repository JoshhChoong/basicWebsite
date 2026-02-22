/**
 * Makes the resume, Acrobat, and bin icons draggable (anime.js 4).
 * Magnetic snap: only snap to another icon when within SNAP_RADIUS; otherwise free movement.
 */
import { createScope, createDraggable } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

const SNAP_RADIUS = 160;

let lastSnapLog = 0;
const SNAP_LOG_THROTTLE_MS = 400;

/** Container-relative position for each icon (filled after first layout). */
const basePositions = new WeakMap();

function getBasePosition(el, container) {
  let base = basePositions.get(el);
  if (base) return base;
  const cr = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  base = { left: r.left - cr.left, top: r.top - cr.top };
  basePositions.set(el, base);
  return base;
}

function captureBasePositions(wrappers, container) {
  wrappers.forEach((el) => getBasePosition(el, container));
}

function checkSnap(draggableInstance, draggedEl, allWrappers, container) {
  const dragRect = draggedEl.getBoundingClientRect();
  const cr = container.getBoundingClientRect();

  const dragCenterX = dragRect.left + dragRect.width / 2;
  const dragCenterY = dragRect.top + dragRect.height / 2;

  let closestTarget = null;
  let closestDist = SNAP_RADIUS;

  for (const target of allWrappers) {
    if (target === draggedEl) continue;
    const targetRect = target.getBoundingClientRect();
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
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
    const snapLeft = targetRect.left - cr.left;
    const snapTop = targetRect.top - cr.top;
    const base = getBasePosition(draggedEl, container);
    const deltaX = snapLeft - base.left;
    const deltaY = snapTop - base.top;
    const currentX = draggableInstance.x;
    const currentY = draggableInstance.y;
    draggableInstance.setX(deltaX, true);
    draggableInstance.setY(deltaY, true);
    if (Date.now() - lastSnapLog > SNAP_LOG_THROTTLE_MS) {
      lastSnapLog = Date.now();
      const label = closestTarget.classList.contains('draggable-icon-adobe') ? 'Acrobat' : closestTarget.classList.contains('draggable-icon-bin') ? 'Bin' : 'Resume';
      console.log('[Magnetic snap] Snapped to', label, '| distance:', Math.round(closestDist), 'px | before x,y:', Math.round(currentX), Math.round(currentY), '| delta:', Math.round(deltaX), Math.round(deltaY), '| snapLeft,Top:', Math.round(snapLeft), Math.round(snapTop));
    }
  }
}

function initResumeScope() {
  const wrappers = Array.from(document.querySelectorAll('.draggable-icon-wrapper'));
  if (!wrappers.length) return;

  const container = document.querySelector('.resume-drag-container') || document.body;
  console.log('[Magnetic snap] Ready. Icons:', wrappers.length, '| Snap radius:', SNAP_RADIUS, 'px');

  createScope({
    defaults: { ease: 'linear' },
  }).add(() => {
    wrappers.forEach((el) => {
      el.classList.add('draggable');
      const d = createDraggable(el, {
        container,
        containerFriction: 0.2,
        onDrag: () => checkSnap(d, el, wrappers, container),
      });
    });
    requestAnimationFrame(() => captureBasePositions(wrappers, container));
    return () => wrappers.forEach((el) => el.classList.remove('draggable'));
  });
}

document.addEventListener('contentLoaded', (e) => {
  const url = e.detail?.url ?? location.href;
  const isHome = !url.includes('applications');
  if (isHome) initResumeScope();
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.draggable-icon-wrapper')) {
    initResumeScope();
  }
});