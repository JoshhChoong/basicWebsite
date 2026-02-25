/**
 * Dynamic line between resume icon center and Adobe icon center.
 * Path is a cubic Bezier (S-curve); generated in JS, updated on drag/resize.
 * A small dot travels along the path; position is read from the current path each frame
 * so the dot keeps moving when the path changes (e.g. when icons are dragged).
 */
import { animate } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

const DOT_DURATION = 2000;
const DOT_EASING = 'linear';

let pathEl = null;
let dotGroupEl = null;
let svgEl = null;
let containerEl = null;
let resumeEl = null;
let adobeEl = null;
let dotAnimation = null;
let rafId = null;
let currentDotProgress = 0;
let initialized = false;

function tick() {
  updateArrow();
  updateDotPosition(currentDotProgress);
  rafId = requestAnimationFrame(tick);
}

function getCenter(el, containerRect) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left - containerRect.left + r.width / 2,
    y: r.top - containerRect.top + r.height / 2,
  };
}

function updateArrow() {
  if (!containerEl || !svgEl || !pathEl || !resumeEl || !adobeEl) return;

  const rect = containerEl.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  if (resumeEl.classList.contains('icon-vanished') || adobeEl.classList.contains('icon-vanished')) {
    pathEl.setAttribute('d', '');
    pathEl.style.visibility = 'hidden';
    if (dotGroupEl) dotGroupEl.style.visibility = 'hidden';
    return;
  }

  pathEl.style.visibility = '';
  if (dotGroupEl) dotGroupEl.style.visibility = '';
  const { x: x1, y: y1 } = getCenter(resumeEl, rect);
  const { x: x2, y: y2 } = getCenter(adobeEl, rect);

  const d = `
  M ${x1} ${y1}
  C ${(x1 + x2) / 2} ${y1},
    ${(x1 + x2) / 2} ${y2},
    ${x2} ${y2}
`;
  pathEl.setAttribute('d', d.trim());

  pathEl.style.strokeDasharray = '';
  pathEl.style.strokeDashoffset = '';

  svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svgEl.setAttribute('preserveAspectRatio', 'none');
}

function updateDotPosition(progress) {
  if (!pathEl || !dotGroupEl || !pathEl.getAttribute('d')) return;
  const length = pathEl.getTotalLength();
  const t = progress * length;
  const point = pathEl.getPointAtLength(t);
  const tangentEpsilon = Math.max(length * 0.01, 1);
  const t2 = Math.min(t + tangentEpsilon, length);
  const pointAhead = pathEl.getPointAtLength(t2);
  const angleRad = Math.atan2(pointAhead.y - point.y, pointAhead.x - point.x);
  const angleDeg = (angleRad * 180) / Math.PI;
  dotGroupEl.setAttribute(
    'transform',
    `translate(${point.x}, ${point.y}) rotate(${angleDeg})`
  );
}

function startDotAlongPath() {
  if (!pathEl || !dotGroupEl || !pathEl.getAttribute('d')) return;
  if (dotAnimation != null) return;
  updateDotPosition(0);
  const state = { progress: 0 };
  dotAnimation = animate(state, {
    progress: 1,
    duration: DOT_DURATION,
    ease: DOT_EASING,
    loop: true,
    onUpdate() {
      currentDotProgress = state.progress;
      updateDotPosition(state.progress);
    },
  });
}

function init() {
  containerEl = document.querySelector('.resume-drag-container');
  svgEl = document.getElementById('arrow-svg');
  pathEl = document.getElementById('arrow-path');
  dotGroupEl = document.getElementById('arrow-dot-group');
  resumeEl = document.querySelector('.draggable-icon-resume');
  adobeEl = document.querySelector('.draggable-icon-adobe');

  if (!containerEl || !svgEl || !pathEl || !dotGroupEl || !resumeEl || !adobeEl) return;
  if (initialized) return;
  initialized = true;

  updateArrow();
  startDotAlongPath();
  window.updateResumeAdobeArrow = updateArrow;
  window.addEventListener('resize', updateArrow);

  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

document.addEventListener('contentLoaded', (e) => {
  const url = e.detail?.url ?? location.href;
  if (url.includes('applications')) {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    initialized = false;
    return;
  }
  initialized = false;
  init();
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.resume-drag-container')) init();
});
