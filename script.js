document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', e => {
        // Check for link with class 'nav-link'
        if (e.target.matches('a.nav-link')) { 
            e.preventDefault(); 
            const url = e.target.href;
            history.pushState(null, null, url);
            loadPage(url);
        }
        //theme toggle 
        const toggleBtn = e.target.closest('#theme-toggle');
        if (toggleBtn) {
            const current = document.documentElement.getAttribute('data-theme');
            const newTheme = current === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
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
            
            // Get the new content
            const newContent = doc.getElementById('content').innerHTML;
            const newTitle = doc.title;
            const newNav = doc.querySelector('nav').innerHTML;

            // Update page
            document.getElementById('content').innerHTML = newContent;
            document.title = newTitle;
            document.querySelector('nav').innerHTML = newNav;

            // Run app list builder when Applications page is shown via nav
            if (typeof window.renderAppEntries === 'function' && url.includes('applications')) {
                window.renderAppEntries();
            }
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
//Colors theme
function initializeTheme() {
    const saved = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = saved || (prefersLight ? 'light' : 'dark');
    applyTheme(theme);
}
//Colors theme
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
});
//Colors theme
initializeTheme();