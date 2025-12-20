// Copyright 2024 - Modbus TCP Master
// Based on FxModbusRTUMaster.js but adapted for TCP transport
// TCP uses MBAP header instead of CRC
//
// ============================================================================
// TRANSPARENT MODE SUPPORT - IMPLEMENTED (2024-12-17)
// ============================================================================
// This module supports two TCP connection modes:
//
// 1. STANDARD MODE (m_TransparentMode = false) - Default
//    - For gateways in "Modbus TCP to RTU" mode (e.g., Waveshare RS485-to-ETH)
//    - Uses MBAP header (7 bytes) for framing
//    - Gateway handles RTU CRC conversion automatically
//
// 2. TRANSPARENT MODE (m_TransparentMode = true)
//    - For gateways in "None" (transparent/raw TCP) mode
//    - Uses RTU frame format with CRC-16
//    - Frame: Address(1) + FunctionCode(1) + Data(n) + CRC(2)
//    - Gateway passes bytes through unchanged
//
// To enable transparent mode, call setTransparentMode(true) before
// performing Modbus operations. This affects:
// - readHoldingRegisters()
// - writeSingleRegister()
// - writeMultipleRegisters()
// - readInputRegisters()
// - writeSingleCoil()
// - writeMultipleCoils()
// - readCoils()
// - readDeviceIdentification()
//
// Pass-through addressing is supported in both modes.
// Passthrough frame format: [MasterAddr][TargetAddr+1][FC][Data][CRC]
// ============================================================================
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const assert = require('assert');
const util = require('util');
const fxTcpSocket = require('../FxUtils/FxTcpSocket.js');
const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
// TCP Modbus defaults (can be overridden by options)
const TCP_RESPONSE_TIMEOUT_DEFAULT = 5000;      // Default response timeout (increased for TCP converters)
const TCP_TRANSACTION_BUFFER_SIZE = 5;          // Max queued transactions
const TCP_TRANSACTION_DELAY_MIN = 1;            // Minimum delay between transactions

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from fxTcpSocket (instead of fxSerial for RTU)
util.inherits(fxModbusTCPMaster, fxTcpSocket);

function fxModbusTCPMaster() {

    // Request to create base class
    fxModbusTCPMaster.super_.call(this);

    // Prevent ERR_UNHANDLED_ERROR crashes - attach default error handler
    this.on('error', function(err) {
        fxLog.error('FxModbusTCPMaster error event: ' + err);
    });

    // *******************************************************************
    // PRIVATE VARIABLES
    // *******************************************************************
    var self = this;

    // Transaction buffer
    var m_TransactionQueue = [];
    var m_TransactionDelay = TCP_TRANSACTION_DELAY_MIN;

    // Transaction ID for MBAP header (increments with each request)
    var m_TransactionId = 0;

    // Request and response buffers
    var m_Request = null;
    var m_Response = null;
    var m_Closing = false;

    // Transparent mode flag - when true, use RTU format (with CRC) instead of MBAP header
    var m_TransparentMode = false;

    // *******************************************************************
    // PUBLIC VARIABLES
    // *******************************************************************
    this.responseTimeout = TCP_RESPONSE_TIMEOUT_DEFAULT;
    this.transactionCounter = 0;
    this.validResponseCounter = 0;
    this.timeoutCounter = 0;
    this.tcpErrorCounter = 0;

    // *******************************************************************
    // PRIVATE FUNCTIONS
    // *******************************************************************

    // Async sleep
    function asyncSleep(milliseconds) {
        return Q.promise(resolve => setTimeout(resolve, milliseconds));
    }

    // Build MBAP header for Modbus TCP
    // MBAP Header: Transaction ID (2) + Protocol ID (2) + Length (2) + Unit ID (1)
    function buildMBAPHeader(unitId, pduLength) {
        var header = Buffer.alloc(7);

        // Transaction ID (2 bytes) - auto-increment
        m_TransactionId = (m_TransactionId + 1) & 0xFFFF;
        header[0] = (m_TransactionId >> 8) & 0xFF;
        header[1] = m_TransactionId & 0xFF;

        // Protocol ID (2 bytes) - always 0x0000 for Modbus
        header[2] = 0x00;
        header[3] = 0x00;

        // Length (2 bytes) - Unit ID (1) + PDU length
        var length = 1 + pduLength;
        header[4] = (length >> 8) & 0xFF;
        header[5] = length & 0xFF;

        // Unit ID (1 byte) - slave address
        header[6] = unitId;

        return header;
    }

    // Build TCP request (MBAP header + PDU, no CRC)
    function buildRequest(is_pass_through, offset, pdu, unitId) {
        fxLog.trace("buildRequest TCP...");

        return Q.resolve().then(function() {
            // For pass-through, the unit ID is already in the PDU
            // We don't need CRC for TCP
            var mbapHeader = buildMBAPHeader(unitId, pdu.length - offset);

            // Combine MBAP header with PDU (excluding the offset bytes if pass-through)
            var request = Buffer.concat([mbapHeader, pdu.slice(offset)]);

            return request;
        });
    }

    // Check TCP response (after MBAP header has been stripped)
    // At this point, response[0] = Unit ID, response[1] = Function Code, etc.
    function checkResponse(addressToWait, response, responseLength) {
        fxLog.trace("checkResponse TCP...");

        return Q.resolve().then(function() {
            // Minimum response is unit ID (1) + function code (1)
            if (response.length < 2) {
                return Q.reject("Invalid response length");
            }

            // Check for Modbus exception (function code with high bit set)
            if (response[1] & 0x80) {
                var exceptionCode = response[2];
                return Q.reject("Modbus exception: " + exceptionCode);
            }

            return Q.resolve();
        });
    }

    // Get response from device (TCP version)
    function getResponse(addressToWait, response, expectedLength, msTimeout) {
        fxLog.trace("getResponse TCP...");

        var deferred = Q.defer();

        // Receive handler
        var l_iPos = 0;
        var responseBuffer = Buffer.alloc(expectedLength + 7); // +7 for MBAP header

        var onReceive = function(data) {
            // Copy received data to response buffer
            for (var i = 0; i < data.length && l_iPos < responseBuffer.length; i++) {
                responseBuffer[l_iPos++] = data[i];
            }

            // Check if we have received the MBAP header (7 bytes)
            if (l_iPos >= 7) {
                // Get expected length from MBAP header
                var mbapLength = (responseBuffer[4] << 8) | responseBuffer[5];
                var totalExpectedLength = 6 + mbapLength; // 6 bytes before length field + length

                // If we have received the full response
                if (l_iPos >= totalExpectedLength) {
                    self.removeListener('receive', onReceive);
                    clearTimeout(onTimeout);

                    // Copy response (excluding MBAP header for compatibility with RTU code)
                    // But we need to include the unit ID (byte 6) as the first byte
                    response[0] = responseBuffer[6]; // Unit ID as address

                    // Copy PDU (after MBAP header)
                    for (var j = 7; j < totalExpectedLength; j++) {
                        response[j - 6] = responseBuffer[j];
                    }

                    deferred.resolve();
                    return;
                }
            }
        }

        self.on('receive', onReceive);

        // Timeout handler
        var onTimeout = setTimeout(function () {
            self.removeListener('receive', onReceive);
            deferred.reject("Timeout");
        }, msTimeout);

        return deferred.promise;
    }

    // Get response from device (RTU mode - for transparent TCP)
    // RTU response: Address(1) + FunctionCode(1) + Data(n) + CRC(2)
    function getResponseRTU(addressToWait, response, expectedDataLength, msTimeout) {
        fxLog.trace("getResponseRTU...");

        var deferred = Q.defer();

        // Expected total length: Address(1) + FC(1) + Data(expectedDataLength) + CRC(2)
        var expectedLength = 2 + expectedDataLength + 2;
        var l_iPos = 0;
        var responseBuffer = Buffer.alloc(expectedLength + 10); // Extra buffer for safety

        var onReceive = function(data) {
            // Copy received data to response buffer
            for (var i = 0; i < data.length && l_iPos < responseBuffer.length; i++) {
                responseBuffer[l_iPos++] = data[i];
            }

            fxLog.trace("getResponseRTU: received " + l_iPos + "/" + expectedLength + " bytes");

            // Check if we have minimum data to determine response length
            if (l_iPos >= 3) {
                var fc = responseBuffer[1];

                // Handle exception response (FC with high bit set)
                if (fc & 0x80) {
                    // Exception response: Address(1) + FC(1) + ExceptionCode(1) + CRC(2) = 5 bytes
                    if (l_iPos >= 5) {
                        self.removeListener('receive', onReceive);
                        clearTimeout(onTimeout);

                        // Copy response (without CRC)
                        for (var j = 0; j < 3; j++) {
                            response[j] = responseBuffer[j];
                        }
                        deferred.resolve();
                        return;
                    }
                } else {
                    // For read functions (FC 1,2,3,4), byte 2 is the byte count
                    // For write functions (FC 5,6,15,16), response is fixed length
                    var totalLength;

                    if (fc === 1 || fc === 2 || fc === 3 || fc === 4) {
                        // Read response: Address(1) + FC(1) + ByteCount(1) + Data(n) + CRC(2)
                        var byteCount = responseBuffer[2];
                        totalLength = 3 + byteCount + 2;
                    } else if (fc === 5 || fc === 6) {
                        // Write single: Address(1) + FC(1) + Addr(2) + Value(2) + CRC(2) = 8
                        totalLength = 8;
                    } else if (fc === 15 || fc === 16) {
                        // Write multiple: Address(1) + FC(1) + Addr(2) + Qty(2) + CRC(2) = 8
                        totalLength = 8;
                    } else {
                        // Default: use expected length
                        totalLength = expectedLength;
                    }

                    // If we have received enough data
                    if (l_iPos >= totalLength) {
                        self.removeListener('receive', onReceive);
                        clearTimeout(onTimeout);

                        // Copy response (without CRC) for compatibility with TCP code
                        // response[0] = address, response[1] = FC, response[2+] = data
                        for (var j = 0; j < totalLength - 2; j++) {
                            response[j] = responseBuffer[j];
                        }

                        fxLog.trace("getResponseRTU complete: " + responseBuffer.slice(0, totalLength).toString('hex'));
                        deferred.resolve();
                        return;
                    }
                }
            }
        }

        self.on('receive', onReceive);

        // Timeout handler
        var onTimeout = setTimeout(function () {
            self.removeListener('receive', onReceive);
            fxLog.debug("getResponseRTU timeout after " + msTimeout + "ms, received " + l_iPos + " bytes");
            deferred.reject("Timeout");
        }, msTimeout);

        return deferred.promise;
    }

    // Do transaction with modbus device (RTU mode - for transparent TCP)
    // RTU frame: Address(1) + FunctionCode(1) + Data(n) + CRC(2)
    // Passthrough frame: MasterAddr(1) + TargetAddr+1(1) + FunctionCode(1) + Data(n) + CRC(2)
    function doTransactionRTU(address, pdu, response, expectedDataLength, msTimeout) {
        fxLog.trace("doTransactionRTU...");

        // Increment transaction counter
        self.transactionCounter++;

        // Check if passthrough mode (address is array [masterAddr, targetAddr])
        var is_pass_through = (typeof(address) == 'object');
        var targetAddress = is_pass_through ? address[1] : address;
        var offset = is_pass_through ? 1 : 0;

        // Build RTU frame: [MasterAddr?] + Address + PDU + CRC
        var frameLength = offset + 1 + pdu.length;
        var frame = Buffer.alloc(frameLength + 2); // +2 for CRC

        // Add master address if passthrough
        if (is_pass_through) {
            frame[0] = address[0];
        }

        // Add target address (NOT incremented yet - CRC must be calculated first!)
        frame[offset] = targetAddress;

        // Copy PDU
        pdu.copy(frame, offset + 1);

        // Address to wait in response (will be incremented)
        var addressToWait = is_pass_through ? targetAddress + 1 : targetAddress;

        // Calculate and append CRC (from offset for passthrough, 0 for direct)
        // IMPORTANT: CRC is calculated BEFORE incrementing the address
        return self.getCRC(frame, offset, offset + 1 + pdu.length)
        .then(function(crc) {
            frame[frameLength] = crc[0];     // CRC low byte
            frame[frameLength + 1] = crc[1]; // CRC high byte

            // NOW increment target address by 1 if passthrough (AFTER CRC calculation)
            if (is_pass_through) {
                frame[offset]++;
            }

            var logMsg = "[Modbus RTU] TX: " + frame.toString('hex');
            if (is_pass_through) {
                logMsg += " (passthrough: master=" + address[0] + ", target=" + targetAddress + ")";
            }
            console.log(logMsg);
            fxLog.debug("doTransactionRTU: sending " + frame.toString('hex') + (is_pass_through ? " (passthrough)" : ""));

            // Send full frame (including master address if passthrough)
            return self.write(frame, 0, frame.length);
        })
        .fail(function(err) {
            self.tcpErrorCounter++;
            return Q.reject(err);
        })
        // Wait response
        .then(function() {
            return getResponseRTU(addressToWait, response, expectedDataLength, msTimeout)
            .fail(function(err) {
                self.timeoutCounter++;
                console.log("[Modbus RTU] RX TIMEOUT after " + msTimeout + "ms (waiting for addr " + addressToWait + ")");
                return Q.reject(err);
            });
        })
        // Check if response is valid
        .then(function() {
            console.log("[Modbus RTU] RX: " + response.slice(0, expectedDataLength + 3).toString('hex'));

            // Decrement address in response if passthrough
            if (is_pass_through) {
                response[0]--;
            }

            // Check for Modbus exception
            if (response[1] & 0x80) {
                var exceptionCode = response[2];
                console.log("[Modbus RTU] Exception code: " + exceptionCode);
                return Q.reject("Modbus exception: " + exceptionCode);
            }

            self.validResponseCounter++;
            fxLog.trace("RTU Transaction succeeded...");
            return Q.resolve();
        });
    }

    // Do transaction with modbus device (TCP version)
    function doTransaction(isPassThough, request, response, responseLength, msTimeout) {
        fxLog.trace("doTransaction TCP...");

        // Increment transaction counter
        self.transactionCounter++;

        var l_AddressToWait = (isPassThough ? request[7] : request[6]); // Unit ID from MBAP

        return (
            // Send request
            self.write(request, 0, request.length)
            .fail(function (err) {self.tcpErrorCounter++; return Q.reject(err);})
            // Wait response
            .then(function() {
                return (
                    getResponse(l_AddressToWait, response, responseLength, msTimeout)
                    .fail(function (err) {self.timeoutCounter++; return Q.reject(err);})
                )
            })
            // Check if response is valid
            .then(function () {
                // If pass-through mode, decrement module address by 1
                if (isPassThough)
                    response[0]--;

                // Check response (no CRC for TCP)
                return checkResponse(l_AddressToWait, response, responseLength);
            })
            // Succeeded
            .then(function () {
                self.validResponseCounter++;
                fxLog.trace("Transaction succeeded...");
            })
        )
    }

    // Get encapsulated response from device (TCP version)
    function getEncapsulatedResponse(addressToWait, response, msTimeout) {
        fxLog.trace("getEncapsulatedResponse TCP...");

        var deferred = Q.defer();

        // Receive handler
        var l_iPos = 0;
        var l_NumOfObjects = 1;
        var l_TotalLength = 255;
        var responseBuffer = Buffer.alloc(300); // Large enough buffer

        var onReceive = function(data) {
            for (var i = 0; i < data.length; i++) {
                responseBuffer[l_iPos] = data[i];

                // Once we have MBAP header, get total length
                if (l_iPos >= 6) {
                    var mbapLength = (responseBuffer[4] << 8) | responseBuffer[5];
                    l_TotalLength = 6 + mbapLength;
                }

                // If required byte count received
                if (l_iPos >= (l_TotalLength - 1)) {
                    self.removeListener('receive', onReceive);
                    clearTimeout(onTimeout);

                    // Copy to response array (excluding MBAP header except unit ID)
                    response.length = 0;
                    response[0] = responseBuffer[6]; // Unit ID
                    for (var j = 7; j < l_TotalLength; j++) {
                        response[j - 6] = responseBuffer[j];
                    }

                    deferred.resolve();
                    return;
                }

                l_iPos++;
            }
        }

        self.on('receive', onReceive);

        // Timeout handler
        var onTimeout = setTimeout(function () {
            self.removeListener('receive', onReceive);
            deferred.reject("Timeout");
        }, msTimeout);

        return deferred.promise;
    }

    // Do encapsulated transaction (TCP version)
    function doEncapsulatedTransaction(isPassThough, request, response, msTimeout) {
        fxLog.trace("doEncapsulatedTransaction TCP...");

        self.transactionCounter++;

        var l_AddressToWait = (isPassThough ? request[7] : request[6]);

        return (
            self.write(request, 0, request.length)
            .fail(function (err) {self.tcpErrorCounter++; return Q.reject(err);})
            .then(function() {
                return (
                    getEncapsulatedResponse(l_AddressToWait, response, msTimeout)
                    .fail(function (err) {self.timeoutCounter++; return Q.reject(err);})
                )
            })
            .then(function () {
                if (isPassThough)
                    response[0]--;

                return checkResponse(l_AddressToWait, response, response.length);
            })
            .then(function () {
                self.validResponseCounter++;
                fxLog.trace("Transaction succeeded...");
                return Q.resolve();
            })
        )
    }

    // Handle encapsulated response
    function handleEncapsulatedResponse(response, values) {
        var deferred = Q.defer();

        Q.resolve()
        .then(function() {
            if (response.length < 8)
                throw ("doEncapsulatedTransaction: Invalid response length");

            var l_NumOfObjects = response[7];
            var l_TotalLength = 7;

            for (var i = 0; i < l_NumOfObjects; i++) {
                l_TotalLength += 2;
                var l_ObjectLength = response[l_TotalLength];
                values[i] = "";

                for (var j = (l_TotalLength + 1); j <= (l_TotalLength + l_ObjectLength); j++)
                    values[i] += String.fromCharCode(response[j]);

                l_TotalLength += l_ObjectLength;
            }
        })
        .then(deferred.resolve)
        .catch(deferred.reject)

        return deferred.promise;
    }

    // *******************************************************************
    // INTERFACE FUNCTIONS
    // *******************************************************************

    // Open TCP connection
    this.openConnection = function(host, options) {
        fxLog.debug("openConnection TCP to " + host + ":" + options.tcpPort);

        // Set response timeout
        if (options.responseTimeout)
            self.setResponseTimeout(options.responseTimeout);

        m_TransactionDelay = options.transactionDelay || TCP_TRANSACTION_DELAY_MIN;

        m_Closing = false;
        m_TransactionQueue = [];

        // Open TCP connection
        return self.open(host, options.tcpPort, options);
    }

    // Close TCP connection
    this.closeConnection = function() {
        m_Closing = true;

        return (
            self.waitForBusFree()
            .delay(10)
            .then(Q.fbind(self.close))
        )
    }

    // Set response timeout
    this.setResponseTimeout = function(timeout) {
        assert((typeof(timeout) == 'number'), 'setResponseTimeout: Invalid parameter (timeout)');
        fxLog.trace("Set timeout = " + timeout);
        self.responseTimeout = timeout;
    }

    // Set transparent mode (RTU over TCP - no MBAP header, use CRC instead)
    this.setTransparentMode = function(enabled) {
        m_TransparentMode = enabled;
        fxLog.debug("FxModbusTCPMaster transparent mode " + (enabled ? "enabled" : "disabled"));
    }

    // Check if transparent mode is enabled
    this.isTransparentMode = function() {
        return m_TransparentMode;
    }

    // Get transaction promise
    this.getTransactionPromise = function(deferred) {
        if (m_Closing === true) {
            return Q.reject("closing connection");
        }

        if (m_TransactionQueue.length >= TCP_TRANSACTION_BUFFER_SIZE)
            return Q.reject("Modbus transaction buffer is full...");

        deferred = deferred || Q.defer();

        async function givePromise(defer, promiseToWait) {
            const delay = Math.max(m_TransactionDelay, TCP_TRANSACTION_DELAY_MIN);
            if (promiseToWait) {
                await promiseToWait.promise;
            }
            await asyncSleep(delay);
            return defer;
        }

        const promiseToWait = (m_TransactionQueue.length) ? m_TransactionQueue[m_TransactionQueue.length - 1].promise : Q.resolve();

        m_TransactionQueue.push(deferred);

        Q.when(deferred.promise, () => m_TransactionQueue.shift(), () => m_TransactionQueue.shift());

        return givePromise(deferred, promiseToWait);
    }

    // Check if bus is free
    this.isBusFree = function() {
        return Q.resolve(m_TransactionQueue.length == 0);
    }

    // Wait for bus free
    this.waitForBusFree = function() {
        var deferred = Q.defer();

        function waitBus() {
            self.isBusFree()
            .then(function(is_free) {
                if (is_free)
                    deferred.resolve();
                else
                    setTimeout(waitBus, 5);
            })
        }

        waitBus();

        return deferred.promise;
    }

    // CRC calculation for Modbus RTU frames
    // Used in transparent mode when sending raw RTU frames over TCP
    // NOTE: Third parameter is END INDEX (exclusive), NOT length!
    // This matches FxModbusRTUMaster.getCRC behavior
    this.getCRC = function (request, offset, endIndex, crc) {
        fxLog.trace("getCRC (TCP)...");

        crc = crc || [0, 0];

        // Standard CRC-16 Modbus calculation
        var crcFull = 0xFFFF;
        let crcHigh = 0xFF;
        let crcLow = 0xFF;
        var crcLSB;

        // Loop from offset to endIndex (exclusive) - matches RTU version
        for (let i = offset; i < endIndex; i++) {
            crcFull = crcFull ^ request[i];
            for (let j = 0; j < 8; j++) {
                crcLSB = crcFull & 0x0001;
                crcFull = (crcFull >> 1) & 0x7FFF;
                if (crcLSB == 1)
                    crcFull = crcFull ^ 0xA001;
            }
        }

        // Return CRC values (low byte first, then high byte)
        crcHigh = (crcFull >> 8) & 0xFF;
        crc[1] = crcHigh;

        crcLow = crcFull & 0xFF;
        crc[0] = crcLow;

        return Q.resolve(crc);
    }

    // Function 16 - Write Multiple Registers
    this.writeMultipleRegisters = function(address, start_reg, reg_count, values) {
        fxLog.debug("writeMultipleRegisters" + (m_TransparentMode ? " RTU" : " TCP") + "... Address = " + address + ", Start = " + start_reg + ", Count = " + reg_count);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeMultipleRegisters: Invalid parameter (address)');
                assert.equal(typeof(start_reg), 'number', 'writeMultipleRegisters: Invalid parameter (start_reg)');
                assert.equal(typeof(reg_count), 'number', 'writeMultipleRegisters: Invalid parameter (reg_count)');
                assert.equal(typeof(values), 'object', 'writeMultipleRegisters: Invalid parameter (values)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);

                // Build PDU (without MBAP header, without CRC)
                // FC(1) + StartAddr(2) + Qty(2) + ByteCount(1) + Data(2*n) = 6 + 2*n
                var pduLength = 6 + 2 * reg_count;
                var pdu = Buffer.alloc(pduLength);

                pdu[0] = 16; // Function code
                pdu[1] = (start_reg >> 8);
                pdu[2] = start_reg;
                pdu[3] = (reg_count >> 8);
                pdu[4] = reg_count;
                pdu[5] = (reg_count * 2);

                for (var i = 0; i < reg_count; i++) {
                    pdu[6 + 2 * i] = (values[i] >> 8);
                    pdu[7 + 2 * i] = values[i];
                }

                m_Response = Buffer.alloc(20);

                // Transparent mode: use RTU format (Address + PDU + CRC)
                // Pass full address (may be array for passthrough) to doTransactionRTU
                if (m_TransparentMode) {
                    // Expected response data: FC(1) + StartAddr(2) + Qty(2) = 5 bytes
                    return doTransactionRTU(address, pdu, m_Response, 5, self.responseTimeout)
                    .then(deferred.resolve)
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    });
                }

                // TCP mode: use MBAP header
                // If pass-through, prepend the pass-through address
                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(pduLength + 1);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                // Build MBAP header and combine with PDU
                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);

                return (
                    doTransaction(is_pass_through, m_Request, m_Response, 8, self.responseTimeout)
                    .then(deferred.resolve)
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Function 6 - Write Single Register
    this.writeSingleRegister = function (address, register, value) {
        fxLog.debug("writeSingleRegister" + (m_TransparentMode ? " RTU" : " TCP") + "... Address = " + address + ", Register = " + register + ", Data = " + value);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeSingleRegister: Invalid parameter (address)');
                assert.equal(typeof(register), 'number', 'writeSingleRegister: Invalid parameter (register)');
                assert.equal(typeof(value), 'number', 'writeSingleRegister: Invalid parameter (value)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);

                // Build PDU: FC(1) + Register(2) + Value(2) = 5 bytes
                var pdu = Buffer.alloc(5);
                pdu[0] = 6; // Function code
                pdu[1] = (register >> 8);
                pdu[2] = register;
                pdu[3] = (value >> 8);
                pdu[4] = value;

                m_Response = Buffer.alloc(20);

                // Transparent mode: use RTU format (Address + PDU + CRC)
                // Pass full address (may be array for passthrough) to doTransactionRTU
                if (m_TransparentMode) {
                    // Expected response data: FC(1) + Register(2) + Value(2) = 5 bytes
                    return doTransactionRTU(address, pdu, m_Response, 5, self.responseTimeout)
                    .then(deferred.resolve)
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    });
                }

                // TCP mode: use MBAP header
                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(6);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);

                return (
                    doTransaction(is_pass_through, m_Request, m_Response, 8, self.responseTimeout)
                    .then(deferred.resolve)
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Function 3 - Read Holding Registers
    this.readHoldingRegisters = function (address, start_reg, reg_count, values) {
        fxLog.debug("readHoldingRegisters" + (m_TransparentMode ? " RTU" : " TCP") + "... Address = " + address + ", Start = " + start_reg + ", Count = " + reg_count);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'readHoldingRegisters: Invalid parameter (address)');
                assert.equal(typeof(start_reg), 'number', 'readHoldingRegisters: Invalid parameter (start_reg)');
                assert.equal(typeof(reg_count), 'number', 'readHoldingRegisters: Invalid parameter (reg_count)');
                assert.equal(typeof(values), 'object', 'readHoldingRegisters: Invalid parameter (values)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);

                // Build PDU: FC(1) + StartAddr(2) + RegCount(2) = 5 bytes
                var pdu = Buffer.alloc(5);
                pdu[0] = 3; // Function code
                pdu[1] = (start_reg >> 8);
                pdu[2] = start_reg;
                pdu[3] = (reg_count >> 8);
                pdu[4] = reg_count;

                m_Response = Buffer.alloc(7 + 3 + 2 * reg_count);

                // Transparent mode: use RTU format (Address + PDU + CRC)
                // Pass full address (may be array for passthrough) to doTransactionRTU
                if (m_TransparentMode) {
                    // Expected response data: FC(1) + ByteCount(1) + Data(2*n) = 2 + 2*reg_count
                    return doTransactionRTU(address, pdu, m_Response, 2 + 2 * reg_count, self.responseTimeout)
                    .then(function() {
                        // Copy response data to the value table
                        // Response format: Address(1) + FC(1) + ByteCount(1) + Data(2*n)
                        for (var i = 0; (i < reg_count) && (m_Response[1] === 3); i++) {
                            values[i] = (m_Response[3 + (2 * i)] << 8);
                            values[i] += m_Response[4 + (2 * i)];
                        }
                        deferred.resolve();
                    })
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    });
                }

                // TCP mode: use MBAP header
                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(6);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);

                return (
                    doTransaction(is_pass_through, m_Request, m_Response, 5 + 2 * reg_count, self.responseTimeout)
                    .then(function() {
                        // Copy response data to the value table
                        for (var i = 0; (i < reg_count) && (m_Response[1] === 3); i++) {
                            values[i] = (m_Response[3 + (2 * i)] << 8);
                            values[i] += m_Response[4 + (2 * i)];
                        }
                        deferred.resolve();
                    })
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Function 4 - Read Input Registers
    this.readInputRegisters = function (address, start_reg, reg_count, values) {
        fxLog.debug("readInputRegisters TCP... Address = " + address + ", Start = " + start_reg + ", Count = " + reg_count);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'readInputRegisters: Invalid parameter (address)');
                assert.equal(typeof(start_reg), 'number', 'readInputRegisters: Invalid parameter (start_reg)');
                assert.equal(typeof(reg_count), 'number', 'readInputRegisters: Invalid parameter (reg_count)');
                assert.equal(typeof(values), 'object', 'readInputRegisters: Invalid parameter (values)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);

                var pdu = Buffer.alloc(5);
                pdu[0] = 4; // Function code
                pdu[1] = (start_reg >> 8);
                pdu[2] = start_reg;
                pdu[3] = (reg_count >> 8);
                pdu[4] = reg_count;

                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(6);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);
                m_Response = Buffer.alloc(7 + 3 + 2 * reg_count);

                return (
                    doTransaction(is_pass_through, m_Request, m_Response, 5 + 2 * reg_count, self.responseTimeout)
                    .then(function() {
                        for (var i = 0; (i < reg_count) && (m_Response[1] === 4); i++) {
                            values[i] = (m_Response[3 + (2 * i)] << 8);
                            values[i] += m_Response[4 + (2 * i)];
                        }
                        deferred.resolve();
                    })
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Function 5 - Write Single Coil
    this.writeSingleCoil = function (address, register, value) {
        fxLog.debug("writeSingleCoil TCP... Address = " + address + ", Register = " + register + ", Data = " + value);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeSingleCoil: Invalid parameter (address)');
                assert.equal(typeof(register), 'number', 'writeSingleCoil: Invalid parameter (register)');
                assert.equal(typeof(value), 'number', 'writeSingleCoil: Invalid parameter (value)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);

                var pdu = Buffer.alloc(5);
                pdu[0] = 5; // Function code
                pdu[1] = (register >> 8);
                pdu[2] = register;
                pdu[3] = (value >> 8);
                pdu[4] = value;

                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(6);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);
                m_Response = Buffer.alloc(20);

                return (
                    doTransaction(is_pass_through, m_Request, m_Response, 8, self.responseTimeout)
                    .then(deferred.resolve)
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Function 15 - Write Multiple Coils
    this.writeMultipleCoils = function(address, start_reg, quantity_of_outputs, value) {
        fxLog.debug("writeMultipleCoils TCP... Address = " + address + ", Start = " + start_reg + ", Count = " + quantity_of_outputs);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeMultipleCoils: Invalid parameter (address)');
                assert.equal(typeof(start_reg), 'number', 'writeMultipleCoils: Invalid parameter (start_reg)');
                assert.equal(typeof(quantity_of_outputs), 'number', 'writeMultipleCoils: Invalid parameter (quantity_of_outputs)');
                assert.equal(typeof(value), 'object', 'writeMultipleCoils: Invalid parameter (values)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);
                var byte_count = Math.ceil(quantity_of_outputs / 8);

                var pdu = Buffer.alloc(6 + byte_count);
                pdu[0] = 15; // Function code
                pdu[1] = (start_reg >> 8);
                pdu[2] = start_reg;
                pdu[3] = (quantity_of_outputs >> 8);
                pdu[4] = quantity_of_outputs;
                pdu[5] = byte_count;

                for (var i = 0; i < byte_count; i++) {
                    pdu[6 + i] = value[i] || 0;
                }

                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(pdu.length + 1);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);
                m_Response = Buffer.alloc(20);

                return (
                    doTransaction(is_pass_through, m_Request, m_Response, 8, self.responseTimeout)
                    .then(deferred.resolve)
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Function 1 - Read Coils
    this.readCoils = function (address, start_reg, quantity_of_coils, values) {
        fxLog.debug("readCoils TCP... Address = " + address + ", Start = " + start_reg + ", Count = " + quantity_of_coils);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'readCoils: Invalid parameter (address)');
                assert.equal(typeof(start_reg), 'number', 'readCoils: Invalid parameter (start_reg)');
                assert.equal(typeof(quantity_of_coils), 'number', 'readCoils: Invalid parameter (quantity_of_coils)');
                assert.equal(typeof(values), 'object', 'readCoils: Invalid parameter (values)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);
                var byte_count = Math.ceil(quantity_of_coils / 8);

                var pdu = Buffer.alloc(5);
                pdu[0] = 1; // Function code
                pdu[1] = (start_reg >> 8);
                pdu[2] = start_reg;
                pdu[3] = (quantity_of_coils >> 8);
                pdu[4] = quantity_of_coils;

                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(6);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);
                m_Response = Buffer.alloc(7 + 3 + byte_count);

                return (
                    doTransaction(is_pass_through, m_Request, m_Response, 3 + byte_count, self.responseTimeout)
                    .then(function() {
                        for (var i = 0; (i < byte_count) && (m_Response[1] === 1); i++) {
                            values[i] = m_Response[3 + i];
                        }
                        deferred.resolve();
                    })
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }

    // Function 43 - Read Device Identification
    this.readDeviceIdentification = function(address, device_id, object_id, values) {
        fxLog.debug("readDeviceIdentification TCP... Address = " + address + ", DeviceID = " + device_id + ", ObjectID = " + object_id);

        return (
            Q.resolve()
            .then(function() {
                assert(self.isOpen, 'TCP socket is not open');
                assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'ReadDeviceIdentification: Invalid parameter (address)');
                assert.equal(typeof(device_id), 'number', 'ReadDeviceIdentification: Invalid parameter (device_id)');
                assert.equal(typeof(object_id), 'number', 'ReadDeviceIdentification: Invalid parameter (object_id)');
                assert.equal(typeof(values), 'object', 'ReadDeviceIdentification: Invalid parameter (values)');
            })
            .then(Q.fbind(self.getTransactionPromise))
            .then(function(deferred) {
                if ((typeof(address) == 'object') && (address[0] == 0))
                    address = address[1];

                var is_pass_through = (typeof(address) == 'object');
                var unitId = (is_pass_through ? address[1] : address);

                var pdu = Buffer.alloc(4);
                pdu[0] = 43; // Function code
                pdu[1] = 0x0E; // MEI type
                pdu[2] = device_id;
                pdu[3] = object_id;

                if (is_pass_through) {
                    var passThroughPdu = Buffer.alloc(5);
                    passThroughPdu[0] = address[1];
                    pdu.copy(passThroughPdu, 1);
                    pdu = passThroughPdu;
                    unitId = address[0];
                }

                var mbapHeader = buildMBAPHeader(unitId, pdu.length);
                m_Request = Buffer.concat([mbapHeader, pdu]);
                m_Response = [];

                return (
                    doEncapsulatedTransaction(is_pass_through, m_Request, m_Response, self.responseTimeout)
                    .then(Q.fbind(handleEncapsulatedResponse, m_Response, values))
                    .then(deferred.resolve)
                    .fail(function(err) {
                        deferred.reject(err);
                        throw err;
                    })
                )
            })
            .catch(function(err) {
                self.emit('error', err, fxLog.error(err));
                return Q.reject(err);
            })
        )
    }
}

module.exports = fxModbusTCPMaster;
