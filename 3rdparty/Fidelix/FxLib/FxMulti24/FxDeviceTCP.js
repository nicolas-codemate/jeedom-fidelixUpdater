// Copyright 2024 - TCP version of FxDevice
// Based on FxDevice.js but uses TCP transport instead of RTU
//
// ============================================================================
// LIMITATION: PROPRIETARY COMMANDS NOT SUPPORTED VIA TCP GATEWAYS
// ============================================================================
// Functions like askBootVersion(), sendBootModeCommand(), sendPassThroughCommand(),
// and setupFwProgramMode() use proprietary Fidelix commands ("Versio", "Passth",
// "Progrb") that are NOT standard Modbus. These are sent as raw bytes.
//
// These functions will NOT work through Modbus TCP gateways because:
// 1. Gateways in "Modbus TCP to RTU" mode expect valid Modbus frames
// 2. Gateways in "Transparent" mode require CRC checksums (not generated here)
//
// Only standard Modbus operations (readHoldingRegisters, writeSingleRegister,
// writeMultipleRegisters) work via TCP gateways.
// ============================================================================
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const assert = require('assert');
const util = require('util');
const fxModbusTCP = require('../FxModbus/').fxModbusTCPMaster;
const fxModuleInfo = require('./FxModuleInfo.js');
const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
// TCP timeouts (longer than RTU due to converter latency)
const TCP_WAIT_PATTERN_TIMEOUT = 5000;          // Timeout for pattern matching responses
const TCP_PROGRAMMING_MODE_DELAY = 3000;        // Delay after programming mode command
const TCP_PROGRAMMING_MODE_RETRIES = 10;        // Number of retries for programming mode
const TCP_PROGRAMMING_MODE_RETRY_DELAY = 2000;  // Delay between retries

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from fxModbusTCP (instead of fxModbusRTU)
util.inherits(fxDeviceTCP, fxModbusTCP);

function fxDeviceTCP() {

    // Request to create base class
    fxDeviceTCP.super_.call(this);

    // Prevent ERR_UNHANDLED_ERROR crashes - attach default error handler
    this.on('error', function(err) {
        fxLog.error('FxDeviceTCP error event: ' + err);
    });

    // *******************************************************************
    // PRIVATE VARIABLES
    // *******************************************************************
    var self = this;

    // *******************************************************************
    // PUBLIC VARIABLES
    // *******************************************************************
    this.targetModule = new fxModuleInfo();
    this.passThroughModule = new fxModuleInfo();

    // *******************************************************************
    // PRIVATE FUNCTIONS
    // *******************************************************************

    // Wait for a specific pattern from TCP socket
    function tryReadPattern(rxBuffer, patternToWait, patternLength, bytesBefore, bytesAfter, msTimeout) {
        var deferred = Q.defer();

        var l_iPos = 0;
        var l_PatternFound = false;

        fxLog.trace("tryReadPattern TCP... Pattern = " + patternToWait.toString('hex') + ", Timeout = " + msTimeout + " ms");

        var onReceive = function(data) {
            try {
                for (var ch = 0; ch < data.length; ch++) {
                    rxBuffer[l_iPos] = data[ch];

                    if (l_iPos >= (patternLength + bytesBefore + bytesAfter - 1)) {
                        var i = 0;
                        while (rxBuffer[bytesBefore + i] == patternToWait[i]) {
                            i++;
                            if (i >= patternLength) {
                                l_PatternFound = true;
                                break;
                            }
                        }

                        if (l_PatternFound) {
                            self.removeListener('receive', onReceive);
                            clearTimeout(onTimeout);
                            deferred.resolve();
                            return;
                        }

                        for (var j = 1; j <= l_iPos; j++)
                            rxBuffer[j - 1] = rxBuffer[j];
                    }
                    else
                        l_iPos++;
                }
            }
            catch (err) {
                self.removeListener('receive', onReceive);
                clearTimeout(onTimeout);
                deferred.reject(err);
                return;
            }
        }

        self.on('receive', onReceive);

        var onTimeout = setTimeout(function () {
            self.removeListener('receive', onReceive);
            deferred.reject("Timeout");
        }, msTimeout);

        return deferred.promise;
    }

    // Ask boot version from device
    function askBootVersion(address, version) {
        var l_Buffer = new Buffer(20);
        var l_Offset = 1;

        fxLog.trace("askBootVersion TCP... Address = " + address);

        return (
            Q.fcall(function() {
                version = 0.0;
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'AskBootVersion: Invalid parameter (address)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');

                l_Buffer[1] = (is_pass_through ? address[1] : address);
                l_Buffer.write('Versio\0', 2);

                if (is_pass_through) {
                    l_Buffer[0] = address[0];
                    l_Buffer[1]++;
                    l_Offset = 0;
                }

                self.write(l_Buffer, l_Offset, (9 - l_Offset))
                .then(function() {
                    var l_PatternToWait = new Buffer(2);
                    l_PatternToWait[0] = l_Buffer[1];
                    l_PatternToWait.write('V', 1);

                    return (tryReadPattern(l_Buffer, l_PatternToWait, 2, 0, 4, TCP_WAIT_PATTERN_TIMEOUT))
                })
                .then(deferred.resolve)
                .catch(deferred.reject)

                return deferred.promise;
            })
            .then(function() {
                version = version || "";
                version += String.fromCharCode(l_Buffer[2]);
                version += String.fromCharCode(l_Buffer[3]);
                version += String.fromCharCode(l_Buffer[4]);
                version += String.fromCharCode(l_Buffer[5]);
                return Q.resolve(version);
            })
            .catch(function(err) {
                err = "AskBootVersion error : " + err;
                return (Q.reject(err));
            })
        )
    }

    // Send pass-through command to the device
    function sendPassThroughCommand() {
        var l_Buffer = new Buffer(20);
        var l_Offset = 1;

        fxLog.trace("sendPassThroughCommand TCP...");

        return (
            Q.fcall(function() {
                assert(self.isOpen, 'TCP socket is not open');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                l_Buffer[1] = self.passThroughModule.address;
                l_Buffer.write('Passth\0', 2);

                self.write(l_Buffer, l_Offset, (9 - l_Offset))
                .then(function() {
                    var l_PatternToWait = new Buffer(3);
                    l_PatternToWait[0] = l_Buffer[1];
                    l_PatternToWait.write('OK', 1);

                    return (tryReadPattern(l_Buffer, l_PatternToWait, 3, 0, 0, TCP_WAIT_PATTERN_TIMEOUT))
                })
                .then(deferred.resolve)
                .catch(deferred.reject)

                return deferred.promise;
            })
            .catch(function(err) {
                err = "sendPassThroughCommand error : " + err;
                return Q.reject(err);
            })
        )
    }

    // Send boot mode command to the device
    function sendBootModeCommand(sendToPassThroughDevice) {
        var l_PassThroughAddress = (sendToPassThroughDevice ? 0 : self.passThroughModule.address);
        var l_ModuleAddress = (sendToPassThroughDevice ? self.passThroughModule.address : self.targetModule.address);

        fxLog.trace("sendBootModeCommand TCP... PassThrough = " + sendToPassThroughDevice);

        return (
            Q.fcall(function() {
                if (sendToPassThroughDevice)
                    return (self.passThroughModule.getModuleInfo());

                return (self.targetModule.getModuleInfo());
            })
            .then(function(moduleinfo) {
                return (
                    Q.resolve()
                    .then(Q.fbind(self.writeSingleRegister, [l_PassThroughAddress, l_ModuleAddress], moduleinfo.bootloaderStartRegister, 0xFFFF))
                    .delay(500)
                    .then(Q.fbind(self.writeSingleRegister, [l_PassThroughAddress, l_ModuleAddress], moduleinfo.bootloaderStartRegister, 0x5555))
                )
            })
            .catch(function(err) {
                err = "sendBootModeCommand error : " + err;
                return Q.reject(err);
            })
        )
    }

    // *******************************************************************
    // INTERFACE FUNCTIONS
    // *******************************************************************

    // Setup device to the boot mode
    this.setupBootMode = function(setPassThroughModule, setTargetModule) {
        fxLog.debug("setupBootMode TCP... PassThrough = " + setPassThroughModule + ", Target = " + setTargetModule);

        function setupPassThroughDevice() {
            return (
                askBootVersion(self.passThroughModule.address)
                .fail(function() {
                    return (
                        Q.delay(50)
                        .then(Q.fbind(sendBootModeCommand, true))
                        .delay(500)
                        .then(Q.fbind(askBootVersion, self.passThroughModule.address))
                    )
                })
                .then(function(version) {
                    if (version == "0.0") {
                        return Q.reject("Unable to set pass-through device to boot mode");
                    }
                    return (Q.resolve(version));
                })
                .delay(50)
                .then(sendPassThroughCommand)
                .delay(50)
                .catch(Q.reject)
            )
        }

        function setupTargetDevice() {
            return (
                askBootVersion([self.passThroughModule.address, self.targetModule.address])
                .fail(function() {
                    return (
                        Q.delay(50)
                        .then(Q.fbind(sendBootModeCommand, false))
                        .delay(500)
                        .then(Q.fbind(askBootVersion, [self.passThroughModule.address, self.targetModule.address]))
                    )
                })
                .then(function(version) {
                    if (version == "0.0") {
                        return Q.reject("Unable to set target device to boot mode");
                    }
                    return (Q.resolve(version));
                })
            )
        }

        return (
            Q.resolve()
            .then(function() {
                if (setPassThroughModule)
                    return setupPassThroughDevice();
            })
            .then(function() {
                if (setTargetModule)
                    return setupTargetDevice();
            })
            .then(Q.resolve)
            .catch(function(err) {
                err = "setupBootMode error : " + err;
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Start software update sequence
    this.startSwProgramming = function() {
        var l_Values = new Buffer(4);

        fxLog.debug("startSwProgramming TCP...");

        return (
            self.readHoldingRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3E, 2, l_Values)
            .delay(50)
            .then(function() {
                if ((l_Values[0] == 0xAAAA) || (l_Values[1] == 0)) {
                    l_Values[0] = 0xFFFF;
                    l_Values[1] = 0xFFFF;
                    return (self.writeMultipleRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3E, 2, l_Values).delay(500).thenResolve());
                }
            })
            .then(Q.fbind(self.writeSingleRegister, [self.passThroughModule.address, self.targetModule.address], 0xFF3E, 0xAAAA))
            .delay(TCP_PROGRAMMING_MODE_DELAY)
            .then(function() {
                var deferred = Q.defer();
                var retrycount = TCP_PROGRAMMING_MODE_RETRIES;

                function doLoop() {
                    self.readHoldingRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3F, 1, l_Values)
                    .then(function () {
                        if (l_Values[0] != 0)
                            throw ("Device is not in programming mode yet, retry");

                        deferred.resolve();
                    })
                    .catch(function(err) {
                        (retrycount-- <= 0) ? deferred.reject(err) : setTimeout(doLoop, TCP_PROGRAMMING_MODE_RETRY_DELAY);
                    })
                }

                doLoop();

                return deferred.promise;
            })
            .catch(function(err) {
                err = "startSwProgramming error : " + err;
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Read software packet counter from the device
    this.getSwPacketCounter = function() {
        var l_Values = [0];

        fxLog.debug("getSwPacketCounter TCP...");

        return (
            self.readHoldingRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3F, 1, l_Values)
            .then(function() {
                return Q.resolve(l_Values[0]);
            })
            .catch(function(err) {
                err = "getSwPacketCounter error : " + err;
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Wait for a specific software packet counter
    this.waitSwPacketCounter = function(packetCounterToWait, msTimeout) {
        var deferred = Q.defer();

        fxLog.debug("waitSwPacketCounter TCP... " + packetCounterToWait);

        function doLoop() {
            self.getSwPacketCounter()
            .then(function(packetCounter) {
                if (packetCounter == packetCounterToWait)
                    deferred.resolve(packetCounter);
                else
                    setTimeout(doLoop, 5);
            })
            .catch(deferred.reject);
        }

        doLoop();

        deferred.promise.timeout(msTimeout)
        .catch(function(err) {
            err = "waitSwPacketCounter error : " + err;
            self.emit('error', err, fxLog.error(err));
            deferred.reject(err);
        })

        return deferred.promise;
    }

    // Send single software packet to the device
    this.sendSwPacket = function(packet, packetCounter) {
        fxLog.debug("sendSwPacket TCP... " + packetCounter);

        packet[64] = packetCounter;

        return (
            self.writeMultipleRegisters([self.passThroughModule.address, self.targetModule.address], 0xFEFE, 65, packet)
            .catch(function(err) {
                err = "sendSwPacket error : " + err;
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // End software update sequence
    this.endSwProgramming = function() {
        var l_Values = [0,0];

        fxLog.debug("endSwProgramming TCP...");

        return (
            self.writeSingleRegister([self.passThroughModule.address, self.targetModule.address], 0xFF3E, 0xBBBB)
            .delay(500)
            .then(Q.fbind(self.readHoldingRegisters, [self.passThroughModule.address, self.targetModule.address], 0xFF3F, 1, l_Values))
            .then(function() {
                if (l_Values[0] == 0x2222)
                    return Q.resolve();
                else if (l_Values[0] == 0x0101)
                    throw("Device reported about unsuccessful programming...");
                else
                    throw("Unable to set device back to the normal mode...");
            })
            .catch(function(err) {
                err = "endSwProgramming error : " + err;
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Setup device for firmware programming mode
    this.setupFwProgramMode = function() {
        var l_Buffer = new Buffer(20);
        var l_Offset = 1;

        fxLog.trace("setupFwProgramMode TCP...");

        return (
            Q.fcall(function() {
                assert(self.isOpen, 'TCP socket is not open');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                l_Buffer[1] = self.targetModule.address;
                l_Buffer.write('Progrb\0\0', 2);

                if (self.passThroughModule.address != 0) {
                    l_Buffer[0] = self.passThroughModule.address;
                    l_Buffer[1]++;
                    l_Offset = 0;
                }

                self.write(l_Buffer, l_Offset, 10 - l_Offset)
                .then(self.getFwPageAddress)
                .then(function(pageAddress) {
                    deferred.resolve(pageAddress);
                })
                .catch(deferred.reject)

                return deferred.promise;
            })
        )
    }

    // Get firmware page address
    this.getFwPageAddress = function() {
        var l_Buffer = new Buffer(20);

        fxLog.trace("getFwPageAddress TCP...");

        return (
            Q.fcall(function() {
                assert(self.isOpen, 'TCP socket is not open');
            })
            .then(function() {
                var l_PatternToWait = new Buffer(2);
                l_PatternToWait[0] = ((self.passThroughModule.address != 0) ? (self.targetModule.address + 1) : self.targetModule.address);
                l_PatternToWait.write('p', 1);

                return (tryReadPattern(l_Buffer, l_PatternToWait, 2, 0, 4, TCP_WAIT_PATTERN_TIMEOUT))
            })
            .then(function() {
                if (self.passThroughModule.address != 0)
                    l_Buffer[0]--;

                return (
                    self.getCRC(l_Buffer, 0, 4)
                    .then(function(CRC) {
                        if ((CRC[0] != l_Buffer[4]) || (CRC[1] != l_Buffer[5]))
                            return (Q.reject("CRC-error"));

                        return (Q.resolve());
                    })
                    .then(function() {
                        var pageAddress = l_Buffer[2];
                        pageAddress <<= 8;
                        pageAddress |= l_Buffer[3];

                        return (Q.resolve(pageAddress));
                    })
                )
            })
        )
    }

    // Program firmware page
    this.programFwPage = function(pageData, pageAddress) {
        fxLog.trace("programFwPage TCP... pageAddress = " + pageAddress);

        return (
            Q.fcall(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert((typeof(pageData) == 'object'), 'ProgramFwPage: Invalid parameter (pageData)');
                assert((typeof(pageAddress) == 'number'), 'ProgramFwPage: Invalid parameter (pageAddress)');
            })
            .then(function() {
                var l_PageSize = pageData.length;
                var l_Buffer = new Buffer(l_PageSize + 4);

                l_Buffer[0] = self.passThroughModule.address;
                l_Buffer[1] = self.targetModule.address;

                pageData.copy(l_Buffer, 2);

                return (
                    self.getCRC(l_Buffer, 1, l_PageSize + 2)
                    .then(function(CRC) {
                        l_Buffer[l_PageSize + 2] = CRC[1];
                        l_Buffer[l_PageSize + 3] = CRC[0];
                    })
                    .then(function() {
                        if (self.passThroughModule.address != 0) {
                            l_Buffer[1]++;
                            return self.write(l_Buffer, 0, l_PageSize + 4);
                        }
                        else
                            return self.write(l_Buffer, 1, l_PageSize + 3);
                    })
                )
            })
        )
    }

}

module.exports = fxDeviceTCP;
