// Test connection script for Fidelix Multi24 via Modbus TCP
// Supports both standard TCP (Modbus TCP) and transparent mode (raw RTU over TCP)
'use strict';

const FxDeviceTCP = require('./FxMulti24/FxDeviceTCP.js');
const Q = require('q');
const fs = require('fs-extra');

// Create device instance
const fxDevice = new FxDeviceTCP();

// Get arguments from command line
const args = process.argv.slice(2);
if (args.length < 4) {
    console.error('Usage: node testConnectionTCP.js <host> <tcpPort> <address> <resultFile> [transparentMode]');
    console.error('Example: node testConnectionTCP.js 192.168.1.100 4196 1 /tmp/result.json');
    console.error('Example (transparent): node testConnectionTCP.js 192.168.1.100 502 1 /tmp/result.json true');
    process.exit(1);
}

const host = args[0];
const tcpPort = parseInt(args[1]);
const address = parseInt(args[2]);
const resultFile = args[3];
const transparentMode = args[4] === 'true' || args[4] === '1';

// Initialize result object
const result = {
    timestamp: new Date().toISOString(),
    connectionType: transparentMode ? 'tcp-transparent' : 'tcp',
    host: host,
    tcpPort: tcpPort,
    address: address,
    transparentMode: transparentMode,
    success: false,
    connected: false,
    moduleInfo: null,
    error: null,
    diagnostics: {
        tcpConnected: false,
        modbusResponse: false
    }
};

// Timeout for the whole test
const TEST_TIMEOUT = 15000; // 15 seconds (slightly longer for TCP)

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
        const modeStr = transparentMode ? 'TCP Transparent (raw RTU)' : 'TCP Modbus';
        console.log(`Testing ${modeStr} connection to Fidelix Multi24 at ${host}:${tcpPort}, address ${address}...`);

        // Open the TCP connection
        console.log(`Opening TCP connection...`);

        const options = {
            tcpPort: tcpPort,
            responseTimeout: 5000,
            connectTimeout: 10000
        };

        await fxDevice.openConnection(host, options)
            .then(function() {
                result.diagnostics.tcpConnected = true;
                console.log('TCP connection opened successfully');
            });

        // Enable transparent mode if requested (must be done after connection is open)
        if (transparentMode) {
            console.log('Enabling transparent mode (raw RTU over TCP)...');
            fxDevice.setTransparentMode(true);
        }

        // Small delay to let connection stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Test Modbus communication using public API
        console.log(`Testing Modbus communication with module at address ${address}...`);

        const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        try {
            // Read holding registers (function 0x03) starting at address 0
            await fxDevice.readHoldingRegisters(address, 0, 10, values)
                .then(function() {
                    result.diagnostics.modbusResponse = true;
                    result.connected = true;
                    console.log(`Module responded at address ${address}`);
                    console.log(`Holding registers [0-9]: ${values.join(', ')}`);

                    // Get module information
                    result.moduleInfo = {
                        holdingRegisters: values,
                        address: address,
                        communicationOk: true
                    };

                    result.success = true;
                    result.error = null;
                });

        } catch (err) {
            result.diagnostics.modbusResponse = false;
            throw new Error(`Module not responding at address ${address}: ${err}`);
        }

        // Close connection
        await fxDevice.closeConnection();
        console.log('Test completed successfully');

    } catch (err) {
        result.success = false;
        result.error = err.message || String(err);
        console.error('Test failed:', err);

        // Try to close connection if opened
        try {
            if (result.diagnostics.tcpConnected) {
                await fxDevice.closeConnection();
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
    result.error = 'Test timeout after 15 seconds';
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
