// Theme toggle: attach immediately (no DOMContentLoaded) so it works on home page reload.
// Capture phase so it runs before any other handler.
document.addEventListener('click', function themeToggleHandler(e) {
    const toggleBtn = e.target.closest('#theme-toggle');
    if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }
}, true);

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
            const newContent = fetchedContent.innerHTML;
            const newTitle = doc.title;
            const newNav = doc.querySelector('nav').innerHTML;

            // Update page (sync #content class so e.g. .content-with-draggable applies when returning to home)
            const contentEl = document.getElementById('content');
            contentEl.innerHTML = newContent;
            contentEl.className = fetchedContent.className || '';
            document.title = newTitle;
            document.querySelector('nav').innerHTML = newNav;

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

//Colors theme
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggleThemeButton = document.getElementById('theme-toggle');
    if (toggleThemeButton) {
        const label = theme === 'dark' ? 'Activate light mode' : 'Activate dark mode';
        toggleThemeButton.setAttribute('aria-label', label);
    }
}
// Colors theme
function initializeTheme() {
    const saved = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = saved || (prefersLight ? 'light' : 'dark');
    applyTheme(theme);
}