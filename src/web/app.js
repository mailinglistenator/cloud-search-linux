// Cloud Search Lite Frontend Logic - v2.0 Dual-Mode (Search & Explorer)

const state = {
  // Current Mode: 'search' | 'explorer'
  mode: 'search',

  // Search Mode State
  query: '',
  remote: '',
  type: '',
  results: [],
  selectedIndex: 0,
  searchTimer: null,

  // Shared / General State
  isSyncing: false,
  totalFiles: 0,
  remotes: [],
  pollTimer: null,

  // Cloud Explorer State
  explorerRemote: '',
  explorerPath: '',
  explorerParentPath: null,
  explorerItems: [],
  explorerFilteredItems: [],
  explorerFilter: '',
  explorerSelectedIndex: -1,
  explorerViewMode: 'list', // 'list' | 'grid'
  contextItem: null
};

// Mode Switcher Elements
const modeSearchBtn = document.getElementById('modeSearchBtn');
const modeExplorerBtn = document.getElementById('modeExplorerBtn');
const searchSection = document.getElementById('searchSection');
const searchStatusBar = document.getElementById('searchStatusBar');
const resultsContainer = document.getElementById('resultsContainer');

// Search Mode Elements
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const resultsCount = document.getElementById('resultsCount');

// Header & Sync Elements
const totalFilesEl = document.getElementById('totalFiles');
const syncTimeEl = document.getElementById('syncTime');
const syncBtn = document.getElementById('syncBtn');
const syncIcon = document.getElementById('syncIcon');
const syncBtnText = document.getElementById('syncBtnText');
const syncBanner = document.getElementById('syncProgressBanner');
const syncText = document.getElementById('syncProgressText');
const syncCount = document.getElementById('syncProgressCount');
const initialSyncBtn = document.getElementById('initialSyncBtn');
const toastEl = document.getElementById('toast');

// Explorer Mode Elements
const explorerSection = document.getElementById('explorerSection');
const explorerUpBtn = document.getElementById('explorerUpBtn');
const explorerRefreshBtn = document.getElementById('explorerRefreshBtn');
const explorerDrives = document.getElementById('explorerDrives');
const viewListBtn = document.getElementById('viewListBtn');
const viewGridBtn = document.getElementById('viewGridBtn');
const explorerBreadcrumbs = document.getElementById('explorerBreadcrumbs');
const explorerFilterInput = document.getElementById('explorerFilterInput');
const clearExplorerFilterBtn = document.getElementById('clearExplorerFilterBtn');
const explorerCountsText = document.getElementById('explorerCountsText');
const explorerSizeText = document.getElementById('explorerSizeText');
const explorerLatencyText = document.getElementById('explorerLatencyText');
const explorerContainer = document.getElementById('explorerContainer');

// Context Menu Elements
const explorerContextMenu = document.getElementById('explorerContextMenu');
const ctxOpen = document.getElementById('ctxOpen');
const ctxReveal = document.getElementById('ctxReveal');
const ctxCopyPath = document.getElementById('ctxCopyPath');
const ctxCopyCloudPath = document.getElementById('ctxCopyCloudPath');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchStats();
  checkSyncStatus();
  performSearch();
});

function setupEventListeners() {
  // Mode Switcher buttons
  if (modeSearchBtn) {
    modeSearchBtn.addEventListener('click', () => setMode('search'));
  }
  if (modeExplorerBtn) {
    modeExplorerBtn.addEventListener('click', () => setMode('explorer'));
  }

  // Search Input with Debounce
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    clearSearchBtn.classList.toggle('hidden', !state.query);

    // Auto-highlight folders chip if user types folder: or dir:
    if (state.query.toLowerCase().startsWith('folder:') || state.query.toLowerCase().startsWith('dir:')) {
      document.querySelectorAll('#typeFilters .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.type === 'folders');
      });
      state.type = 'folders';
    }

    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      performSearch();
    }, 80);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
    performSearch();
  });

  // Remote Filters (Search Mode)
  document.querySelectorAll('#remoteFilters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#remoteFilters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.remote = chip.dataset.remote || '';
      performSearch();
    });
  });

  // Type Filters (Search Mode)
  document.querySelectorAll('#typeFilters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#typeFilters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.type = chip.dataset.type || '';
      performSearch();
    });
  });

  // Sync Buttons
  syncBtn.addEventListener('click', startSync);
  if (initialSyncBtn) {
    initialSyncBtn.addEventListener('click', startSync);
  }

  // Explorer Nav Controls
  if (explorerUpBtn) {
    explorerUpBtn.addEventListener('click', () => {
      if (state.explorerParentPath !== null) {
        loadFolder(state.explorerRemote, state.explorerParentPath);
      }
    });
  }
  if (explorerRefreshBtn) {
    explorerRefreshBtn.addEventListener('click', () => {
      loadFolder(state.explorerRemote, state.explorerPath);
    });
  }

  // Explorer View Toggle
  if (viewListBtn) {
    viewListBtn.addEventListener('click', () => setViewMode('list'));
  }
  if (viewGridBtn) {
    viewGridBtn.addEventListener('click', () => setViewMode('grid'));
  }

  // Explorer Live Filter
  if (explorerFilterInput) {
    explorerFilterInput.addEventListener('input', (e) => {
      state.explorerFilter = e.target.value;
      if (clearExplorerFilterBtn) {
        clearExplorerFilterBtn.classList.toggle('hidden', !state.explorerFilter);
      }
      applyExplorerFilter();
    });
  }
  if (clearExplorerFilterBtn) {
    clearExplorerFilterBtn.addEventListener('click', () => {
      explorerFilterInput.value = '';
      state.explorerFilter = '';
      clearExplorerFilterBtn.classList.add('hidden');
      explorerFilterInput.focus();
      applyExplorerFilter();
    });
  }

  // Context Menu Actions
  if (ctxOpen) {
    ctxOpen.addEventListener('click', () => {
      hideContextMenu();
      if (!state.contextItem) return;
      if (state.contextItem.is_dir) {
        loadFolder(state.explorerRemote, state.contextItem.rel_path);
      } else {
        openFile(state.contextItem.local_path);
      }
    });
  }
  if (ctxReveal) {
    ctxReveal.addEventListener('click', () => {
      hideContextMenu();
      if (!state.contextItem) return;
      revealInFolder(state.contextItem.local_path, state.contextItem.is_dir);
    });
  }
  if (ctxCopyPath) {
    ctxCopyPath.addEventListener('click', () => {
      hideContextMenu();
      if (!state.contextItem) return;
      copyToClipboard(state.contextItem.local_path);
    });
  }
  if (ctxCopyCloudPath) {
    ctxCopyCloudPath.addEventListener('click', () => {
      hideContextMenu();
      if (!state.contextItem) return;
      const cloudPath = `${state.contextItem.remote_id}:${state.contextItem.rel_path}`;
      copyToClipboard(cloudPath);
    });
  }

  // Hide context menu on global click or blur
  document.addEventListener('click', (e) => {
    if (explorerContextMenu && !explorerContextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', handleGlobalKeydown);
}

// Mode Management
function setMode(newMode) {
  state.mode = newMode;
  const isSearch = newMode === 'search';

  if (modeSearchBtn) modeSearchBtn.classList.toggle('active', isSearch);
  if (modeExplorerBtn) modeExplorerBtn.classList.toggle('active', !isSearch);

  if (searchSection) searchSection.classList.toggle('hidden', !isSearch);
  if (searchStatusBar) searchStatusBar.classList.toggle('hidden', !isSearch);
  if (resultsContainer) resultsContainer.classList.toggle('hidden', !isSearch);
  if (explorerSection) explorerSection.classList.toggle('hidden', isSearch);

  hideContextMenu();

  if (isSearch) {
    searchInput.focus();
    searchInput.select();
  } else {
    // If explorer remote not set yet, pick first available
    if (!state.explorerRemote && state.remotes.length > 0) {
      state.explorerRemote = state.remote || state.remotes[0].id;
    }
    renderExplorerDrives();
    if (!state.explorerItems.length && state.explorerRemote) {
      loadFolder(state.explorerRemote, state.explorerPath || '');
    }
  }
}

function switchToExplorer(remoteId, relPath) {
  state.explorerRemote = remoteId;
  state.explorerPath = relPath;
  setMode('explorer');
  loadFolder(remoteId, relPath);
}

function setViewMode(mode) {
  state.explorerViewMode = mode;
  if (viewListBtn) viewListBtn.classList.toggle('active', mode === 'list');
  if (viewGridBtn) viewGridBtn.classList.toggle('active', mode === 'grid');
  if (explorerContainer) {
    explorerContainer.classList.toggle('list-view', mode === 'list');
    explorerContainer.classList.toggle('grid-view', mode === 'grid');
  }
  renderExplorerItems();
}

// Keyboard Handling
function handleGlobalKeydown(e) {
  hideContextMenu();

  // Ctrl+E toggles between Search and Explorer mode
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    setMode(state.mode === 'search' ? 'explorer' : 'search');
    return;
  }

  // Mode: Search Keybindings
  if (state.mode === 'search') {
    // Slash '/' to focus search
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Escape to clear search or unfocus
    if (e.key === 'Escape') {
      if (searchInput.value) {
        searchInput.value = '';
        state.query = '';
        clearSearchBtn.classList.add('hidden');
        performSearch();
      } else {
        searchInput.blur();
      }
      return;
    }

    // Arrow Down
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.results.length > 0) {
        state.selectedIndex = Math.min(state.selectedIndex + 1, state.results.length - 1);
        updateSelection();
      }
      return;
    }

    // Arrow Up
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.results.length > 0) {
        state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
        updateSelection();
      }
      return;
    }

    // Enter to Open / Reveal
    if (e.key === 'Enter' && state.results.length > 0) {
      const selected = state.results[state.selectedIndex];
      if (selected) {
        e.preventDefault();
        if (selected.is_dir || e.ctrlKey || e.altKey) {
          revealInFolder(selected.local_path);
        } else {
          openFile(selected.local_path);
        }
      }
      return;
    }
  }

  // Mode: Explorer Keybindings
  if (state.mode === 'explorer') {
    const isInputActive = document.activeElement === explorerFilterInput;

    // Slash '/' to switch to search mode
    if (e.key === '/' && !isInputActive) {
      e.preventDefault();
      setMode('search');
      return;
    }

    // Escape to clear filter or blur
    if (e.key === 'Escape') {
      if (explorerFilterInput.value) {
        explorerFilterInput.value = '';
        state.explorerFilter = '';
        clearExplorerFilterBtn.classList.add('hidden');
        applyExplorerFilter();
      } else if (isInputActive) {
        explorerFilterInput.blur();
      }
      return;
    }

    // Backspace or Alt+Up to navigate up one level
    if ((e.key === 'Backspace' && !isInputActive) || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      if (state.explorerParentPath !== null) {
        loadFolder(state.explorerRemote, state.explorerParentPath);
      }
      return;
    }

    // Arrow Navigation in Explorer
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.explorerFilteredItems.length > 0) {
        state.explorerSelectedIndex = Math.min(state.explorerSelectedIndex + 1, state.explorerFilteredItems.length - 1);
        updateExplorerSelection();
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.explorerFilteredItems.length > 0) {
        state.explorerSelectedIndex = Math.max(state.explorerSelectedIndex - 1, 0);
        updateExplorerSelection();
      }
      return;
    }

    // Enter to Open / Enter Folder
    if (e.key === 'Enter') {
      if (state.explorerSelectedIndex >= 0 && state.explorerSelectedIndex < state.explorerFilteredItems.length) {
        e.preventDefault();
        const selected = state.explorerFilteredItems[state.explorerSelectedIndex];
        if (e.ctrlKey) {
          // Ctrl+Enter: reveal in Nemo
          revealInFolder(selected.local_path, selected.is_dir);
        } else if (selected.is_dir) {
          loadFolder(state.explorerRemote, selected.rel_path);
        } else {
          openFile(selected.local_path);
        }
      }
      return;
    }
  }
}

function updateSelection() {
  const cards = resultsContainer.querySelectorAll('.result-card');
  cards.forEach((card, i) => {
    const isSelected = i === state.selectedIndex;
    card.classList.toggle('selected', isSelected);
    if (isSelected) {
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function updateExplorerSelection() {
  const items = explorerContainer.querySelectorAll('.explorer-row, .explorer-grid-card');
  items.forEach((el, i) => {
    const isSelected = i === state.explorerSelectedIndex;
    el.classList.toggle('selected', isSelected);
    if (isSelected) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

// Search Mode Execution
async function performSearch() {
  const params = new URLSearchParams({
    q: state.query,
    limit: 100
  });
  if (state.remote) params.append('remote', state.remote);
  if (state.type) params.append('type', state.type);

  try {
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error('Search request failed');
    const data = await res.json();
    
    state.results = data.results || [];
    state.selectedIndex = 0;
    renderResults(data);
  } catch (err) {
    console.error('Search error:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function highlightMatches(text, query) {
  if (!text || !query) return escapeHtml(text);
  const words = query.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return escapeHtml(text);

  try {
    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  } catch (e) {
    return escapeHtml(text);
  }
}

function renderResults(data) {
  const count = data.total || 0;
  const time = data.elapsed_ms || 0;
  
  resultsCount.textContent = `${count.toLocaleString()} results (${time} ms)`;

  if (count === 0) {
    if (!state.query && state.totalFiles === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
          </svg>
          <h3>Your Cloud Drives are ready to index</h3>
          <p>Click "Sync Index" to download a fast snapshot of your cloud files directly via cloud APIs.</p>
          <button class="btn btn-primary" onclick="startSync()">Start Initial Cloud Sync</button>
        </div>
      `;
    } else {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <h3>No matching files found</h3>
          <p>Try refining your search terms or selecting "All Drives".</p>
        </div>
      `;
    }
    return;
  }

  const html = state.results.map((item, index) => {
    const isSelected = index === state.selectedIndex;
    const isFolder = Boolean(item.is_dir);
    const ext = item.extension || (isFolder ? 'dir' : 'file');
    const highlightedName = highlightMatches(item.filename, state.query);
    const highlightedPath = highlightMatches(item.rel_path, state.query);

    const iconHtml = isFolder 
      ? `<div class="file-icon folder">📁</div>` 
      : `<div class="file-icon">${escapeHtml(ext.slice(0, 4))}</div>`;

    const actionsHtml = isFolder ? `
      <div class="result-actions" onclick="event.stopPropagation()">
        <button class="action-btn" title="Explore in Cloud Explorer" onclick="switchToExplorer('${escapeHtml(item.remote_id)}', '${escapeHtml(item.rel_path)}')">
          ⚡ Explore
        </button>
        <button class="action-btn" title="Open Folder in Nemo (Enter)" onclick="revealInFolder('${escapeHtml(item.local_path)}', true)">
          📁 Nemo
        </button>
        <button class="action-btn" title="Copy Path" onclick="copyToClipboard('${escapeHtml(item.local_path)}')">
          📋
        </button>
      </div>
    ` : `
      <div class="result-actions" onclick="event.stopPropagation()">
        <button class="action-btn" title="Open File (Enter)" onclick="openFile('${escapeHtml(item.local_path)}')">
          ⚡ Open
        </button>
        <button class="action-btn" title="Show in Folder (Ctrl+Enter)" onclick="revealInFolder('${escapeHtml(item.local_path)}')">
          📁 Nemo
        </button>
        <button class="action-btn" title="Copy Path" onclick="copyToClipboard('${escapeHtml(item.local_path)}')">
          📋
        </button>
      </div>
    `;

    return `
      <div class="result-card ${isSelected ? 'selected' : ''} ${isFolder ? 'folder-card' : ''}" data-index="${index}" onclick="handleCardClick(${index})">
        <div class="result-left">
          ${iconHtml}
          <div class="file-details">
            <span class="file-name" title="${escapeHtml(item.filename)}">${highlightedName}</span>
            <span class="file-path" title="${escapeHtml(item.rel_path)}">${highlightedPath}</span>
          </div>
        </div>

        <div class="result-meta">
          <span class="remote-badge" style="background: ${item.badge_bg}; color: ${item.remote_color};">
            ${escapeHtml(item.remote_name)}
          </span>
          <span class="size-badge">${item.size_formatted}</span>
          ${actionsHtml}
        </div>
      </div>
    `;
  }).join('');

  resultsContainer.innerHTML = html;
}

function handleCardClick(index) {
  state.selectedIndex = index;
  updateSelection();
  const selected = state.results[index];
  if (selected) {
    if (selected.is_dir) {
      revealInFolder(selected.local_path, true);
    } else {
      openFile(selected.local_path);
    }
  }
}

// ==========================================================================
// Cloud Explorer Functions
// ==========================================================================

function renderExplorerDrives() {
  if (!explorerDrives) return;
  if (!state.remotes || state.remotes.length === 0) {
    explorerDrives.innerHTML = '';
    return;
  }

  explorerDrives.innerHTML = state.remotes.map(r => {
    const isActive = r.id === state.explorerRemote;
    const badgeColor = r.color || '#0078d4';
    return `
      <button class="chip ${isActive ? 'active' : ''}" data-remote="${escapeHtml(r.id)}" style="${isActive ? `background-color: ${badgeColor}; color: #fff;` : ''}">
        <span>${escapeHtml(r.name)}</span>
        <span style="opacity: 0.75; font-size: 11px; margin-left: 4px;">(${r.item_count ? r.item_count.toLocaleString() : 0})</span>
      </button>
    `;
  }).join('');

  explorerDrives.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const rId = chip.dataset.remote;
      if (rId !== state.explorerRemote) {
        state.explorerRemote = rId;
        state.explorerPath = '';
        renderExplorerDrives();
        loadFolder(rId, '');
      }
    });
  });
}

async function loadFolder(remoteId, folderPath = '') {
  if (!remoteId) {
    if (state.remotes.length > 0) {
      remoteId = state.remotes[0].id;
      state.explorerRemote = remoteId;
    } else {
      return;
    }
  }

  const params = new URLSearchParams({
    remote: remoteId,
    path: folderPath
  });

  try {
    const res = await fetch(`/api/browse?${params.toString()}`);
    if (!res.ok) throw new Error('Browse failed');
    const data = await res.json();

    state.explorerRemote = data.remote_id;
    state.explorerPath = data.current_path;
    state.explorerParentPath = data.parent_path;
    state.explorerItems = data.items || [];
    state.explorerSelectedIndex = -1;

    // Reset filter
    state.explorerFilter = '';
    if (explorerFilterInput) explorerFilterInput.value = '';
    if (clearExplorerFilterBtn) clearExplorerFilterBtn.classList.add('hidden');

    // Up button status
    if (explorerUpBtn) {
      explorerUpBtn.disabled = (data.parent_path === null || data.current_path === '');
    }

    // Status bar counts & latency
    if (explorerCountsText) {
      explorerCountsText.textContent = `${data.folder_count.toLocaleString()} folders, ${data.file_count.toLocaleString()} files`;
    }
    if (explorerSizeText) {
      explorerSizeText.textContent = data.total_size_formatted;
    }
    if (explorerLatencyText) {
      explorerLatencyText.textContent = `${data.elapsed_ms} ms`;
    }

    // Render breadcrumbs
    renderExplorerBreadcrumbs(data.breadcrumbs);

    // Filter and render items
    applyExplorerFilter();
  } catch (err) {
    console.error('Error loading folder:', err);
    showToast('Failed to load folder');
  }
}

function renderExplorerBreadcrumbs(breadcrumbs) {
  if (!explorerBreadcrumbs) return;
  if (!breadcrumbs || breadcrumbs.length === 0) {
    explorerBreadcrumbs.innerHTML = `<span class="breadcrumb-crumb active">${escapeHtml(state.explorerRemote)}</span>`;
    return;
  }

  const html = breadcrumbs.map((crumb, idx) => {
    const isLast = idx === breadcrumbs.length - 1;
    const crumbHtml = isLast
      ? `<span class="breadcrumb-crumb active" title="${escapeHtml(crumb.name)}">${escapeHtml(crumb.name)}</span>`
      : `<span class="breadcrumb-crumb" title="${escapeHtml(crumb.name)}" data-path="${escapeHtml(crumb.path)}">${escapeHtml(crumb.name)}</span>`;
    
    if (idx < breadcrumbs.length - 1) {
      return `${crumbHtml}<span class="breadcrumb-separator">›</span>`;
    }
    return crumbHtml;
  }).join('');

  explorerBreadcrumbs.innerHTML = html;

  explorerBreadcrumbs.querySelectorAll('.breadcrumb-crumb:not(.active)').forEach(el => {
    el.addEventListener('click', () => {
      const targetPath = el.dataset.path;
      loadFolder(state.explorerRemote, targetPath);
    });
  });
}

function applyExplorerFilter() {
  const filter = (state.explorerFilter || '').trim().toLowerCase();
  if (!filter) {
    state.explorerFilteredItems = [...state.explorerItems];
  } else {
    state.explorerFilteredItems = state.explorerItems.filter(item =>
      item.filename.toLowerCase().includes(filter)
    );
  }
  renderExplorerItems();
}

function getFileIconEmoji(item) {
  if (item.is_dir) return '📁';
  const ext = (item.extension || '').toLowerCase();
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].includes(ext)) return '🖼️';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv'].includes(ext)) return '🎬';
  if (['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma'].includes(ext)) return '🎵';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) return '📦';
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(ext)) return '📄';
  if (['xls', 'xlsx', 'ods', 'csv', 'tsv'].includes(ext)) return '📊';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return '📽️';
  if (['py', 'js', 'ts', 'html', 'css', 'json', 'sh', 'c', 'cpp', 'rs', 'go', 'java', 'sql'].includes(ext)) return '💻';
  
  return '📄';
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr.slice(0, 16).replace('T', ' ');
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch (e) {
    return isoStr.slice(0, 16).replace('T', ' ');
  }
}

function renderExplorerItems() {
  if (!explorerContainer) return;

  if (state.explorerFilteredItems.length === 0) {
    if (state.explorerFilter) {
      explorerContainer.innerHTML = `
        <div class="empty-state">
          <h3>No matching files</h3>
          <p>No items in this folder match "${escapeHtml(state.explorerFilter)}".</p>
        </div>
      `;
    } else {
      explorerContainer.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
          </svg>
          <h3>This folder is empty</h3>
          <p>No files or subfolders found in this directory.</p>
        </div>
      `;
    }
    return;
  }

  if (state.explorerViewMode === 'grid') {
    renderExplorerGridView();
  } else {
    renderExplorerListView();
  }
}

function renderExplorerListView() {
  const html = state.explorerFilteredItems.map((item, idx) => {
    const isSelected = idx === state.explorerSelectedIndex;
    const icon = getFileIconEmoji(item);
    const highlightedName = highlightMatches(item.filename, state.explorerFilter);
    const sizeDisplay = item.is_dir ? '--' : item.size_formatted;
    const dateDisplay = formatDate(item.mtime);

    return `
      <div class="explorer-row ${item.is_dir ? 'is-folder' : ''} ${isSelected ? 'selected' : ''}" data-index="${idx}">
        <div class="explorer-row-icon">${icon}</div>
        <div class="explorer-row-name" title="${escapeHtml(item.filename)}">${highlightedName}</div>
        <div class="explorer-row-size">${sizeDisplay}</div>
        <div class="explorer-row-date">${dateDisplay}</div>
      </div>
    `;
  }).join('');

  explorerContainer.innerHTML = html;
  attachExplorerItemEvents();
}

function renderExplorerGridView() {
  const html = state.explorerFilteredItems.map((item, idx) => {
    const isSelected = idx === state.explorerSelectedIndex;
    const icon = getFileIconEmoji(item);
    const metaDisplay = item.is_dir ? 'Folder' : item.size_formatted;

    return `
      <div class="explorer-grid-card ${item.is_dir ? 'is-folder' : ''} ${isSelected ? 'selected' : ''}" data-index="${idx}" title="${escapeHtml(item.filename)}">
        <div class="explorer-grid-icon">${icon}</div>
        <div class="explorer-grid-name">${escapeHtml(item.filename)}</div>
        <div class="explorer-grid-meta">${metaDisplay}</div>
      </div>
    `;
  }).join('');

  explorerContainer.innerHTML = html;
  attachExplorerItemEvents();
}

function attachExplorerItemEvents() {
  const elements = explorerContainer.querySelectorAll('.explorer-row, .explorer-grid-card');
  elements.forEach(el => {
    const idx = parseInt(el.dataset.index, 10);
    const item = state.explorerFilteredItems[idx];
    if (!item) return;

    // Single Click -> Selection
    el.addEventListener('click', (e) => {
      state.explorerSelectedIndex = idx;
      updateExplorerSelection();
    });

    // Double Click -> Open/Enter
    el.addEventListener('dblclick', (e) => {
      if (item.is_dir) {
        loadFolder(state.explorerRemote, item.rel_path);
      } else {
        openFile(item.local_path);
      }
    });

    // Right Click -> Context Menu
    el.addEventListener('contextmenu', (e) => {
      state.explorerSelectedIndex = idx;
      updateExplorerSelection();
      showContextMenu(e, item);
    });
  });
}

function showContextMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  state.contextItem = item;

  if (ctxOpen) {
    const label = ctxOpen.querySelector('span');
    if (label) {
      label.textContent = item.is_dir ? 'Enter Folder' : 'Open File';
    }
  }

  const menuWidth = 180;
  const menuHeight = 160;
  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

  explorerContextMenu.style.left = `${Math.max(8, x)}px`;
  explorerContextMenu.style.top = `${Math.max(8, y)}px`;
  explorerContextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  if (explorerContextMenu) {
    explorerContextMenu.classList.add('hidden');
  }
}

// ==========================================================================
// System Actions (Open, Reveal, Copy)
// ==========================================================================

async function openFile(localPath, isDir = false) {
  try {
    const res = await fetch('/api/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: localPath, is_dir: isDir })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Failed to open');
    } else {
      showToast(data.message || 'Opening...');
    }
  } catch (err) {
    showToast('Error opening item');
  }
}

async function revealInFolder(localPath, isDir = false) {
  try {
    const res = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: localPath, is_dir: isDir })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Failed to open folder');
    } else {
      showToast(data.message || 'Opened folder in Nemo');
    }
  } catch (err) {
    showToast('Error revealing folder');
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Path copied to clipboard');
  }).catch(() => {
    showToast('Could not copy path');
  });
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2200);
}

// ==========================================================================
// Stats & Background Sync
// ==========================================================================

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();
    state.totalFiles = data.total_files || 0;
    state.remotes = data.remotes || [];
    totalFilesEl.textContent = `${state.totalFiles.toLocaleString()} files indexed`;

    const lastSyncs = data.remotes
      .filter(r => r.last_synced_at)
      .map(r => `${r.name}: ${r.last_synced_at}`);

    if (lastSyncs.length > 0) {
      syncTimeEl.textContent = lastSyncs.join(' | ');
    } else {
      syncTimeEl.textContent = 'Never synced';
    }

    // Refresh drive tabs in explorer mode
    renderExplorerDrives();
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function startSync() {
  if (state.isSyncing) return;
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.started) {
      setSyncingState(true);
      pollSyncStatus();
    }
  } catch (err) {
    console.error('Failed to start sync:', err);
  }
}

async function checkSyncStatus() {
  try {
    const res = await fetch('/api/sync/status');
    const status = await res.json();
    if (status.is_syncing) {
      setSyncingState(true);
      pollSyncStatus();
    }
  } catch (e) {}
}

function setSyncingState(isSyncing) {
  state.isSyncing = isSyncing;
  syncBtn.classList.toggle('syncing', isSyncing);
  syncBanner.classList.toggle('hidden', !isSyncing);
  syncBtnText.textContent = isSyncing ? 'Syncing...' : 'Sync Index';
}

function pollSyncStatus() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/sync/status');
      const status = await res.json();

      if (!status.is_syncing) {
        clearInterval(state.pollTimer);
        setSyncingState(false);
        fetchStats();
        if (state.mode === 'search') {
          performSearch();
        } else {
          loadFolder(state.explorerRemote, state.explorerPath);
        }
        showToast('Cloud index update complete!');
        return;
      }

      const remoteName = status.current_remote_name || 'Cloud Drives';
      const count = status.progress_count || 0;
      syncText.textContent = `Syncing ${remoteName}...`;
      syncCount.textContent = `${count.toLocaleString()} files`;
    } catch (e) {
      clearInterval(state.pollTimer);
      setSyncingState(false);
    }
  }, 700);
}
