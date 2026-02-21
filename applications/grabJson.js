/**
 * grabJson.js – Fetches overview.json from each application subdirectory
 * and renders a flexbox-based list of entries.
 * Exposes renderAppEntries() so script.js can run it after nav-injected content.
 */

(function () {
  const SUBDIRS = ['pennylane', 'ragllmdronechatbot'];

  function fetchOverview(basePath, subdir) {
    const url = basePath ? `${basePath}/${subdir}/overview.json` : `${subdir}/overview.json`;
    return fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }

  function createEntryCard(data, basePath) {
    if (!data || !data.subpageName) return null;

    const card = document.createElement('div');
    card.className = 'blog-entry app-entry';

    const link = document.createElement('a');
    link.href = `${data.subpageName}/`;
    link.className = 'nav-link app-entry-link';

    const title = document.createElement('h3');
    title.className = 'app-entry-title';
    title.textContent = data.title || data.subpageName;
    link.appendChild(title);

    if (data.headerImage) {
      const imgSrc = basePath
        ? `${basePath}/${data.subpageName}/${data.headerImage}`
        : `${data.subpageName}/${data.headerImage}`;
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = data.title || data.subpageName;
      img.className = 'app-entry-header-img';
      link.appendChild(img);
    }

    const meta = document.createElement('div');
    meta.className = 'app-entry-meta';
    meta.textContent = [data.author, data.date].filter(Boolean).join(' · ');

    const keywords = document.createElement('div');
    keywords.className = 'app-entry-keywords';
    if (data.keywords && data.keywords.length) {
      data.keywords.forEach((kw) => {
        const tag = document.createElement('span');
        tag.className = 'app-entry-tag';
        tag.textContent = kw;
        keywords.appendChild(tag);
      });
    }

    link.appendChild(meta);
    link.appendChild(keywords);
    card.appendChild(link);

    return card;
  }

  function renderAppEntries() {
    const container = document.querySelector('.blog-container');
    if (!container) return;

    const basePath = location.pathname.includes('applications') ? '' : 'applications';
    Promise.all(SUBDIRS.map((subdir) => fetchOverview(basePath, subdir))).then((entries) => {
      container.innerHTML = '';
      entries
        .filter(Boolean)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach((data) => {
          const card = createEntryCard(data, basePath);
          if (card) container.appendChild(card);
        });
    });
  }

  window.renderAppEntries = renderAppEntries;

  if (document.querySelector('.blog-container')) {
    renderAppEntries();
  }
})();
