// Copyright 2024 - Transport abstraction layer
// Base class for Serial and TCP Transparent transports
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const eventEmitter = require('events').EventEmitter;
const util = require('util');
const fxLog = require('./FxLog.js').configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// DEFINITIONS
// *******************************************************************
const WAIT_TIMEOUT_DEFAULT = 1000;

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************

// Inherit from event emitter
util.inherits(FxTransport, eventEmitter);

/**
 * Abstract base class for transport implementations (Serial, TCP Transparent)
 * Provides a common interface that FxModbusRTUMaster can use.
 *
 * Events emitted:
 * - 'receive': data received (Buffer)
 * - 'connect': connection established
 * - 'disconnect': connection lost
 * - 'error': error occurred
 * - 'open': connection opened
 * - 'close': connection closed
 * - 'write': data written (Buffer)
 */
function FxTransport() {
    // *******************************************************************
    // PRIVATE VARIABLES
    // *******************************************************************
    var self = this;

    // *******************************************************************
    // PUBLIC VARIABLES
    // *******************************************************************
    this.isOpen = false;
    this.transportType = 'abstract';

    // *******************************************************************
    // INTERFACE FUNCTIONS
    // *******************************************************************

    /**
     * Wait for response matching pattern
     * @param {Buffer} patternToWait - Pattern to match at start of response
     * @param {number} length - Expected response length
     * @param {number} msTimeout - Timeout in milliseconds
     * @returns {Promise<Buffer>} - Received data
     */
    this.waitResponse = function(patternToWait, length, msTimeout) {
        msTimeout = msTimeout || WAIT_TIMEOUT_DEFAULT;
        patternToWait = patternToWait || Buffer.from([]);
        length = length || patternToWait.length;
        fxLog.trace(`waitResponse(${Buffer.concat([patternToWait]).toString('hex')}, ${msTimeout})`);

        return Q.promise((resolve, reject) => {
            // Receive handler
            let response = Buffer.from([]);
            let onReceive = function(data) {
                // Add received data to the buffer
                response = Buffer.concat([response, data]);

                // Try to find pattern to wait
                let matchingPatternPos = response.indexOf(patternToWait);

                // If matching pattern received, remove data before pattern
                if (matchingPatternPos > 0) {
                    response = response.slice(matchingPatternPos);
                    matchingPatternPos = 0;
                }

                // If matching pattern found and required byte count received...
                if ((matchingPatternPos === 0) && (response.length >= length)) {
                    self.removeListener('receive', onReceive);
                    clearTimeout(onTimeout);
                    resolve(response);
                    return;
                }
            }

            self.on('receive', onReceive);

            // Timeout handler
            let onTimeout = setTimeout(function () {
                self.removeListener('receive', onReceive);
                reject('Timeout');
            }, msTimeout);
        })
    }

    /**
     * Flush transport buffer (no-op by default, override in subclass if needed)
     * @returns {Promise}
     */
    this.flush = function() {
        return Q.resolve();
    }

    /**
     * Open transport connection
     * @param {string} connectionString - Connection string (port name, host:port, etc.)
     * @param {Object} options - Connection options
     * @returns {Promise}
     */
    this.open = function(connectionString, options) {
        return Q.reject('FxTransport.open() must be implemented by subclass');
    }

    /**
     * Close transport connection
     * @returns {Promise}
     */
    this.close = function() {
        return Q.reject('FxTransport.close() must be implemented by subclass');
    }

    /**
     * Write data to transport
     * @param {Buffer} buffer - Data to write
     * @param {number} offset - Start offset in buffer (optional)
     * @param {number} length - Number of bytes to write (optional)
     * @returns {Promise}
     */
    this.write = function(buffer, offset, length) {
        return Q.reject('FxTransport.write() must be implemented by subclass');
    }

    /**
     * Read data from transport (if applicable)
     * @returns {Promise<Buffer>}
     */
    this.read = function() {
        return Q.resolve(Buffer.from([]));
    }

    /**
     * Get number of bytes available to read (if applicable)
     * @returns {Promise<number>}
     */
    this.bytesToRead = function() {
        return Q.resolve(0);
    }
}

module.exports = FxTransport;
