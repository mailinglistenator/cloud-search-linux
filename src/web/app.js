// Cloud Search Lite Frontend Logic

const state = {
  query: '',
  remote: '',
  type: '',
  results: [],
  selectedIndex: 0,
  isSyncing: false,
  totalFiles: 0,
  pollTimer: null,
  searchTimer: null
};

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const resultsContainer = document.getElementById('resultsContainer');
const resultsCount = document.getElementById('resultsCount');
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchStats();
  checkSyncStatus();
  performSearch();
});

function setupEventListeners() {
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

  // Remote Filters
  document.querySelectorAll('#remoteFilters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#remoteFilters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.remote = chip.dataset.remote || '';
      performSearch();
    });
  });

  // Type Filters
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

  // Keyboard Shortcuts
  window.addEventListener('keydown', handleGlobalKeydown);
}

function handleGlobalKeydown(e) {
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

  // Enter to Open
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

// Search Execution
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
  return str.replace(/[&<>"']/g, m => ({
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
        <button class="action-btn" title="Open Folder in Nemo (Enter)" onclick="revealInFolder('${escapeHtml(item.local_path)}', true)">
          📁 Open Folder
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
          📁 Folder
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

// System Actions
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

// Stats & Sync
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();
    state.totalFiles = data.total_files || 0;
    totalFilesEl.textContent = `${state.totalFiles.toLocaleString()} files indexed`;

    const lastSyncs = data.remotes
      .filter(r => r.last_synced_at)
      .map(r => `${r.name}: ${r.last_synced_at}`);

    if (lastSyncs.length > 0) {
      syncTimeEl.textContent = lastSyncs.join(' | ');
    } else {
      syncTimeEl.textContent = 'Never synced';
    }
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
        performSearch();
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
