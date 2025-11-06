#!/usr/bin/env bash

set -e

BASEDIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
PLUGIN_DIR="$BASEDIR/.."

echo "=================================================="
echo "Fidelix Updater - Dependencies installation"
echo "=================================================="

# ================================================
# Step 1: Fix permissions
# ================================================
echo ""
echo "Step 1/3: Fixing file permissions..."
if [ -f "$BASEDIR/fix-permissions.sh" ]; then
    bash "$BASEDIR/fix-permissions.sh"
    if [ $? -eq 0 ]; then
        echo "✓ Permissions fixed successfully"
    else
        echo "⚠ Warning: Permissions script returned an error, continuing anyway..."
    fi
else
    echo "⚠ Warning: fix-permissions.sh not found, skipping..."
fi

# ================================================
# Step 2: Check/Install NodeJS using Jeedom's script
# ================================================
echo ""
echo "Step 2/3: Checking NodeJS installation..."

JEEDOM_NODEJS_SCRIPT="$PLUGIN_DIR/../../../resources/install_nodejs.sh"

if [ -f "$JEEDOM_NODEJS_SCRIPT" ]; then
    echo "Using Jeedom's official NodeJS installation script..."
    bash "$JEEDOM_NODEJS_SCRIPT"
    if [ $? -eq 0 ]; then
        echo "✓ NodeJS installation/verification completed"
    else
        echo "ERROR: Jeedom's NodeJS installation script failed"
        exit 1
    fi
else
    echo "⚠ Warning: Jeedom's NodeJS script not found at $JEEDOM_NODEJS_SCRIPT"
    echo "Checking if NodeJS is already installed..."

    type node &>/dev/null
    if [ $? -eq 0 ]; then
        actual=$(node -v)
        minVer='20'
        testVer=$(php -r "echo version_compare('${actual}','v${minVer}','>=');")
        if [[ $testVer == "1" ]]; then
            echo "✓ NodeJS version is sufficient (${actual} >= v${minVer})"
        else
            echo "ERROR: NodeJS version ${actual} is too old (need v${minVer}+)"
            echo "Please install NodeJS 20+ manually or use Jeedom's installation script"
            exit 1
        fi
    else
        echo "ERROR: NodeJS is not installed and Jeedom's script is not available"
        echo "Please install NodeJS 20+ manually"
        exit 1
    fi
fi

# ================================================
# Step 3: Install Node.js dependencies
# ================================================
echo ""
echo "Step 3/3: Installing plugin Node.js dependencies..."

if [ -d "$PLUGIN_DIR/3rdparty/Fidelix/FxLib" ]; then
    cd "$PLUGIN_DIR/3rdparty/Fidelix/FxLib"

    if [ -f "package.json" ]; then
        echo "Installing npm packages..."
        npm install --silent
        if [ $? -eq 0 ]; then
            echo "✓ Node.js dependencies installed successfully"
        else
            echo "ERROR: Failed to install Node.js dependencies"
            exit 1
        fi
    else
        echo "⚠ No package.json found in FxLib directory"
    fi
else
    echo "ERROR: FxLib directory not found at $PLUGIN_DIR/3rdparty/Fidelix/FxLib"
    exit 1
fi

echo ""
echo "=================================================="
echo "✓ Dependencies installation completed successfully"
echo "=================================================="
