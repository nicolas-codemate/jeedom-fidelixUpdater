// Test connection script for Fidelix Multi24 via Modbus RTU
'use strict';

const FxDevice = require('./FxMulti24/FxDevice.js');
const Q = require('q');
const fs = require('fs-extra');

// Create device instance
const fxDevice = new FxDevice();

// Get arguments from command line
const args = process.argv.slice(2);
if (args.length < 4) {
    console.error('Usage: node testConnection.js <port> <address> <baudRate> <resultFile>');
    process.exit(1);
}

const port = args[0];
const address = parseInt(args[1]);
const baudRate = parseInt(args[2]) || 19200;
const resultFile = args[3];

// Initialize result object
const result = {
    timestamp: new Date().toISOString(),
    port: port,
    address: address,
    baudRate: baudRate,
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

        // Open the serial port using public API (matching vendor reference code)
        console.log(`Opening serial port at ${baudRate} bauds...`);

        const options = {
            baudRate: baudRate,
            responseTimeout: 5000
        };

        await fxDevice.openConnection(port, options)
            .then(function() {
                result.diagnostics.portOpened = true;
                console.log('Serial port opened successfully');
            });

        // Small delay to let port stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Test Modbus communication using public API
        console.log(`Testing Modbus communication with module at address ${address}...`);

        const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        try {
            // Read holding registers (function 0x03) starting at address 0
            // This matches mbpoll behavior: [01][03][00][00][00][0A][C5][CD]
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

        // Close port using public API
        await fxDevice.closeConnection();
        console.log('Test completed successfully');

    } catch (err) {
        result.success = false;
        result.error = err.message || String(err);
        console.error('Test failed:', err);

        // Try to close port if opened
        try {
            if (result.diagnostics.portOpened) {
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
