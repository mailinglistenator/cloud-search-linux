#!/usr/bin/env bash
set -e

# Cloud Search Linux Uninstaller
BIN_LINK="$HOME/.local/bin/cloud-search-lite"
DESKTOP_FILE="$HOME/.local/share/applications/cloud-search-lite.desktop"
CONFIG_DIR="$HOME/.config/cloud-search-lite"

echo "Uninstalling Cloud Search Linux..."

if [ -f "$BIN_LINK" ]; then
    rm -f "$BIN_LINK"
    echo "Removed $BIN_LINK"
fi

if [ -f "$DESKTOP_FILE" ]; then
    rm -f "$DESKTOP_FILE"
    echo "Removed $DESKTOP_FILE"
fi

if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

echo ""
echo "Uninstalled launcher and desktop menu items."
echo "If you also want to remove your local configuration and browser profile cache, run:"
echo "  rm -rf \"$CONFIG_DIR\""
echo ""
