// Copyright 2024 - TCP version of FxSwUpdate
// Based on FxSwUpdate.js but uses TCP transport
//
// ============================================================================
// TCP CONNECTION MODES
// ============================================================================
// This module supports two TCP connection modes:
//
// 1. TCP MODBUS MODE (transparentMode: false)
//    - Gateway configured as "Modbus TCP to RTU"
//    - Only direct software update works (no pass-through)
//    - Uses standard Modbus register operations
//
// 2. TCP TRANSPARENT MODE (transparentMode: true)
//    - Gateway configured as "None" (transparent/raw TCP)
//    - All features supported including pass-through
//    - CRC is calculated and added to proprietary commands
//
// To use transparent mode, set options.transparentMode = true when calling
// the program() function. The UI provides "TCP Transparent" option for this.
// ============================================================================
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const assert = require('assert');
const util = require('util');
const fxDeviceTCP = require('./FxDeviceTCP.js');
const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
// TCP timeouts and retry settings (longer than RTU due to converter latency)
const TCP_RESPONSE_TIMEOUT = 10000;             // Modbus response timeout
const TCP_PORT_STABILIZATION_DELAY = 500;       // Delay after opening connection
const TCP_PHASE_DELAY = 500;                    // Delay between update phases
const TCP_PACKET_WAIT_TIMEOUT = 10000;          // Timeout waiting for packet counter (increased for TCP latency)
const TCP_NUM_OF_RETRIES = 10;                  // Number of retries for operations
const TCP_INTER_PACKET_DELAY = 5;               // Delay between packets (ms)
const TCP_BUFFER_FLUSH_INTERVAL = 512;          // Flush buffer every N packets
const TCP_BUFFER_FLUSH_DELAY = 10000;           // Delay for buffer flush (ms) - allows Multi24 to write to Display flash

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from fxDeviceTCP (instead of fxDevice for RTU)
util.inherits(fxSwUpdateTCP, fxDeviceTCP);

function fxSwUpdateTCP() {

    if (!(this instanceof fxSwUpdateTCP)) {
        return new (Function.prototype.bind.apply(fxSwUpdateTCP, [null, ...arguments]));
    }

    fxSwUpdateTCP.super_.call(this);

    // *******************************************************************
    // PRIVATE VARIABLES
    // *******************************************************************
    var self = this;
    var m_Deferred = Q.defer();
    var m_Options = {};
    var m_FileBuffer = null;
    var m_TotalRegCount = 0;
    var m_TotalPacketCount = 0;

    // *******************************************************************
    // PUBLIC VARIABLES
    // *******************************************************************
    this.progress = 0;
    this.phase = "";
    this.status = "";

    // *******************************************************************
    // PRIVATE FUNCTIONS
    // *******************************************************************

    function repeatUntilResolvedOrNoRetriesLeft(call, interval, retries) {
        var deferred = Q.defer();
        var retrycount = retries || 1;

        function doLoop() {
            call()
            .then(deferred.resolve)
            .fail(function(err) {
                if (retrycount-- <= 0)
                    deferred.reject("Retry counter expired... " + err);
                else
                    setTimeout(doLoop, interval);
            })
        }

        doLoop();

        return deferred.promise;
    }

    function notifyProgress(notify) {
        var deferred = Q.defer();

        notify = notify || {};
        notify.phase = notify.phase || self.phase;
        notify.status = notify.status || self.status;
        notify.progress = notify.progress || self.progress;
        notify.progress = Math.round(notify.progress);

        self.phase = notify.phase;
        self.status = notify.status;
        self.progress = notify.progress;

        fxLog.debug(self.phase + " : " + self.status + " " + self.progress + "%");
        self.emit('progress', notify);

        process.nextTick(deferred.resolve);

        return deferred.promise;
    }

    function transferData() {
        var deferred = Q.defer();

        var l_RetryCounter = 0;
        var l_FileBufferPos = 0;
        var l_Values = [];

        fxLog.trace("transferData TCP");

        function waitDeviceReady(packet) {
            return (
                self.waitSwPacketCounter(packet, TCP_PACKET_WAIT_TIMEOUT)
                .then(function() {
                    if (packet >= m_TotalPacketCount) {
                        deferred.resolve()
                        return (Q.resolve());
                    }

                    var l_RegCount = 0;

                    while (l_RegCount < 64) {
                        var l_HighByte = (l_FileBufferPos < m_FileBuffer.length) ? m_FileBuffer[l_FileBufferPos++] : 0;
                        var l_LowByte = (l_FileBufferPos < m_FileBuffer.length) ? m_FileBuffer[l_FileBufferPos++] : 0;

                        l_Values[l_RegCount] = (l_HighByte << 8) + l_LowByte;
                        l_RegCount++;
                    }

                    l_RetryCounter = 0;

                    packet++;
                    process.nextTick(sendPacket.bind(null, l_Values, packet));

                    return Q.resolve();
                })
                .catch(function(err) {
                    if (l_RetryCounter++ >= TCP_NUM_OF_RETRIES)
                        deferred.reject(err);
                    else
                        return (waitDeviceReady(packet));
                })
            )
        }

        function sendPacket(data, packet) {
            return (
                Q.resolve()
                .then(function() {
                    // Add buffer flush delay BEFORE sending packets at buffer boundaries
                    // This gives the Multi24 time to flush its buffer to Display flash
                    if (packet > 0 && (packet % TCP_BUFFER_FLUSH_INTERVAL) === 0) {
                        console.log('[FxSwUpdateTCP] Buffer flush pause BEFORE packet ' + packet + ' (waiting ' + TCP_BUFFER_FLUSH_DELAY + 'ms)');
                        return Q.delay(TCP_BUFFER_FLUSH_DELAY);
                    }
                    return Q.resolve();
                })
                .then(function() {
                    return self.sendSwPacket(data, packet);
                })
                .delay(TCP_INTER_PACKET_DELAY)
                .then(Q.fbind(notifyProgress, {progress : 10 + (80 * packet / m_TotalPacketCount)}))
                .then(function() {
                    return (waitDeviceReady(packet));
                })
                .catch (function(err) {
                    if (l_RetryCounter++ >= TCP_NUM_OF_RETRIES)
                        deferred.reject(err);
                    else
                        return process.nextTick(sendPacket.bind(null, data, packet));
                })
            )
        }

        var i = 0;
        waitDeviceReady(i);

        return deferred.promise;
    }

    function doProgram() {
        fxLog.trace("doProgram TCP...");

        return (
            notifyProgress({phase : "Preparing", status : "Checking buffer data...", progress : 0})
            .then(function() {
                m_TotalRegCount = Math.floor((m_FileBuffer.length + 1) / 2);
                m_TotalPacketCount = Math.floor((m_TotalRegCount + 63) / 64);
            })
            .then(Q.fbind(notifyProgress, {status : "Opening TCP connection...", progress : 2}))
            .then(function() {
                // TCP connection: host is m_Options.host, port is m_Options.tcpPort
                console.log('[FxSwUpdateTCP] Opening TCP connection to:', m_Options.host + ':' + m_Options.tcpPort);
                return Q.fbind(self.openConnection, m_Options.host, m_Options)();
            })
            .then(function() {
                console.log('[FxSwUpdateTCP] TCP connection opened successfully');
            })
            .delay(TCP_PORT_STABILIZATION_DELAY)
            .then(function() {
                console.log('[FxSwUpdateTCP] Connection stabilized after ' + TCP_PORT_STABILIZATION_DELAY + 'ms delay');
            })
            .then(function() {
                if (self.passThroughModule.address !== 0) {
                    console.log('[FxSwUpdateTCP] Activating pass-through mode for address:', self.passThroughModule.address);

                    return (
                        notifyProgress({status : "Activating pass-through mode...", progress : 5})
                        .then(Q.fbind(repeatUntilResolvedOrNoRetriesLeft, Q.fbind(self.setupBootMode, true, false), 100, TCP_NUM_OF_RETRIES))
                        .then(function() {
                            console.log('[FxSwUpdateTCP] Pass-through mode activated successfully');
                        })
                        .catch(function (err) {
                            console.error('[FxSwUpdateTCP] Failed to activate pass-through mode:', err);
                            return Q.reject("Unable to activate pass-through mode : " + err);
                        })
                    )
                } else {
                    console.log('[FxSwUpdateTCP] Skipping pass-through mode (address is 0)');
                }
            })
            .delay(TCP_PHASE_DELAY)
            .then(Q.fbind(notifyProgress, {status : "Setting up device to the programming mode...", progress : 7}))
            .then(function() {
                console.log('[FxSwUpdateTCP] Setting device to programming mode...');

                return (
                    repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.startSwProgramming), 100, TCP_NUM_OF_RETRIES)
                    .then(function() {
                        console.log('[FxSwUpdateTCP] Device set to programming mode successfully');
                    })
                    .catch(function(err) {
                        console.error('[FxSwUpdateTCP] Failed to set device to programming mode:', err);
                        return Q.reject("Unable to set device to the programming mode : " + err);
                    })
                )
            })
            .delay(TCP_PHASE_DELAY)
            .then(Q.fbind(notifyProgress, {phase : "Programming", status : "Programming device... ", progress : 10}))
            .then(function() {
                console.log('[FxSwUpdateTCP] Starting data transfer... Total packets:', m_TotalPacketCount);
                return transferData();
            })
            .then(function() {
                console.log('[FxSwUpdateTCP] Data transfer completed successfully');
            })
            .delay(TCP_PHASE_DELAY)
            .then(Q.fbind(notifyProgress, {phase : "Finishing", status : "Restoring device back to the normal mode...", progress : 95}))
            .then(function() {
                return (
                    repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.endSwProgramming), 100, TCP_NUM_OF_RETRIES)
                    .catch (function(err) {
                        return Q.reject("Unable to restore device back to normal mode : " + err);
                    })
                )
            })
            .then(Q.fbind(notifyProgress, {phase : "Programming OK", status : "Device programmed successfully...", progress : 100}))
            .catch(function (err) {
                self.emit('error', err, fxLog.error(err));
                notifyProgress({phase : "Programming ERROR", status : err, progress : 0})
                return Q.reject(err);
            })
            .fin(function() {
                return self.closeConnection();
            })
        )
    }

    // *******************************************************************
    // INTERFACE FUNCTIONS
    // *******************************************************************

    this.supportedTargetModules = ['MULTI-24'];

    this.program = function(options) {
        try {
            fxLog.trace("program TCP... Buffer => " + options.host + ":" + options.tcpPort);

            assert.notEqual(m_Deferred.state, 'pending', 'Programming is already active');

            // TCP connection requires host and tcpPort
            assert.equal(typeof(options.host), 'string', 'Program: Invalid parameter (options.host)');
            assert.equal(typeof(options.tcpPort), 'number', 'Program: Invalid parameter (options.tcpPort)');
            assert.notEqual(typeof(options.data), null, 'Program: Invalid parameter (options.data)');

            m_Options = options || {};
            m_Options.responseTimeout = TCP_RESPONSE_TIMEOUT;
            m_FileBuffer = new Buffer( new Uint8Array(options.data) );

            // Log connection mode information
            var connectionMode = m_Options.transparentMode ? 'TCP Transparent' : 'TCP Modbus';
            var passthroughInfo = m_Options.subaddress ? ' (passthrough: ' + m_Options.address + ' -> ' + m_Options.subaddress + ')' : ' (direct: ' + m_Options.address + ')';
            console.log('='.repeat(60));
            console.log('[FxSwUpdateTCP] Software Update - ' + connectionMode + passthroughInfo);
            console.log('[FxSwUpdateTCP] Host: ' + m_Options.host + ':' + m_Options.tcpPort);
            console.log('='.repeat(60));

            // Enable transparent mode if requested (for raw RTU over TCP)
            if (m_Options.transparentMode) {
                self.setTransparentMode(true);
                fxLog.debug("Transparent mode enabled for software update");
            }

            m_Deferred = Q.defer();

            doProgram().then(m_Deferred.resolve, m_Deferred.reject)
            .fin(function(){m_FileBuffer = null;});
        }
        catch (err) {
            let error = "Program error : " + err;
            self.emit('error', error, fxLog.error);
            m_Deferred.reject(err);
        }

        return m_Deferred.promise;
    }

    this.cancel = function() {
        fxLog.trace("cancel...");

        if (m_Deferred.state === 'pending') {
            m_Deferred.reject("Programming cancelled...");
        }

        return m_Deferred.promise;
    }

    this.isBusy = function() {
        fxLog.trace("isBusy...");
        return (m_Deferred.state === 'pending');
    }
}

module.exports = fxSwUpdateTCP;
