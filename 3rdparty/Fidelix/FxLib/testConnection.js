// Test connection script for Fidelix Multi24 via Modbus RTU
'use strict';

const FxDevice = require('./FxMulti24/FxDevice.js');
const fs = require('fs-extra');

// Create device instance
const fxDevice = new FxDevice();

// Get arguments from command line
const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: node testConnection.js <port> <address> <resultFile>');
    process.exit(1);
}

const port = args[0];
const address = parseInt(args[1]);
const resultFile = args[2];

// Initialize result object
const result = {
    timestamp: new Date().toISOString(),
    port: port,
    address: address,
    success: false,
    connected: false,
    moduleInfo: null,
    error: null,
    diagnostics: {
        portOpened: false,
        modbusResponse: false,
        bootVersion: null
    }
};

// Timeout for the whole test
const TEST_TIMEOUT = 10000; // 10 seconds

// Save result to file
function saveResult() {
    try {
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Failed to write result file:', err);
    }
}

// Test procedure
async function testConnection() {
    try {
        console.log(`Testing connection to Fidelix Multi24 on ${port} at address ${address}...`);

        // Open the serial port
        console.log('Opening serial port...');
        await new Promise((resolve, reject) => {
            fxDevice.open(port, 57600, (err) => {
                if (err) {
                    reject(new Error(`Failed to open port: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });

        result.diagnostics.portOpened = true;
        console.log('Serial port opened successfully');

        // Small delay to let port stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to read boot version
        console.log(`Asking boot version from module at address ${address}...`);

        let bootVersion = { value: 0.0 };

        try {
            await fxDevice.askBootVersion(address, bootVersion);
            result.diagnostics.modbusResponse = true;
            result.diagnostics.bootVersion = bootVersion.value;
            result.connected = true;

            console.log(`Boot version: ${bootVersion.value}`);

            // Get module information
            result.moduleInfo = {
                bootVersion: bootVersion.value,
                address: address,
                communicationOk: true
            };

            result.success = true;
            result.error = null;

        } catch (err) {
            result.diagnostics.modbusResponse = false;
            throw new Error(`Module not responding at address ${address}: ${err}`);
        }

        // Close port
        fxDevice.close();
        console.log('Test completed successfully');

    } catch (err) {
        result.success = false;
        result.error = err.message || String(err);
        console.error('Test failed:', err);

        // Try to close port if opened
        try {
            if (result.diagnostics.portOpened) {
                fxDevice.close();
            }
        } catch (closeErr) {
            // Ignore close errors
        }
    } finally {
        saveResult();
    }
}

// Run test with timeout
const timeoutHandle = setTimeout(() => {
    result.success = false;
    result.error = 'Test timeout after 10 seconds';
    saveResult();
    process.exit(1);
}, TEST_TIMEOUT);

testConnection()
    .then(() => {
        clearTimeout(timeoutHandle);
        process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
        clearTimeout(timeoutHandle);
        result.success = false;
        result.error = err.message || String(err);
        saveResult();
        process.exit(1);
    });
