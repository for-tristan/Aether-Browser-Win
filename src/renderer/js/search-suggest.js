// search-suggest.js — Address bar search suggestions + autocomplete
window.Aether = window.Aether || {};

Aether.SearchSuggest = (() => {
  let suggestions = [];
  let activeIndex = -1;
  let dropdown = null;
  let input = null;
  let onNavigate = null;
  let debounceTimer = null;

  function init(inputEl, dropdownEl, navigateCb) {
    input = inputEl;
    dropdown = dropdownEl;
    onNavigate = navigateCb;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchSuggestions(input.value), 150);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
      if (e.key === 'Enter') {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          navigateTo(suggestions[activeIndex]);
        } else {
          // No suggestion selected — just hide the dropdown, let the form submit normally
          hide();
        }
      }
      if (e.key === 'Escape') { hide(); input.blur(); }
    });
    input.addEventListener('blur', () => setTimeout(hide, 150));
    input.addEventListener('focus', () => { if (input.value) fetchSuggestions(input.value); });
  }

  async function fetchSuggestions(query) {
    if (!query || query.length < 2) { hide(); return; }
    // Combine: history matches + bookmark matches + search engine suggestions
    const historyMatches = Aether.History.search(query).slice(0, 4).map(h => ({
      type: 'history', label: h.title, sublabel: h.url, url: h.url, icon: 'history'
    }));
    const bookmarkMatches = Aether.Bookmarks.search(query).slice(0, 3).map(b => ({
      type: 'bookmark', label: b.title, sublabel: b.url, url: b.url, icon: 'star'
    }));

    let searchMatches = [];
    try {
      // Use DuckDuckGo's autocomplete API (no key needed, CORS-friendly)
      const res = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`);
      const data = await res.json();
      if (Array.isArray(data) && data[1]) {
        searchMatches = data[1].slice(0, 5).map(q => ({
          type: 'search', label: q, sublabel: 'Search for "' + q + '"',
          url: null, rawQuery: q, icon: 'search'
        }));
      }
    } catch {}

    suggestions = [...historyMatches, ...bookmarkMatches, ...searchMatches];
    activeIndex = -1;
    render();
  }

  function moveSelection(delta) {
    if (!suggestions.length) return;
    activeIndex = (activeIndex + delta + suggestions.length) % suggestions.length;
    render();
    const items = dropdown.querySelectorAll('.suggest-item');
    if (items[activeIndex]) items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function navigateTo(s) {
    hide(); // hide dropdown FIRST, before navigating
    if (s.url) {
      onNavigate(s.url, s.label);
    } else if (s.rawQuery) {
      onNavigate(s.rawQuery, s.label);
    }
  }

  function render() {
    if (!suggestions.length) { hide(); return; }
    dropdown.innerHTML = suggestions.map((s, i) => `
      <div class="suggest-item ${i === activeIndex ? 'active' : ''}" data-idx="${i}">
        <span class="suggest-icon suggest-${s.icon}">${iconSvg(s.icon)}</span>
        <div class="suggest-text">
          <div class="suggest-label">${escapeHtml(s.label)}</div>
          <div class="suggest-sub">${escapeHtml(s.sublabel || '')}</div>
        </div>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.suggest-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx);
        if (suggestions[idx]) navigateTo(suggestions[idx]);
      });
    });
  }

  function iconSvg(icon) {
    const icons = {
      history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
      star: '<svg viewBox="0 0 24 24"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>',
      search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    };
    return icons[icon] || icons.search;
  }

  function escapeHtml(s) { return s.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

  function hide() {
    if (dropdown) dropdown.classList.add('hidden');
    suggestions = [];
    activeIndex = -1;
  }

  return { init, hide };
})();
