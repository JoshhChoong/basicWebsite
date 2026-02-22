/**
 * Animates the footer text to slide right-to-left using anime.js.
 * Runs when the footer is present (index/home page) and when it is re-inserted after SPA navigation.
 */
import { animate } from 'https://cdn.jsdelivr.net/npm/animejs@4.0.0/+esm';

const SLIDE_DURATION_MS = 42000;
const SLIDE_DELAY_MS = 10000; // Wait 10s before slide starts
const EASE = 'linear';

function startFooterSlide() {
    const slideEl = document.querySelector('.footer-bar .footer-slide-inner');
    if (!slideEl) return;

    const vw = document.documentElement.clientWidth;
    const textWidth = slideEl.offsetWidth;
    // Start: text's left edge at right edge of viewport (offscreen right)
    const startX = vw;
    // End: text's right edge at left edge of viewport (offscreen left)
    const endX = -(vw + textWidth);

    animate(slideEl, {
        translateX: [startX, endX],
        duration: SLIDE_DURATION_MS,
        delay: SLIDE_DELAY_MS,
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
