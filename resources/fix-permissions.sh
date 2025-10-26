#!/bin/bash
# Fix permissions script for Fidelix Updater plugin
# This script configures all necessary permissions and dependencies

set -e  # Exit on error

PLUGIN_DIR="/srv/plugins/fidelixUpdater"
LOG_FILE="$PLUGIN_DIR/data/logs/fix-permissions.log"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========================================="
log "Starting Fidelix Updater permissions fix"
log "========================================="

# Step 1: Add www-data to dialout group
log "Step 1: Adding www-data to dialout group..."
if groups www-data | grep -q '\bdialout\b'; then
    log "✓ www-data already in dialout group"
else
    usermod -a -G dialout www-data
    if [ $? -eq 0 ]; then
        log "✓ www-data added to dialout group successfully"
    else
        log "✗ Failed to add www-data to dialout group"
        exit 1
    fi
fi

# Step 2: Create necessary directories
log "Step 2: Creating necessary directories..."
mkdir -p "$PLUGIN_DIR/data/filetransfer"
mkdir -p "$PLUGIN_DIR/data/status"
mkdir -p "$PLUGIN_DIR/data/logs"
chown -R www-data:www-data "$PLUGIN_DIR/data"
chmod -R 775 "$PLUGIN_DIR/data"
log "✓ Directories created and permissions set"

# Step 3: Install Node.js dependencies
log "Step 3: Installing Node.js dependencies..."
if [ -d "$PLUGIN_DIR/3rdparty/Fidelix/FxLib" ]; then
    cd "$PLUGIN_DIR/3rdparty/Fidelix/FxLib"

    if [ -f "package.json" ]; then
        if [ ! -d "node_modules" ]; then
            log "Installing npm packages..."
            npm install --silent 2>&1 | tee -a "$LOG_FILE"
            if [ $? -eq 0 ]; then
                log "✓ Node.js dependencies installed successfully"
            else
                log "✗ Failed to install Node.js dependencies"
                exit 1
            fi
        else
            log "✓ Node.js dependencies already installed"
        fi
    else
        log "⚠ No package.json found, skipping npm install"
    fi
else
    log "⚠ FxLib directory not found, skipping npm install"
fi

# Step 4: Check serial ports
log "Step 4: Checking serial ports..."
SERIAL_PORTS=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || echo "")
if [ -n "$SERIAL_PORTS" ]; then
    log "✓ Serial ports found:"
    for port in $SERIAL_PORTS; do
        log "  - $port ($(stat -c '%A %G' $port))"
    done
else
    log "⚠ No serial ports detected (this is normal if no USB device is connected)"
fi

# Step 5: Reload PHP-FPM to apply group changes
log "Step 5: Reloading PHP-FPM..."
if command -v php-fpm >/dev/null 2>&1; then
    pkill -USR2 php-fpm 2>/dev/null || true
    log "✓ PHP-FPM reload signal sent"
else
    log "⚠ php-fpm not found, restart manually if needed"
fi

log "========================================="
log "Configuration completed successfully!"
log "========================================="

exit 0
