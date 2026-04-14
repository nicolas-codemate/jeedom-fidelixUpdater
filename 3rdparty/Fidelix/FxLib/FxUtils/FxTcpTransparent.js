// Copyright 2024 - TCP Transparent Transport
// Wrapper for TCP connections that behaves like FxSerial (RTU frames over TCP)
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const util = require('util');
const FxTransport = require('./FxTransport.js');
const fxTcpSocket = require('./FxTcpSocket.js');
const fxLog = require('./FxLog.js').configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************

// Inherit from FxTransport
util.inherits(FxTcpTransparent, FxTransport);

/**
 * TCP Transparent transport - sends RTU frames over TCP without MBAP header.
 * This class wraps FxTcpSocket to provide the same interface as FxSerial,
 * allowing FxModbusRTUMaster to work transparently with TCP connections.
 *
 * Usage:
 *   const transport = new FxTcpTransparent();
 *   transport.open('192.168.1.100', 502);
 *   // Use with FxModbusRTUMaster via setTransport()
 */
function FxTcpTransparent() {
    // Call parent constructor
    FxTcpTransparent.super_.call(this);

    // *******************************************************************
    // PRIVATE VARIABLES
    // *******************************************************************
    var self = this;
    var m_TcpSocket = null;
    var m_Host = null;
    var m_Port = null;

    // *******************************************************************
    // PUBLIC VARIABLES
    // *******************************************************************
    this.transportType = 'tcp-transparent';

    // *******************************************************************
    // PRIVATE FUNCTIONS
    // *******************************************************************

    // Handle disconnect event (guarded: FxTcpSocket emits both 'close' and
    // 'disconnect', so this handler may fire twice — the null check prevents
    // double-emit of 'disconnect' to upstream listeners).
    const onDisconnect = function(err) {
        if (!m_TcpSocket) return;

        // Remove ALL listeners from the socket (including forwarding listeners
        // for error, receive, etc. registered in open()) — safe because
        // m_TcpSocket is about to be nulled and will not emit further.
        m_TcpSocket.removeAllListeners();
        m_TcpSocket = null;

        self.isOpen = false;
        self.emit('disconnect', err);

        // Note: do NOT call self.removeAllListeners() here — it would destroy
        // listeners registered by FxModbusRTUMaster.setTransport(), making
        // reconnection impossible (receive events would no longer propagate).
    }

    // *******************************************************************
    // INTERFACE FUNCTIONS
    // *******************************************************************

    /**
     * Open TCP connection
     * @param {string} host - Host address (IP or hostname)
     * @param {number|Object} portOrOptions - Port number or options object with tcpPort/port
     * @param {Object} options - Connection options (optional)
     * @returns {Promise}
     */
    this.open = function(host, portOrOptions, options) {
        fxLog.debug(`FxTcpTransparent.open(${host}, ${JSON.stringify(portOrOptions)})`);

        // Handle different parameter formats
        var port;
        if (typeof portOrOptions === 'number') {
            port = portOrOptions;
        } else if (typeof portOrOptions === 'object') {
            // Options object passed as second parameter
            options = portOrOptions;
            // Support both tcpPort (from FxM24Update) and port (generic)
            port = options.tcpPort || options.port || 502;
        } else {
            port = 502;
        }

        // If port is still not set, try to get it from options
        if (!port && options) {
            port = options.tcpPort || options.port || 502;
        }

        fxLog.info(`FxTcpTransparent: Opening connection to ${host}:${port}`);

        // Store connection info
        m_Host = host;
        m_Port = port;

        // If socket already exists, close it first
        if (m_TcpSocket) {
            return self.close()
                .then(function() {
                    return self.open(host, port, options);
                });
        }

        // Create new TCP socket
        m_TcpSocket = new fxTcpSocket();

        // Forward data and error events (simple pass-through)
        m_TcpSocket.on('error', (...args) => self.emit('error', ...args));
        m_TcpSocket.on('open', (...args) => self.emit('open', ...args));
        m_TcpSocket.on('write', (...args) => self.emit('write', ...args));
        m_TcpSocket.on('receive', (...args) => self.emit('receive', ...args));

        // Connect: set isOpen flag before emitting so listeners see the correct state
        m_TcpSocket.on('connect', function() {
            self.isOpen = true;
            self.emit('connect');
        });

        // Disconnect/close: cleanup handled by onDisconnect (which emits 'disconnect')
        m_TcpSocket.once('disconnect', onDisconnect);
        m_TcpSocket.once('close', onDisconnect);

        // Open TCP connection
        return m_TcpSocket.open(host, port, options)
            .then(function() {
                fxLog.info(`TCP Transparent connection opened to ${host}:${port}`);
            });
    }

    /**
     * Close TCP connection
     * @returns {Promise}
     */
    this.close = function() {
        fxLog.debug('FxTcpTransparent.close()');

        if (!m_TcpSocket) {
            return Q.resolve();
        }

        return m_TcpSocket.close()
            .then(function() {
                fxLog.info('TCP Transparent connection closed');
            });
    }

    /**
     * Write data to TCP socket
     * @param {Buffer} buffer - Data to write
     * @param {number} offset - Start offset in buffer (optional)
     * @param {number} length - Number of bytes to write (optional)
     * @returns {Promise}
     */
    this.write = function(buffer, offset, length) {
        if (!m_TcpSocket) {
            return Q.reject('TCP socket is not open');
        }

        return m_TcpSocket.write(buffer, offset, length);
    }

    /**
     * Flush (no-op for TCP)
     * @returns {Promise}
     */
    this.flush = function() {
        if (!m_TcpSocket) {
            return Q.reject('TCP socket is not open');
        }

        return m_TcpSocket.flush();
    }

    /**
     * Read (handled by events)
     * @returns {Promise<Buffer>}
     */
    this.read = function() {
        if (!m_TcpSocket) {
            return Q.reject('TCP socket is not open');
        }

        return m_TcpSocket.read();
    }

    /**
     * Get bytes available to read
     * @returns {Promise<number>}
     */
    this.bytesToRead = function() {
        if (!m_TcpSocket) {
            return Q.reject('TCP socket is not open');
        }

        return m_TcpSocket.bytesToRead();
    }

    /**
     * Get connection info
     * @returns {Object}
     */
    this.getConnectionInfo = function() {
        return {
            host: m_Host,
            port: m_Port,
            isOpen: self.isOpen,
            transportType: self.transportType
        };
    }
}

module.exports = FxTcpTransparent;
