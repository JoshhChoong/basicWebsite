/**
 * Makes the resume button draggable (anime.js 4).
 * Uses createScope().add(constructor) with media query: draggable on larger screens
 */
import { utils, createScope, createDraggable } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

function initResumeScope() {
  const [$resumeButton] = utils.$('.resume-button-draggable-wrapper');
  if (!$resumeButton) return;

  createScope({
    defaults: { ease: 'linear' },
  })
    .add(self => {
      $resumeButton.classList.add('draggable');
      createDraggable($resumeButton, {
        container: document.querySelector('.resume-drag-container') || document.body,
        containerFriction: 0.2
      });
      return () => {
        $resumeButton.classList.remove('draggable');
      };
    });
}

document.addEventListener('contentLoaded', (e) => {
  const url = e.detail?.url ?? location.href;
  const isHome = !url.includes('applications');
  if (isHome) initResumeScope();
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.resume-button-draggable-wrapper')) {
    initResumeScope();
  }
});