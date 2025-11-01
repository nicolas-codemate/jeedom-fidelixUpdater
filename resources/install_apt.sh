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
# Step 2: Check/Install NodeJS
# ================================================
echo ""
echo "Step 2/3: Checking NodeJS installation..."

installVer='20'
minVer='20'

type node &>/dev/null
if [ $? -eq 0 ]; then
    actual=$(node -v)
else
    actual='None'
fi

echo "Current NodeJS version: ${actual}"

testVer=$(php -r "echo version_compare('${actual}','v${minVer}','>=');")
if [[ $testVer == "1" ]]; then
    echo "✓ NodeJS version is sufficient (${actual} >= v${minVer})"
else
    echo "NodeJS installation required (need v${minVer}+, found ${actual})"

    arch=$(arch)
    bits=$(getconf LONG_BIT)

    # Check architecture compatibility
    if { [ "$arch" = "i386" ] || [ "$arch" = "i686" ]; } && [ "$bits" -eq "32" ]; then
        echo "ERROR: x86 32-bit architecture is not supported by NodeJS 20+"
        exit 1
    fi

    # Prioritize nodesource nodejs
    sudo bash -c "cat > /etc/apt/preferences.d/nodesource" << EOL
Package: nodejs
Pin: origin deb.nodesource.com
Pin-Priority: 600
EOL

    echo "Updating package list..."
    sudo apt-get update

    echo "Installing build dependencies..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y lsb-release build-essential apt-utils git curl gnupg

    # Purge old nodejs/npm
    sudo DEBIAN_FRONTEND=noninteractive apt-get -y --purge autoremove npm &>/dev/null || true
    sudo DEBIAN_FRONTEND=noninteractive apt-get -y --purge autoremove nodejs &>/dev/null || true

    if [[ $arch == "armv6l" ]]; then
        armVer="20.8.0"
        echo "ARMv6 detected (Pi Zero/1), using unofficial build ${armVer}..."
        wget https://unofficial-builds.nodejs.org/download/release/v${armVer}/node-v${armVer}-linux-armv6l.tar.gz
        tar -xvf node-v${armVer}-linux-armv6l.tar.gz
        cd node-v${armVer}-linux-armv6l
        sudo cp -f -R * /usr/local/
        cd ..
        rm -fR node-v${armVer}-linux-armv6l*
        sudo ln -sf /usr/local/bin/node /usr/bin/node
        sudo ln -sf /usr/local/bin/node /usr/bin/nodejs
        sudo npm install -g npm
    else
        echo "Installing NodeJS from official nodesource repository..."
        NODE_MAJOR=$installVer
        sudo mkdir -p /etc/apt/keyrings
        [[ -f /etc/apt/keyrings/nodesource.gpg ]] && sudo rm /etc/apt/keyrings/nodesource.gpg || true
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
        [[ -f /etc/apt/sources.list.d/nodesource.list ]] && sudo rm /etc/apt/sources.list.d/nodesource.list || true
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
        sudo apt-get update
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
    fi

    # Clean up
    [[ -f /etc/apt/preferences.d/nodesource ]] && sudo rm -f /etc/apt/preferences.d/nodesource || true

    # Verify installation
    new=$(node -v)
    echo "Installed NodeJS version: ${new}"
    testVerAfter=$(php -r "echo version_compare('${new}','v${minVer}','>=');")
    if [[ $testVerAfter != "1" ]]; then
        echo "ERROR: NodeJS installation failed or version too old"
        exit 1
    else
        echo "✓ NodeJS ${new} installed successfully"
    fi
fi

# Verify npm is available
type npm &>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing npm..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y npm
    sudo npm install -g npm
fi

# ================================================
# Step 3: Cleanup
# ================================================
echo ""
echo "Step 3/3: Cleanup..."
echo "Cleaning npm cache..."
sudo npm cache clean --force 2>/dev/null || true

echo ""
echo "=================================================="
echo "✓ Dependencies installation completed successfully"
echo "=================================================="
