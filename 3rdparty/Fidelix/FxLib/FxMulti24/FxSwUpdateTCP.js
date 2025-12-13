// Copyright 2024 - TCP version of FxSwUpdate
// Based on FxSwUpdate.js but uses TCP transport
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
const NUM_OF_RETRIES = 10;
const PORT_STABILIZATION_DELAY = 500;

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
                self.waitSwPacketCounter(packet, 500)
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
                    if (l_RetryCounter++ >= NUM_OF_RETRIES)
                        deferred.reject(err);
                    else
                        return (waitDeviceReady(packet));
                })
            )
        }

        function sendPacket(data, packet) {
            return (
                self.sendSwPacket(data, packet)
                .then(Q.fbind(notifyProgress, {progress : 10 + (80 * packet / m_TotalPacketCount)}))
                .then(function() {
                    return (waitDeviceReady(packet));
                })
                .catch (function(err) {
                    if (l_RetryCounter++ >= NUM_OF_RETRIES)
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
            .delay(PORT_STABILIZATION_DELAY)
            .then(function() {
                console.log('[FxSwUpdateTCP] Connection stabilized after ' + PORT_STABILIZATION_DELAY + 'ms delay');
            })
            .then(function() {
                if (self.passThroughModule.address !== 0) {
                    console.log('[FxSwUpdateTCP] Activating pass-through mode for address:', self.passThroughModule.address);

                    return (
                        notifyProgress({status : "Activating pass-through mode...", progress : 5})
                        .then(Q.fbind(repeatUntilResolvedOrNoRetriesLeft, Q.fbind(self.setupBootMode, true, false), 100, NUM_OF_RETRIES))
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
            .delay(500)
            .then(Q.fbind(notifyProgress, {status : "Setting up device to the programming mode...", progress : 7}))
            .then(function() {
                console.log('[FxSwUpdateTCP] Setting device to programming mode...');

                return (
                    repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.startSwProgramming), 100, NUM_OF_RETRIES)
                    .then(function() {
                        console.log('[FxSwUpdateTCP] Device set to programming mode successfully');
                    })
                    .catch(function(err) {
                        console.error('[FxSwUpdateTCP] Failed to set device to programming mode:', err);
                        return Q.reject("Unable to set device to the programming mode : " + err);
                    })
                )
            })
            .delay(500)
            .then(Q.fbind(notifyProgress, {phase : "Programming", status : "Programming device... ", progress : 10}))
            .then(function() {
                console.log('[FxSwUpdateTCP] Starting data transfer... Total packets:', m_TotalPacketCount);
                return transferData();
            })
            .then(function() {
                console.log('[FxSwUpdateTCP] Data transfer completed successfully');
            })
            .delay(500)
            .then(Q.fbind(notifyProgress, {phase : "Finishing", status : "Restoring device back to the normal mode...", progress : 95}))
            .then(function() {
                return (
                    repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.endSwProgramming), 100, NUM_OF_RETRIES)
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
            m_Options.responseTimeout = 5000;
            m_FileBuffer = new Buffer( new Uint8Array(options.data) );

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
