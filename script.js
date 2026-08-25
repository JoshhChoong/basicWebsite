function initializeTheme() {
    applyTheme('light');
}

function pageBaseUrl(url) {
    const u = new URL(url, location.href);
    const last = u.pathname.split('/').pop();
    if (last && !last.includes('.') && !u.pathname.endsWith('/')) {
        u.pathname += '/';
    }
    return u;
}

function absolutizeRoot(root, pageUrl) {
    if (!root) return;
    const base = pageBaseUrl(pageUrl);
    root.querySelectorAll('[src], [href], [data-resume-href]').forEach((el) => {
        ['src', 'href', 'data-resume-href'].forEach((attr) => {
            if (!el.hasAttribute(attr)) return;
            const value = el.getAttribute(attr);
            if (!value || /^(https?:|data:|blob:|mailto:|javascript:|#)/i.test(value)) return;
            el.setAttribute(attr, new URL(value, base).href);
        });
    });
}

function syncIntroOverlay(doc) {
    const fetchedOverlay = doc.getElementById('intro-overlay');
    const currentOverlay = document.getElementById('intro-overlay');
    if (fetchedOverlay) {
        const overlayHtml = fetchedOverlay.outerHTML;
        if (currentOverlay) {
            currentOverlay.outerHTML = overlayHtml;
        } else {
            const nav = document.querySelector('nav');
            if (nav) nav.insertAdjacentHTML('beforebegin', overlayHtml);
            else document.body.insertAdjacentHTML('afterbegin', overlayHtml);
        }
    } else if (currentOverlay) {
        currentOverlay.remove();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();

    document.body.addEventListener('click', e => {
        // Intercept nav links (and app card links, which use nav-link) so all navigation uses loadPage
        const link = e.target.closest('a.nav-link');
        if (link && !link.target && link.origin === location.origin) {
            e.preventDefault();
            const url = link.href;
            history.pushState(null, null, url);
            loadPage(url);
        }
    });

    // Handle Back/Forward browser buttons
    window.addEventListener('popstate', () => {
        loadPage(location.href);
    });
});

function loadPage(url) {
    fetch(url)
        .then(response => response.text())
        .then(html => {
            // Parse the fetched HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Get the new content and #content element's class (e.g. content-with-draggable on home)
            const fetchedContent = doc.getElementById('content');
            absolutizeRoot(fetchedContent, url);
            absolutizeRoot(doc.getElementById('intro-overlay'), url);
            const newContent = fetchedContent.innerHTML;
            const newTitle = doc.title;
            const newNav = doc.querySelector('nav').innerHTML;

            // Update page (sync #content class so e.g. .content-with-draggable applies when returning to home)
            const contentEl = document.getElementById('content');
            contentEl.innerHTML = newContent;
            contentEl.className = fetchedContent.className || '';
            document.title = newTitle;
            document.querySelector('nav').innerHTML = newNav;
            syncIntroOverlay(doc);

            // Show footer only on home page: add from fetched HTML or remove if not present
            const fetchedFooter = doc.querySelector('footer.footer-bar');
            const currentFooter = document.querySelector('footer.footer-bar');
            if (fetchedFooter) {
                const footerHtml = fetchedFooter.outerHTML;
                if (currentFooter) {
                    currentFooter.outerHTML = footerHtml;
                } else {
                    document.body.insertAdjacentHTML('beforeend', footerHtml);
                }
            } else {
                if (currentFooter) currentFooter.remove();
            }

            // Run app list builder only when the loaded content has the app list container
            if (document.querySelector('.blog-container') && typeof window.renderAppEntries === 'function') {
                window.renderAppEntries();
            }
            // Re-init resume draggable when home content is shown via nav
            document.dispatchEvent(new CustomEvent('contentLoaded', { detail: { url } }));
        })
        .catch(err => console.error('Error loading page:', err));
}

//Colors theme (exposed for resume-draggable lightbulb icon)
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}
window.applyTheme = applyTheme;
initializeTheme();
// Always spawn in light mode; lightbulb can still switch during the session. 