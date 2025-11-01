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

# Step 1: Verify www-data is in dialout group
log "Step 1: Verifying www-data group permissions..."
if groups www-data | grep -q '\bdialout\b'; then
    log "✓ www-data is in dialout group"
else
    log "⚠ www-data is NOT in dialout group - attempting to add..."
    usermod -a -G dialout www-data
    if [ $? -eq 0 ]; then
        log "✓ www-data added to dialout group"
        log "⚠ NOTE: You may need to restart the PHP-FPM service for changes to take effect"
    else
        log "✗ Failed to add www-data to dialout group (this may require manual intervention)"
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
            if command -v npm >/dev/null 2>&1; then
                log "Installing npm packages..."
                npm install --silent 2>&1 | tee -a "$LOG_FILE"
                if [ $? -eq 0 ]; then
                    log "✓ Node.js dependencies installed successfully"
                else
                    log "⚠ Failed to install Node.js dependencies (npm returned error)"
                fi
            else
                log "⚠ npm command not found - Node.js dependencies not installed"
                log "  Please install Node.js and npm manually, then run this script again"
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

log "========================================="
log "Configuration completed successfully!"
log "========================================="

exit 0
