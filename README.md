# Cloud Search Linux

<p align="center">
  <img src="assets/icon.svg" alt="Cloud Search Linux Icon" width="120" height="120">
</p>

<p align="center">
  <b>Sub-millisecond local desktop search for OneDrive, Google Drive, and cloud storage on Linux.</b>
  <br>
  <i>Zero FUSE crawling overhead. Pure Python standard library & vanilla web technology. Zero bloat.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Language-Python%203-blue.svg" alt="Python 3">
  <img src="https://img.shields.io/badge/Search-SQLite%20FTS5-green.svg" alt="SQLite FTS5">
  <img src="https://img.shields.io/badge/Backend-rclone-orange.svg" alt="rclone">
  <img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="MIT License">
</p>

---

## ⚡ The Problem Cloud Search Linux Solves

If you mount cloud storage on Linux using FUSE (`rclone mount`, `google-drive-ocamlfuse`, etc.), traditional desktop indexers (**FSearch**, **Catfish**, **Recoll**, **Baloo/KRunner**) quickly cause severe issues:
* **Recursive POSIX Crawling**: Standard search tools execute recursive `opendir`/`readdir`/`stat` calls across virtual mounts.
* **API Rate Limiting & Quotas**: Millions of stat calls trigger cloud provider HTTP 429 rate limits and API bans.
* **Kernel & System Freezes**: Deep directory trees cause processes to get trapped in uninterruptible sleep (`request_wait_answer` D-state), locking up your file manager and hanging the system during boot.
* **Fragmented Cloud Web UIs**: Cloud web portals cannot search across multiple providers simultaneously, nor can they launch local desktop applications (PDF viewers, LibreOffice, text editors) directly from search results.

**Cloud Search Linux decouples search indexing from FUSE crawling entirely:**
1. **Metadata API Streaming**: It fetches cloud file and folder hierarchies directly via cloud metadata APIs (`rclone lsf -R --fast-list`), indexing 100,000+ items in seconds.
2. **Local SQLite FTS5 Engine**: Every query executes locally in **~1 ms to 35 ms** with BM25 relevance ranking and zero network traffic.
3. **Desktop Application Bridge**: Open files with `xdg-open` or reveal directories directly in your desktop file manager (**Nemo**, **Nautilus**, **Dolphin**, **Thunar**).

---

## ✨ Features

* 🚀 **Sub-Millisecond Search**: SQLite FTS5 search-as-you-type with prefix matching and BM25 relevance ranking.
* 📁 **First-Class Folder Search**:
  * Dedicated `📁 Folders` filter chip.
  * Direct search syntax: `folder:<name>` or `dir:<name>`.
  * Instant open in your native Linux file manager.
* 🏷️ **Multi-Cloud Aggregation**: Search across **OneDrive**, **Google Drive**, **Dropbox**, and other cloud providers in a unified view.
* 🧩 **Zero Dependencies**: Built strictly using the **Python 3 standard library** and **vanilla HTML/CSS/JavaScript**. No npm, no Electron, no pip packages required.
* ⌨️ **Keyboard-First Workflow**:
  * <kbd>/</kbd> Focus search input
  * <kbd>↑</kbd> / <kbd>↓</kbd> Navigate search results
  * <kbd>Enter</kbd> Open file or folder
  * <kbd>Ctrl</kbd>+<kbd>Enter</kbd> Reveal item in file manager
  * <kbd>Esc</kbd> Clear query or dismiss
* 🖥️ **Desktop App Experience**: Runs as a clean standalone desktop window via your installed browser engine (Brave, Chromium, or Chrome) with single-instance window focusing.
* 💻 **Complete CLI**: Search, check sync status, or trigger background index updates directly from your terminal or shell scripts.

---

## 🛠️ Prerequisites

* **Linux**: Any modern Linux distribution (Ubuntu, Linux Mint, Debian, Arch, Fedora).
* **Python**: Python 3.8 or newer (uses only standard library modules).
* **rclone**: Configured with one or more cloud remotes (`rclone config`).
* **Browser Runtime**: Brave, Chromium, or Google Chrome installed for standalone window mode.

---

## 🚀 Quick Start & Installation

```bash
# 1. Clone the repository
git clone https://github.com/mailinglistenator/cloud-search-linux.git
cd cloud-search-linux

# 2. Run the installer
./install.sh
```

The installer will:
1. Create the `cloud-search-lite` command in `~/.local/bin/`.
2. Install the desktop entry in `~/.local/share/applications/` so you can launch it from your application menu or panel.

---

## ⚙️ Configuration

By default, Cloud Search Linux automatically discovers your configured rclone remotes using `rclone listremotes`.

To customize remote mappings, display names, colors, or local mount locations, create an optional config file at `~/.config/cloud-search-lite/config.json`:

```json
{
  "remotes": {
    "onedrive": {
      "name": "OneDrive",
      "rclone_remote": "onedrive:",
      "mount_path": "~/OneDrive",
      "color": "#0078d4"
    },
    "gdrive": {
      "name": "Google Drive",
      "rclone_remote": "gdrive:",
      "mount_path": "~/GoogleDrive",
      "color": "#34a853"
    }
  }
}
```

---

## 🖥️ Command-Line Usage

In addition to the graphical interface, you can search and manage indexes directly from your terminal:

```bash
# Check index overview and last sync timestamps:
cloud-search-lite status

# Search across all drives:
cloud-search-lite search "report" --limit 10

# Search specifically for folders:
cloud-search-lite search "folder:projects" --limit 5
cloud-search-lite search "dir:photos" --limit 5

# Filter by a specific cloud remote:
cloud-search-lite search "contract" --remote gdrive

# Trigger a background metadata re-sync:
cloud-search-lite sync
cloud-search-lite sync --remote onedrive
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| <kbd>/</kbd> | Focus the search input field |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate through search results |
| <kbd>Enter</kbd> | Open the selected file or folder |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Reveal the selected item's parent directory in file manager |
| <kbd>Esc</kbd> | Clear the current query or unfocus |

---

## 🗑️ Uninstallation

To remove the desktop launcher and executable wrapper:

```bash
./uninstall.sh
```

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

Developed with ❤️ by [mailinglistenator](https://github.com/mailinglistenator).
