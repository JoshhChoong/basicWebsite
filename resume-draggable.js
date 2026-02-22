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

let isSnapping = false;
/** Number of icons destroyed by the bin (Resume + Acrobat = 2 max). */
let binDestroyCount = 0;

/** Dragged element -> target it was last snapped to. Used to open PDF only on entering Acrobat, not when dragging out. */
const lastSnappedTarget = new WeakMap();

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
 * Only opens PDF when isEnteringSnap is true (resume came into Acrobat), not when re-snapping after dragging out.
 */
function runAlignedBehaviors(draggedEl, targetEl, isEnteringSnap) {
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
  const resumeAcrobatPair =
    (isResume(draggedEl) && isAcrobat(targetEl)) || (isAcrobat(draggedEl) && isResume(targetEl));
  if (resumeAcrobatPair) {
    lastSnappedTarget.set(draggedEl, targetEl);
    if (isEnteringSnap) {
      const resumeEl = document.querySelector('.draggable-icon-resume:not(.icon-vanished)');
      if (resumeEl) openResumePdf(resumeEl);
    }
    return;
  }
}

/**
 * Open resume PDF. Called from runAlignedBehaviors after the icon has animated to center.
 * On mobile we use same-tab navigation (usually allowed after animation); on desktop we open in a new tab.
 */
function openResumePdf(resumeWrapper) {
  const href = resumeWrapper.getAttribute('data-resume-href');
  if (!href) return;
  const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  if (isMobile) {
    window.location.href = href;
  } else {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Animate the dragged icon so its center matches the target center.
 * Uses DOM rects for real visual positions. Syncs draggable x/y during animation.
 * isEnteringSnap: true when this snap is "resume entering Acrobat", so we open PDF only then.
 */
function alignCenters(d, draggedEl, targetEl, container, isEnteringSnap) {
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
      runAlignedBehaviors(draggedEl, targetEl, isEnteringSnap);
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

  /* Prefer Resume when dragging Acrobat (and vice versa) so we don't snap to lightbulb/bin instead. */
  if (closestTarget) {
    const resumeEl = allWrappers.find((w) => isResume(w) && !w.classList.contains('icon-vanished'));
    const acrobatEl = allWrappers.find((w) => isAcrobat(w) && !w.classList.contains('icon-vanished'));
    if (isAcrobat(draggedEl) && resumeEl) {
      const targetBase = getBasePosition(resumeEl, container);
      const targetD = wrapperToDraggable.get(resumeEl);
      const tx = targetD ? targetD.x : 0;
      const ty = targetD ? targetD.y : 0;
      const distToResume = Math.hypot(
        targetBase.left + tx + resumeEl.offsetWidth / 2 - dragCenterX,
        targetBase.top + ty + resumeEl.offsetHeight / 2 - dragCenterY
      );
      if (distToResume < SNAP_LOCK_PX) {
        closestTarget = resumeEl;
        closestDist = distToResume;
      }
    } else if (isResume(draggedEl) && acrobatEl) {
      const targetBase = getBasePosition(acrobatEl, container);
      const targetD = wrapperToDraggable.get(acrobatEl);
      const tx = targetD ? targetD.x : 0;
      const ty = targetD ? targetD.y : 0;
      const distToAcrobat = Math.hypot(
        targetBase.left + tx + acrobatEl.offsetWidth / 2 - dragCenterX,
        targetBase.top + ty + acrobatEl.offsetHeight / 2 - dragCenterY
      );
      if (distToAcrobat < SNAP_LOCK_PX) {
        closestTarget = acrobatEl;
        closestDist = distToAcrobat;
      }
    }
  }

  if (closestTarget && closestDist >= SNAP_LOCK_PX) {
    lastSnappedTarget.delete(draggedEl);
  }
  if (closestTarget && closestDist < SNAP_LOCK_PX && !isSnapping) {
    const isEnteringSnap = lastSnappedTarget.get(draggedEl) !== closestTarget;
    isSnapping = true;
    alignCenters(draggableInstance, draggedEl, closestTarget, container, isEnteringSnap);
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