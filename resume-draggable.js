/**
 * Makes the resume, Acrobat, and bin icons draggable (anime.js 4).
 * When close enough to another icon, animate centers into alignment.
 *
 * SPA requirement: this module must be loaded globally in the base layout <head> of every
 * entry-point HTML (not inside #content). Scripts inserted via innerHTML are not executed,
 * so if this were only in the home fragment it would never run after AJAX navigation.
 * Loaded once, it listens for contentLoaded and re-inits when home content appears.
 */
import { createScope, createDraggable, animate } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';
import { openPdfViewer } from './pdf-viewer.js';

const SNAP_RADIUS = 1670;
/** Below this distance we animate centers into alignment. */
const SNAP_LOCK_PX = 70.0;
const INTRO_REVEAL_MS = 1000;
const INTRO_FADE_MS = 220;
const INTRO_DEFERRED_ICON_SELECTOR = '.draggable-icon-bin, .draggable-icon-lightbulb';
/** How close the bin must be to the viewport edge to count as hitting the wall. */
const BIN_WALL_PX = 16;
/** Speed into that edge (px/ms). A slow push against the wall does not count. */
const BIN_THROW_MIN_SPEED = 1.5;
/** Recent motion used to measure the throw, so a clamped frame still counts. */
const BIN_THROW_WINDOW_MS = 140;

let isSnapping = false;
/** Number of icons destroyed by the bin. */
let binDestroyCount = 0;
/** Icons currently inside the bin, in the order they were swallowed. */
const binContents = [];
/** True while the bin is shaking or throwing its contents back out. */
let binAnimating = false;
/** Recent bin drag samples used to measure a throw into the screen edge. */
const binThrowSamples = [];
/** Which screen edges the bin was already touching, so resting there does not re-trigger. */
let binWallContact = { left: false, right: false, top: false, bottom: false };
/** Map of wrapper element -> draggable instance, set during init so we can release on tab switch. */
let activeDraggables = null;
/** True briefly after resetDragState re-enables draggables so we don't open PDF from a spurious snap. */
let skipNextPdfOpen = false;
/** Cleanup function for the one-time intro reveal trigger listener(s). */
let introRevealCleanup = null;

/** Dragged element -> target it was last snapped to. Used to open PDF only on entering Acrobat, not when dragging out. */
const lastSnappedTarget = new WeakMap();

/** Container-relative base position for each icon, captured once at init. */
const basePositions = new WeakMap();

function setDeferredIntroIconsVisible(visible) {
  document.querySelectorAll(INTRO_DEFERRED_ICON_SELECTOR).forEach((el) => {
    if (visible) {
      el.classList.remove('intro-hidden-until-reveal');
    } else {
      el.classList.add('intro-hidden-until-reveal');
    }
  });
}

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
function isSitePiece(wrapper) {
  return wrapper.classList.contains('site-piece');
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
  } else {
    img.src = 'assets/binempty.png';
  }
}

function releaseDrag(el) {
  if (!el) return;
  for (let pid = 1; pid <= 10; pid++) {
    try { el.releasePointerCapture(pid); } catch (_) {}
  }
  const draggable = activeDraggables?.get(el);
  if (draggable) {
    draggable.stop();
    draggable.disable();
    draggable.enable();
  }
}

function swallowIntoBin(icon, binWrapper) {
  if (binAnimating || !icon || isBin(icon)) return;
  if (icon.classList.contains('icon-vanished') || icon.classList.contains('icon-expelling')) return;
  if (icon.classList.contains('site-piece')) icon.classList.add('site-piece-freed');
  icon.classList.add('icon-vanished');
  if (!binContents.includes(icon)) binContents.push(icon);
  binDestroyCount = binContents.length;
  updateBinImage(binWrapper);
  releaseDrag(icon);
  window.updateResumeAdobeArrow?.();
  updateBinTally();
}

function visualCenter(el, container) {
  const cr = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x: r.left - cr.left + r.width / 2,
    y: r.top - cr.top + r.height / 2,
  };
}

/** Draggable x/y that places `el` on `centerX`/`centerY`, using its current rect as the reference. */
function offsetForCenter(el, draggable, container, centerX, centerY) {
  const current = visualCenter(el, container);
  return {
    x: draggable.x + (centerX - current.x),
    y: draggable.y + (centerY - current.y),
  };
}

function playBinShake(binEl) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const button = binEl.querySelector('.resume-button');
  if (reduceMotion || !button) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      button.removeEventListener('animationend', finish);
      binEl.classList.remove('bin-shaking');
      resolve();
    };
    binEl.classList.add('bin-shaking');
    button.style.animation = 'none';
    void button.offsetWidth;
    button.style.animation = '';
    button.addEventListener('animationend', finish);
    window.setTimeout(finish, 900);
  });
}

function screenBounds(containerRect, halfW, halfH) {
  const pad = 24;
  return {
    minX: -containerRect.left + halfW + pad,
    maxX: -containerRect.left + window.innerWidth - halfW - pad,
    minY: -containerRect.top + halfH + pad,
    maxY: -containerRect.top + window.innerHeight - halfH - pad,
  };
}

/** Pick a landing on the far side of the screen, clear of spots already taken. */
function pickEjectLanding(origin, bounds, index, count, spin, taken) {
  const minSeparation = 180;
  const corners = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
  ];
  const phase = ((spin % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
  const steps = Math.max(count, 8);
  const candidates = [];

  for (let edge = 0; edge < 4; edge++) {
    const from = corners[edge];
    const to = corners[(edge + 1) % 4];
    for (let step = 0; step < steps; step++) {
      const t = (step + phase) / steps;
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      candidates.push({ x, y, dist: Math.hypot(x - origin.x, y - origin.y) });
    }
  }

  candidates.sort((a, b) => b.dist - a.dist);
  let point = candidates[index % candidates.length];
  for (const candidate of candidates) {
    const crowded = taken.some((landed) => Math.hypot(landed.x - candidate.x, landed.y - candidate.y) < minSeparation);
    if (!crowded) {
      point = candidate;
      break;
    }
  }

  taken.push(point);
  return point;
}

function spawnBinItems(items, binEl, container, wrapperToDraggable, speed, onItemDone) {
  const binCenter = visualCenter(binEl, container);
  const cr = container.getBoundingClientRect();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const taken = [];
  const spin = Math.random() * Math.PI * 2;

  items.forEach((item, i) => {
    const itemD = wrapperToDraggable.get(item);
    if (!itemD) {
      item.classList.remove('icon-vanished');
      onItemDone();
      return;
    }

    const start = offsetForCenter(item, itemD, container, binCenter.x, binCenter.y);
    itemD.setX(start.x, false);
    itemD.setY(start.y, false);
    item.classList.remove('icon-vanished');
    item.classList.add('icon-expelling');

    const halfW = Math.max(item.offsetWidth, 48) / 2;
    const halfH = Math.max(item.offsetHeight, 48) / 2;
    const bounds = screenBounds(cr, halfW, halfH);
    const landing = pickEjectLanding(binCenter, bounds, i, items.length, spin, taken);
    const endX = landing.x;
    const endY = landing.y;

    const endOffX = start.x + (endX - binCenter.x);
    const endOffY = start.y + (endY - binCenter.y);
    const state = { x: start.x, y: start.y };

    animate(state, {
      x: endOffX,
      y: endOffY,
      duration: reduceMotion ? 200 : Math.max(480, 820 - speed * 40) + Math.min(220, landing.dist * 0.1),
      delay: reduceMotion ? 0 : 30 * i,
      ease: 'out(3)',
      onUpdate() {
        itemD.setX(state.x, false);
        itemD.setY(state.y, false);
      },
      onComplete() {
        itemD.setX(endOffX, false);
        itemD.setY(endOffY, false);
        item.classList.remove('icon-expelling');
        window.updateResumeAdobeArrow?.();
        onItemDone();
      },
    });
  });
}

function shakeAndExpel(binEl, container, wrapperToDraggable, speed) {
  if (binAnimating || binContents.length === 0) return;
  binAnimating = true;
  binThrowSamples.length = 0;
  const items = binContents.splice(0, binContents.length);
  binDestroyCount = 0;
  updateBinTally();

  playBinShake(binEl).then(() => {
    binDestroyCount = 0;
    updateBinImage(binEl);
    if (!items.length) {
      binAnimating = false;
      return;
    }
    let remaining = items.length;
    spawnBinItems(items, binEl, container, wrapperToDraggable, speed, () => {
      remaining -= 1;
      if (remaining <= 0) binAnimating = false;
    });
  });
}

/**
 * Watch the bin's drag. Contents fly out only when the bin is thrown hard
 * into an edge of the screen.
 */
function binScreenWalls(binEl) {
  const rect = binEl.getBoundingClientRect();
  return {
    left: rect.left <= BIN_WALL_PX,
    right: rect.right >= window.innerWidth - BIN_WALL_PX,
    top: rect.top <= BIN_WALL_PX,
    bottom: rect.bottom >= window.innerHeight - BIN_WALL_PX,
  };
}

function noteBinShake(draggable, binEl, container, wrapperToDraggable) {
  if (binAnimating || binContents.length === 0) return;

  const now = performance.now();
  binThrowSamples.push({
    t: now,
    dx: draggable.deltaX || 0,
    dy: draggable.deltaY || 0,
  });
  while (binThrowSamples.length && now - binThrowSamples[0].t > BIN_THROW_WINDOW_MS) {
    binThrowSamples.shift();
  }

  const elapsed = Math.max(1, now - binThrowSamples[0].t);
  let dx = 0;
  let dy = 0;
  for (const sample of binThrowSamples) {
    dx += sample.dx;
    dy += sample.dy;
  }
  const vx = dx / elapsed;
  const vy = dy / elapsed;
  const walls = binScreenWalls(binEl);
  const slammed =
    (walls.left && !binWallContact.left && vx <= -BIN_THROW_MIN_SPEED)
    || (walls.right && !binWallContact.right && vx >= BIN_THROW_MIN_SPEED)
    || (walls.top && !binWallContact.top && vy <= -BIN_THROW_MIN_SPEED)
    || (walls.bottom && !binWallContact.bottom && vy >= BIN_THROW_MIN_SPEED);
  binWallContact = walls;
  if (!slammed) return;

  const speed = Math.hypot(vx, vy);
  shakeAndExpel(binEl, container, wrapperToDraggable, speed);
}

/**
 * When two icons have aligned: bin + anything → other vanishes; Acrobat + Resume → open the PDF on this page.
 * Only opens PDF when isEnteringSnap is true (resume came into Acrobat), not when re-snapping after dragging out.
 */
function runAlignedBehaviors(draggedEl, targetEl, isEnteringSnap) {
  if (isBin(draggedEl)) {
    swallowIntoBin(targetEl, draggedEl);
    return;
  }
  if (isBin(targetEl)) {
    swallowIntoBin(draggedEl, targetEl);
    return;
  }
  const resumeAcrobatPair =
    (isResume(draggedEl) && isAcrobat(targetEl)) || (isAcrobat(draggedEl) && isResume(targetEl));
  if (resumeAcrobatPair) {
    lastSnappedTarget.set(draggedEl, targetEl);
    if (targetEl.nextSibling !== draggedEl) {
      targetEl.insertAdjacentElement('afterend', draggedEl);
    }
    if (isEnteringSnap && !skipNextPdfOpen) {
      const resumeEl = document.querySelector('.draggable-icon-resume:not(.icon-vanished)');
      if (resumeEl) openResumePdf(resumeEl);
    }
    return;
  }
}

/**
 * Open resume PDF on this page. Called from runAlignedBehaviors after the icon has animated to center.
 */
function openResumePdf(resumeWrapper) {
  const href = resumeWrapper.getAttribute('data-resume-href');
  if (!href) return;
  openPdfViewer(href);
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

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function binHitbox(binEl) {
  const image = binEl.querySelector('.resume-button-img');
  return (image || binEl).getBoundingClientRect();
}

function overlapsBin(itemEl, binEl) {
  const binRect = binHitbox(binEl);
  if (isFlowText(itemEl)) {
    const letters = itemEl.classList.contains('is-flowing') && itemEl._flowLetters?.length
      ? itemEl._flowLetters
      : [itemEl];
    return letters.some((letter) => {
      const rect = letter.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rectsOverlap(rect, binRect);
    });
  }
  const image = itemEl.querySelector('.resume-button-img, svg');
  return rectsOverlap((image || itemEl).getBoundingClientRect(), binRect);
}

function checkSnap(draggableInstance, draggedEl, allWrappers, container, wrapperToDraggable) {
  const base = getBasePosition(draggedEl, container);
  const dragW = draggedEl.offsetWidth;
  const dragH = draggedEl.offsetHeight;
  const dragCenterX = base.left + draggableInstance.x + dragW / 2;
  const dragCenterY = base.top + draggableInstance.y + dragH / 2;

  if (draggedEl.classList.contains('icon-vanished') || draggedEl.classList.contains('icon-expelling')) return;
  if (binAnimating && isBin(draggedEl)) return;

  let closestTarget = null;
  let closestDist = SNAP_RADIUS;

  for (const target of allWrappers) {
    if (target === draggedEl || target.classList.contains('icon-vanished') || target.classList.contains('icon-expelling')) continue;
    if (binAnimating && isBin(target)) continue;
    const binPair = isBin(draggedEl) || isBin(target);
    if ((isSitePiece(draggedEl) || isSitePiece(target)) && !binPair) continue;
    const targetBase = getBasePosition(target, container);
    const targetD = wrapperToDraggable.get(target);
    const targetX = targetD ? targetD.x : 0;
    const targetY = targetD ? targetD.y : 0;
    const targetCenterX = targetBase.left + targetX + target.offsetWidth / 2;
    const targetCenterY = targetBase.top + targetY + target.offsetHeight / 2;
    if (binPair) {
      const itemEl = isBin(draggedEl) ? target : draggedEl;
      const binEl = isBin(draggedEl) ? draggedEl : target;
      if (!overlapsBin(itemEl, binEl)) continue;
    }
    const dx = targetCenterX - dragCenterX;
    const dy = targetCenterY - dragCenterY;
    const distance = binPair ? 0 : Math.hypot(dx, dy);
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

function initIntroOverlay() {
  const overlay = document.getElementById('intro-overlay');
  if (!overlay) {
    setDeferredIntroIconsVisible(true);
    introFinished = true;
    syncBinCounterVisibility();
    return;
  }

  introRevealCleanup?.();
  introFinished = false;
  syncBinCounterVisibility();
  setDeferredIntroIconsVisible(false);
  overlay.classList.remove('is-revealing', 'is-hidden');
  overlay.dataset.revealed = 'false';
  overlay.setAttribute('aria-hidden', 'false');

  const revealIntro = () => {
    if (overlay.dataset.revealed === 'true') return;
    overlay.dataset.revealed = 'true';
    overlay.classList.add('is-revealing');

    window.setTimeout(() => {
      overlay.classList.add('is-hidden');
      overlay.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => {
        overlay.remove();
        setDeferredIntroIconsVisible(true);
        introFinished = true;
        syncBinCounterVisibility();
      }, INTRO_FADE_MS + 30);
    }, INTRO_REVEAL_MS);
  };

  const resumeTrigger = document.querySelector('.draggable-icon-resume');
  if (!resumeTrigger) return;

  const onResumeInteract = () => revealIntro();
  resumeTrigger.addEventListener('pointerdown', onResumeInteract, { once: true, capture: true });
  resumeTrigger.addEventListener('click', onResumeInteract, { once: true, capture: true });

  introRevealCleanup = () => {
    resumeTrigger.removeEventListener('pointerdown', onResumeInteract, { capture: true });
    resumeTrigger.removeEventListener('click', onResumeInteract, { capture: true });
  };
}

function isResumePage(url = location.href) {
  return !url.includes('applications') && !url.includes('coop-reports');
}

let binCounter = null;
let binGoal = 0;
let activeFlow = null;
let introFinished = false;
let pdfClosedOnce = false;
let lastBinCount = 0;
let binFlashTimer = 0;
let onResumePage = isResumePage();

function syncBinCounterVisibility() {
  if (!binCounter) return;
  binCounter.hidden = !(onResumePage && introFinished && pdfClosedOnce);
}

window.addEventListener('pdfviewerclosed', () => {
  pdfClosedOnce = true;
  syncBinCounterVisibility();
});

function isFlowText(el) {
  return el.classList.contains('site-piece') && !el.querySelector('svg') && el.textContent.trim().length > 0;
}

function prepareFlowText(el) {
  if (el.dataset.flowReady === 'true') return;
  const text = el.textContent;
  el.textContent = '';
  el.classList.add('flow-text');
  const letters = [];
  for (const char of text) {
    const letter = document.createElement('span');
    letter.className = 'flow-letter';
    letter.textContent = char === ' ' ? '\u00a0' : char;
    el.append(letter);
    letters.push(letter);
  }
  el._flowLetters = letters;
  el.dataset.flowReady = 'true';
}

function beginFlowText(el, event) {
  if (event.button !== 0 || el.classList.contains('icon-vanished')) return;
  const letters = el._flowLetters;
  if (!letters?.length) return;

  let head = 0;
  let best = Infinity;
  letters.forEach((letter, index) => {
    const rect = letter.getBoundingClientRect();
    const distance = Math.hypot(
      event.clientX - (rect.left + rect.width / 2),
      event.clientY - (rect.top + rect.height / 2)
    );
    if (distance < best) {
      best = distance;
      head = index;
    }
  });

  if (!el.classList.contains('is-flowing')) {
    const rect = el.getBoundingClientRect();
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    letters.forEach((letter) => {
      const letterRect = letter.getBoundingClientRect();
      letter.dataset.homeX = String(letterRect.left - rect.left);
      letter.dataset.homeY = String(letterRect.top - rect.top);
    });
    el.classList.add('is-flowing');
    letters.forEach((letter) => {
      letter.style.left = `${letter.dataset.homeX}px`;
      letter.style.top = `${letter.dataset.homeY}px`;
    });
  }

  activeFlow = {
    el,
    head,
    letters,
    trail: [{ x: event.clientX, y: event.clientY }],
  };
}

function trimTrail(trail, maxLength) {
  let length = 0;
  for (let i = 0; i < trail.length - 1; i++) {
    length += Math.hypot(trail[i + 1].x - trail[i].x, trail[i + 1].y - trail[i].y);
    if (length > maxLength) {
      trail.length = i + 2;
      return;
    }
  }
}

function pointAlongTrail(points, distance) {
  if (points.length === 1) return { x: points[0].x, y: points[0].y, angle: 0 };
  let remaining = distance;
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const segment = Math.hypot(end.x - start.x, end.y - start.y);
    if (segment < 0.001) continue;
    if (remaining <= segment) {
      const t = remaining / segment;
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        angle: Math.atan2(start.y - end.y, start.x - end.x),
      };
    }
    remaining -= segment;
  }
  const start = points[points.length - 2];
  const end = points[points.length - 1];
  return {
    x: end.x,
    y: end.y,
    angle: Math.atan2(start.y - end.y, start.x - end.x),
  };
}

function trailLength(points) {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return length;
}

function layoutFlowText(state) {
  const { el, letters, trail } = state;
  const origin = el.getBoundingClientRect();
  const widths = letters.map((letter) => (letter.offsetWidth || 8) * 0.92);
  const natural = widths.reduce((sum, width) => sum + width, 0);
  const available = trailLength(trail);
  const scale = available > 1 && available < natural ? available / natural : 1;
  let distanceFromCursor = natural * scale;

  letters.forEach((letter, index) => {
    distanceFromCursor -= widths[index] * scale;
    const point = pointAlongTrail(trail, Math.max(0, distanceFromCursor));
    let angle = point.angle;
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle < -Math.PI / 2) angle += Math.PI;
    const width = letter.offsetWidth || 8;
    const height = letter.offsetHeight || 16;
    letter.style.left = `${point.x - origin.left - width / 2}px`;
    letter.style.top = `${point.y - origin.top - height / 2}px`;
    letter.style.transform = `rotate(${angle}rad)`;
  });
}

function installFlowListeners() {
  if (installFlowListeners.installed) return;
  installFlowListeners.installed = true;
  window.addEventListener('pointermove', (event) => {
    if (!activeFlow) return;
    const last = activeFlow.trail[0];
    if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 2) return;
    activeFlow.trail.unshift({ x: event.clientX, y: event.clientY });
    const textLength = activeFlow.letters.reduce((sum, letter) => sum + (letter.offsetWidth || 8), 0);
    trimTrail(activeFlow.trail, textLength + 40);
    layoutFlowText(activeFlow);
  });
  const endFlow = () => {
    activeFlow = null;
  };
  window.addEventListener('pointerup', endFlow);
  window.addEventListener('pointercancel', endFlow);
}

function ensureBinCounter(wrappers) {
  binGoal = wrappers.filter((el) => !isBin(el)).length;
  if (!binCounter) {
    binCounter = document.createElement('div');
    binCounter.className = 'bin-counter';
    binCounter.innerHTML = `
      <span class="bin-counter-count"></span>
      <p class="bin-achievement" hidden>You got everything in the bin!</p>
    `;
    document.body.append(binCounter);
  }
  syncBinCounterVisibility();
  updateBinTally();
}

function updateBinTally() {
  if (!binCounter) return;
  const count = binContents.length;
  const countEl = binCounter.querySelector('.bin-counter-count');
  countEl.textContent = `${count} / ${binGoal} in the bin`;
  const achievement = binCounter.querySelector('.bin-achievement');
  const complete = binGoal > 0 && count >= binGoal;
  achievement.hidden = !complete;
  binCounter.classList.toggle('is-complete', complete);
  document.querySelector('.bottom-text')?.classList.toggle('is-visible', complete);
  if (count > lastBinCount) {
    window.clearTimeout(binFlashTimer);
    countEl.classList.remove('is-flashing');
    void countEl.offsetWidth;
    countEl.classList.add('is-flashing');
    binFlashTimer = window.setTimeout(() => {
      countEl.classList.remove('is-flashing');
    }, 420);
  }
  lastBinCount = count;
}

function initResumeScope() {
  if (document.querySelector('.draggable-icon-wrapper[data-initialized]')) return;

  binContents.length = 0;
  binDestroyCount = 0;
  lastBinCount = 0;
  binAnimating = false;
  binThrowSamples.length = 0;
  binWallContact = { left: false, right: false, top: false, bottom: false };

  const wrappers = Array.from(document.querySelectorAll('.draggable-icon-wrapper, .site-piece'));
  if (!wrappers.length) return;

  wrappers.forEach((el) => {
    if (isFlowText(el)) prepareFlowText(el);
  });
  ensureBinCounter(wrappers);
  installFlowListeners();

  const container = document.body;
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
        onGrab: () => {
          if (!isBin(el)) return;
          binThrowSamples.length = 0;
          binWallContact = binScreenWalls(el);
        },
        onDrag: () => {
          if (el.classList.contains('site-piece')) el.dataset.suppressClick = 'true';
          checkSnap(d, el, wrappers, container, wrapperToDraggable);
          window.updateResumeAdobeArrow?.();
        },
        onUpdate: () => {
          checkSnap(d, el, wrappers, container, wrapperToDraggable);
          window.updateResumeAdobeArrow?.();
          if (isBin(el) && d.grabbed) noteBinShake(d, el, container, wrapperToDraggable);
        },
      });
      if (el.classList.contains('site-piece') && el.tagName === 'A') {
        el.addEventListener('click', (event) => {
          if (el.dataset.suppressClick !== 'true') return;
          event.preventDefault();
          event.stopPropagation();
          el.dataset.suppressClick = '';
        });
      }
      if (el.classList.contains('flow-text')) {
        el.addEventListener('pointerdown', (event) => beginFlowText(el, event));
      }
      wrapperToDraggable.set(el, d);
    });
    activeDraggables = wrapperToDraggable;
    return () => {
      activeDraggables = null;
      wrappers.forEach((el) => el.classList.remove('draggable'));
    };
  });
}

function resetDragState() {
  document.querySelectorAll('.draggable-icon-wrapper.draggable').forEach((el) => {
    for (let pid = 1; pid <= 10; pid++) {
      try {
        el.releasePointerCapture(pid);
      } catch (_) {}
    }
    const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 };
    el.dispatchEvent(new PointerEvent('pointercancel', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
  });
  if (activeDraggables) {
    skipNextPdfOpen = true;
    activeDraggables.forEach((d) => {
      if (d) {
        d.stop();
        d.disable();
      }
    });
    requestAnimationFrame(() => {
      activeDraggables?.forEach((d) => d?.enable());
      setTimeout(() => { skipNextPdfOpen = false; }, 200);
    });
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    resetDragState();
  }
});
window.addEventListener('blur', resetDragState);

document.addEventListener('contentLoaded', (e) => {
  const url = e.detail?.url ?? location.href;
  const isHome = isResumePage(url);
  onResumePage = isHome;
  syncBinCounterVisibility();

  if (isHome) {
    initIntroOverlay();
    initResumeScope();
  } else {
    introRevealCleanup?.();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initIntroOverlay();
  if (document.querySelector('.draggable-icon-wrapper')) {
    initResumeScope();
  }
});