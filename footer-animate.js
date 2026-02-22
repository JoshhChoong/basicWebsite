/**
 * Animates the footer text to slide right-to-left using anime.js.
 * Runs when the footer is present (index/home page) and when it is re-inserted after SPA navigation.
 */
import { animate } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

const SLIDE_DURATION_MS = 42000;
const EASE = 'linear';

function startFooterSlide() {
    const textEl = document.querySelector('.footer-bar .bottom-text');
    if (!textEl) return;

    const vw = document.documentElement.clientWidth;
    const textWidth = textEl.offsetWidth;
    // Start: text's left edge at right edge of viewport (offscreen right)
    const startX = vw;
    // End: text's right edge at left edge of viewport (offscreen left)
    const endX = -(vw + textWidth);

    animate(textEl, {
        translateX: [startX, endX],
        duration: SLIDE_DURATION_MS,
        ease: EASE,
        loop: true,
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.footer-bar')) startFooterSlide();
});

document.addEventListener('contentLoaded', () => {
    if (document.querySelector('.footer-bar')) startFooterSlide();
});
