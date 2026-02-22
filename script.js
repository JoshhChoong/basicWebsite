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

//Colors theme (exposed for resume-draggable lightbulb icon)
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}
window.applyTheme = applyTheme;
// Colors theme — default to light regardless of system preference
function initializeTheme() {
    const saved = localStorage.getItem('theme');
    const theme = saved || 'light';
    applyTheme(theme);
}