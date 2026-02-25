/**
 * Dynamic line between resume icon center and Adobe icon center.
 * Path is a cubic Bezier (S-curve); generated in JS, updated on drag/resize.
 */
import { animate } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

const DRAW_DURATION = 800;
const DRAW_EASING = 'out(2)';

let pathEl = null;
let svgEl = null;
let containerEl = null;
let resumeEl = null;
let adobeEl = null;
let initialized = false;

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
    return;
  }

  pathEl.style.visibility = '';
  const { x: x1, y: y1 } = getCenter(resumeEl, rect);
  const { x: x2, y: y2 } = getCenter(adobeEl, rect);

  const d = `
  M ${x1} ${y1}
  C ${(x1 + x2) / 2} ${y1},
    ${(x1 + x2) / 2} ${y2},
    ${x2} ${y2}
`;
  pathEl.setAttribute('d', d.trim());

  // Reset stroke dash so the line is continuous (not segmented) when path updates on drag/resize
  pathEl.style.strokeDasharray = '';
  pathEl.style.strokeDashoffset = '';

  svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svgEl.setAttribute('preserveAspectRatio', 'none');
}

function animateArrowDraw() {
  if (!pathEl || !pathEl.getAttribute('d')) return;
  const length = pathEl.getTotalLength();
  pathEl.style.strokeDasharray = String(length);
  pathEl.style.strokeDashoffset = String(length);
  const state = { strokeDashoffset: length };
  animate(state, {
    strokeDashoffset: 0,
    duration: DRAW_DURATION,
    ease: DRAW_EASING,
    onUpdate() {
      pathEl.style.strokeDashoffset = String(state.strokeDashoffset);
    },
    onComplete() {
      pathEl.style.strokeDasharray = '';
      pathEl.style.strokeDashoffset = '';
    },
  });
}

function init() {
  containerEl = document.querySelector('.resume-drag-container');
  svgEl = document.getElementById('arrow-svg');
  pathEl = document.getElementById('arrow-path');
  resumeEl = document.querySelector('.draggable-icon-resume');
  adobeEl = document.querySelector('.draggable-icon-adobe');

  if (!containerEl || !svgEl || !pathEl || !resumeEl || !adobeEl) return;
  if (initialized) return;
  initialized = true;

  updateArrow();
  animateArrowDraw();
  window.updateResumeAdobeArrow = updateArrow;
  window.addEventListener('resize', updateArrow);
}

document.addEventListener('contentLoaded', (e) => {
  if (!(e.detail?.url ?? location.href).includes('applications')) {
    initialized = false;
    init();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.resume-drag-container')) init();
});
