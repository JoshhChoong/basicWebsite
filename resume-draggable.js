/**
 * Makes the resume button draggable (anime.js 4).
 * Uses createScope().add(constructor) with media query: draggable on larger screens,
 * rotate animation on small screens. Re-runs when home content is injected via client-side nav.
 */
import { utils, animate, createScope, createDraggable } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

function initResumeScope() {
  const [$resumeButton] = utils.$('.resume-button-draggable-wrapper');
  if (!$resumeButton) return;

  createScope({
    mediaQueries: { isSmall: '(max-width: 600px)' },
    defaults: { ease: 'linear' },
  })
    .add(self => {
      if (self.matches.isSmall) {
        animate($resumeButton, {
          rotate: 360,
          loop: true,
        });
      } else {
        $resumeButton.classList.add('draggable');
        createDraggable($resumeButton, {
          container: document.querySelector('.resume-drag-container') || document.body,
        });
      }
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