// Copyright 2024 - TCP version of FxFwUpdate
// Based on FxFwUpdate.js but uses TCP transport
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const assert = require('assert');
const util = require('util');
const fxDeviceTCP = require('./FxDeviceTCP.js');
const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});
const Q = require('q');
const fs = require('fs-extra');
const path = require('path');

const logFilePath = path.resolve(__dirname, '../logsJeedom.txt');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

console.log = function(message) {
    logStream.write(message + '\n');
};

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
const NUM_OF_RETRIES = 10;
const PORT_STABILIZATION_DELAY = 500;

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from fxDeviceTCP (instead of fxDevice for RTU)
util.inherits(fxFwUpdateTCP, fxDeviceTCP);

function fxFwUpdateTCP() {

    if (!(this instanceof fxFwUpdateTCP)) {
        return new (Function.prototype.bind.apply(fxFwUpdateTCP, [null, ...arguments]));
    }

    fxFwUpdateTCP.super_.call(this);

    // *******************************************************************
    // PRIVATE VARIABLES
    // *******************************************************************
    var self = this;
    var m_Deferred = Q.defer();
    var m_Options = {};
    var m_HexData = [];

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
        fxLog.trace("repeatUntilResolvedOrNoRetriesLeft TCP... interval = " + interval + ", retries = " + retries);

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

    function hexWordFromString(str, pos) {
        var hexstr = str.substring(pos, pos + 4);
        return (parseInt("0x" + hexstr, 16));
    }

    function hexByteFromString(str, pos) {
        var hexstr = str.substring(pos, pos + 2);
        return (parseInt("0x" + hexstr, 16));
    }

    function hexGetCRC(pageCount, pageSize) {
        fxLog.trace("hexGetCRC TCP...");

        let l_CheckSum = 0;
        let i;

        for (i = 0; i < (pageCount - 1); i++) {
            for (let j = 0; j < pageSize; j++)
                l_CheckSum += m_HexData[i][j];
        }

        for (let j = 0; j < (pageSize - 2); j++)
            l_CheckSum += m_HexData[i][j];

        l_CheckSum &= 0xffff;

        var l_CRC = [0, 0];
        l_CRC[0] = (l_CheckSum >> 0);
        l_CRC[1] = (l_CheckSum >> 8);

        return Q.resolve(l_CRC);
    }

    function getHexData(buffer) {
        fxLog.trace("getHexData TCP...");

        var l_Offset = 0;
        var l_BufferPos = 0;
        var l_ReadString = "";
        var l_DataBytes, l_BaseAddress, l_RecordType = 0;
        var l_Checksum, l_CalculatedChecksum = 0;

        var deferred = Q.defer();

        self.targetModule.getModuleInfo()
        .then(function(moduleinfo) {

            var l_PageSize = moduleinfo.pageSizeB;
            var l_PageCount = moduleinfo.programPageCount;
            var l_AddressOffset = moduleinfo.bootloaderSizeB;
            var cnt;
            var l_Line = 0;

            var l_EmptyPage = [];
            for (cnt = 0; cnt < l_PageSize; cnt++)
                l_EmptyPage[cnt] = 0xFF;

            m_HexData = [];
            for (var page = 0; page < l_PageCount; page++)
                m_HexData[page] = new Buffer(l_EmptyPage);

            do {
                l_ReadString = "";

                while (true) {
                    var ch = buffer.toString('ascii', l_BufferPos, l_BufferPos + 1);
                    l_BufferPos++;

                    if (ch == ':')
                        break;

                    l_ReadString += ch;

                    if (l_BufferPos >= buffer.length)
                        break;
                }

                l_Line++;

                if (l_Line > 1) {
                    l_DataBytes = hexByteFromString(l_ReadString, 0);
                    l_BaseAddress = hexWordFromString(l_ReadString, 2);
                    l_RecordType = hexByteFromString(l_ReadString, 6);
                    l_Checksum = hexByteFromString(l_ReadString, 8 + (2 * l_DataBytes));

                    l_CalculatedChecksum = 0;
                    for (cnt = 0; cnt < l_DataBytes + 4; cnt++)
                        l_CalculatedChecksum += hexByteFromString(l_ReadString, 2 * cnt);

                    l_CalculatedChecksum = (255 - (l_CalculatedChecksum % 256) + 1) % 256;

                    if (l_CalculatedChecksum != l_Checksum)
                        throw ("Checksum error of hex buffer");

                    if (l_RecordType == 0) {
                        var l_Address, l_PagePos, l_Page, l_Byte = 0;

                        for (cnt = 0; cnt < l_DataBytes; cnt++) {
                            l_Address = l_Offset + l_BaseAddress + cnt;
                            l_PagePos = Math.floor(l_Address % l_PageSize);
                            l_Page = Math.floor(l_Address / l_PageSize);

                            if (l_Page >= l_PageCount)
                                throw ("Page " + l_Page + " of hex file is out of buffer");

                            l_Byte = hexByteFromString(l_ReadString, 8 + (cnt * 2));
                            m_HexData[l_Page][l_PagePos] = l_Byte;
                        }
                    }
                    else if (l_RecordType == 1)
                        break;
                    else if (l_RecordType == 2)
                        l_Offset = 16 * hexWordFromString(l_ReadString, 8);
                    else if (l_RecordType == 4) {
                        l_Offset = hexByteFromString(l_ReadString, 10);
                        l_Offset <<= 16;
                        l_Offset -= l_AddressOffset;
                    }
                    else if (l_RecordType == 5)
                        ;
                    else
                        throw ("Invalid record type");
                }

            } while (l_BufferPos < buffer.length);

            return (
                hexGetCRC(l_PageCount, l_PageSize)
                .then(function(CRC) {
                    m_HexData[l_PageCount - 1][l_PageSize - 2] = CRC[0];
                    m_HexData[l_PageCount - 1][l_PageSize - 1] = CRC[1];
                    return (Q.resolve());
                })
            )
        })
        .then(deferred.resolve)
        .catch(deferred.reject)

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
        var l_PageCount = 0;

        fxLog.trace("transferData TCP");

        function waitDeviceReady(page) {
            return (
                self.getFwPageAddress()
                .then(function(pageReported) {
                    if (pageReported == 0xFFFF) {
                        deferred.resolve();
                        return (Q.resolve(0xFFFF));
                    }
                    else if ((pageReported < 0) || (pageReported >= l_PageCount)) {
                        return Q.reject("Invalid page address " + pageReported + " reported by device...");
                    }
                    else if (pageReported != (page + 1)) {
                        return (
                            Q.fcall(function() {
                                if (l_RetryCounter++ >= NUM_OF_RETRIES)
                                    return Q.reject("Device is not ready for next page " + (page + 1));
                            })
                            .delay(50)
                            .thenResolve(page)
                        )
                    }

                    page = pageReported;
                    l_RetryCounter = 0;
                    return Q.resolve(page);
                })
                .then(function(page) {
                    if (page != 0xFFFF)
                        return process.nextTick(sendPacket.bind(null, page));
                })
                .catch(function(err) {
                    deferred.reject(err);
                })
            )
        }

        function sendPacket(page) {
            return (
                Q.fcall(self.programFwPage, m_HexData[page], page)
                .then(Q.fbind(notifyProgress, {progress : 10 + (80 * page / l_PageCount)}))
                .then(function() {
                    return waitDeviceReady(page);
                })
                .catch (function(err) {
                    if (l_RetryCounter++ >= NUM_OF_RETRIES)
                        deferred.reject(err);
                    else
                        return process.nextTick(sendPacket.bind(null, page));
                })
            )
        }

        var page = -1;
        self.targetModule.getModuleInfo()
        .then(function(moduleinfo) {
            l_PageCount = moduleinfo.programPageCount;
            waitDeviceReady(page);
        })
        .catch(deferred.reject)

        return deferred.promise;
    }

    function doProgram() {
        fxLog.trace("doProgram TCP...");
        console.log('[FxFwUpdateTCP] Starting firmware update via TCP...')

        return (
            notifyProgress({phase : "Preparing", status : "Checking buffer data...", progress : 0})
            .then(function() {
                console.log('[FxFwUpdateTCP] Checking buffer data...');
                return Q.fbind(getHexData, m_Options.data)();
            })
            .then(Q.fbind(notifyProgress, {status : "Opening TCP connection...", progress : 2}))
            .then(function() {
                // TCP connection: host is m_Options.host, port is m_Options.tcpPort
                console.log('[FxFwUpdateTCP] Opening TCP connection to:', m_Options.host + ':' + m_Options.tcpPort);
                return Q.fbind(self.openConnection, m_Options.host, m_Options)();
            })
            .then(function() {
                console.log('[FxFwUpdateTCP] TCP connection opened successfully');
            })
            .delay(PORT_STABILIZATION_DELAY)
            .then(function() {
                console.log('[FxFwUpdateTCP] Connection stabilized after ' + PORT_STABILIZATION_DELAY + 'ms delay');
            })
            .then(Q.fbind(notifyProgress, {status : "Activating boot mode...", progress : 5}))
            .then(function() {
                console.log('[FxFwUpdateTCP] Activating boot Mode...')
                return (
                    repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.setupBootMode, (self.passThroughModule.address !== 0), true), 100, NUM_OF_RETRIES)
                    .fail(function (err) {
                        console.log('[FxFwUpdateTCP] Error during boot mode activation')
                        return (Q.reject("Unable to activate boot mode : " + err));
                    })
                )
            })
            .delay(500)
            .then(Q.fbind(notifyProgress, {status : "Setting up device to the programming mode...", progress : 7}))
            .then(function() {
                console.log('[FxFwUpdateTCP] Setting up device to the programming mode...');
                return (
                    repeatUntilResolvedOrNoRetriesLeft(self.setupFwProgramMode, 100, NUM_OF_RETRIES)
                    .fail(function(err) {
                        return (Q.reject("Unable to set device to the programming mode : " + err));
                    })
                )
            })
            .delay(500)
            .then(Q.fbind(notifyProgress, {phase : "Programming", status : "Programming device... ", progress : 10}))
            .then(function() {
                console.log("[FxFwUpdateTCP] Programming phase started");
                return Q.fbind(transferData)();
            })
            .delay(500)
            .then(Q.fbind(notifyProgress, {phase : "Programming OK", status : "Device programmed successfully...", progress : 100}))
            .then(function() {
                console.log("[FxFwUpdateTCP] Programming phase completed successfully");
            })
            .catch(function (err) {
                self.emit('error', err, fxLog.error(err));
                notifyProgress({phase : "Programming ERROR", status : err, progress : 0})
                return (Q.reject(err));
            })
            .fin(function() {
                m_HexData = null;
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

            options.data = new Buffer( new Uint8Array(options.data) );

            m_Options = options || {};
            m_Options.responseTimeout = 5000;

            m_Deferred = Q.defer();

            doProgram().then(m_Deferred.resolve, m_Deferred.reject)
            .fin(function() {options.data = null});
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
            m_Deferred.reject('Programming cancelled...');
        }

        return m_Deferred.promise;
    }

    this.isBusy = function() {
        fxLog.trace("isBusy...");
        return (m_Deferred.state === 'pending');
    }
}

module.exports = fxFwUpdateTCP;
