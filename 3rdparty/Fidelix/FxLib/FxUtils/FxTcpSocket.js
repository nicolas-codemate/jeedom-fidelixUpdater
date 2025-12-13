// Copyright 2024 - TCP Socket wrapper for Modbus TCP
// Equivalent of FxSerial.js but for TCP connections
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const net = require('net');
const eventEmitter = require('events').EventEmitter;
const util = require('util');
const fxLog = require('./FxLog.js').configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// DEFINITIONS
// *******************************************************************
const WAIT_TIMEOUT_DEFAULT = 1000;
const CONNECT_TIMEOUT_DEFAULT = 5000;

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************

// Inherit from event emitter
util.inherits(fxTcpSocket, eventEmitter);

function fxTcpSocket() {
    // *******************************************************************
    // PRIVATE VARIABLES
    // *******************************************************************
    var self = this;
    var m_Socket = null;
    var m_Host = null;
    var m_Port = null;

    // *******************************************************************
    // PUBLIC VARIABLES
    // *******************************************************************
    this.isOpen = false;

    // *******************************************************************
    // PRIVATE FUNCTIONS
    // *******************************************************************

    // Handle incoming data
    function onData(data) {
        fxLog.trace("TCP received " + data.length + " bytes: " + data.toString('hex'));
        self.emit('receive', data);
    }

    // Handle socket errors
    function onError(err) {
        fxLog.error("TCP socket error: " + err);
        self.emit('error', err);
    }

    // Handle socket close
    function onClose(hadError) {
        fxLog.debug("TCP socket closed" + (hadError ? " with error" : ""));
        self.isOpen = false;

        if (m_Socket) {
            m_Socket.removeAllListeners();
        }

        self.emit('close');
        self.emit('disconnect');
        m_Socket = null;

        // Remove listeners on next tick
        process.nextTick(self.removeAllListeners.bind(self));
    }

    // Handle successful connection
    function onConnect() {
        fxLog.debug("TCP socket connected to " + m_Host + ":" + m_Port);
        self.isOpen = true;
        self.emit('connect');
        self.emit('open');
    }

    // *******************************************************************
    // INTERFACE FUNCTIONS
    // *******************************************************************

    // Wait response from device
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

    // Flush (no-op for TCP, but kept for API compatibility)
    this.flush = function() {
        return Q.resolve();
    }

    // Open TCP connection
    this.open = function(host, port, options) {
        var deferred = Q.defer();

        fxLog.debug("Opening TCP connection to " + host + ":" + port);

        // Store connection info
        m_Host = host;
        m_Port = port;

        // Create socket
        m_Socket = new net.Socket();

        // Set up event handlers
        m_Socket.on('data', onData);
        m_Socket.on('error', onError);
        m_Socket.on('close', onClose);
        m_Socket.on('connect', onConnect);

        // Connection timeout
        var connectTimeout = (options && options.connectTimeout) || CONNECT_TIMEOUT_DEFAULT;
        var timeoutHandle = setTimeout(function() {
            if (!self.isOpen) {
                m_Socket.destroy();
                deferred.reject("TCP connection timeout after " + connectTimeout + "ms");
            }
        }, connectTimeout);

        // Connect
        m_Socket.connect(port, host, function() {
            clearTimeout(timeoutHandle);
            deferred.resolve();
        });

        return deferred.promise;
    }

    // Close TCP connection
    this.close = function() {
        var deferred = Q.defer();

        fxLog.debug("Closing TCP connection");

        if (m_Socket) {
            m_Socket.end(function() {
                m_Socket.destroy();
                deferred.resolve();
            });

            // Timeout for graceful close
            setTimeout(function() {
                if (m_Socket) {
                    m_Socket.destroy();
                }
                deferred.resolve();
            }, 1000);
        } else {
            deferred.resolve();
        }

        return deferred.promise;
    }

    // Write data to TCP socket
    this.write = function(buffer, offset, length) {
        var deferred = Q.defer();

        if (!m_Socket || !self.isOpen) {
            return Q.reject('TCP socket is not open');
        }

        // Extract the portion to write
        var dataToWrite;
        if (offset !== undefined && length !== undefined) {
            dataToWrite = buffer.slice(offset, offset + length);
        } else if (offset !== undefined) {
            dataToWrite = buffer.slice(offset);
        } else {
            dataToWrite = buffer;
        }

        fxLog.trace("TCP write " + dataToWrite.length + " bytes: " + dataToWrite.toString('hex'));

        m_Socket.write(dataToWrite, function(err) {
            if (err) {
                deferred.reject(err);
            } else {
                self.emit('write', dataToWrite);
                deferred.resolve();
            }
        });

        return deferred.promise;
    }

    // Read is handled by events, but kept for API compatibility
    this.read = function() {
        return Q.resolve(Buffer.from([]));
    }

    // Bytes to read (not applicable for TCP, kept for API compatibility)
    this.bytesToRead = function() {
        return Q.resolve(0);
    }
}

module.exports = fxTcpSocket;
