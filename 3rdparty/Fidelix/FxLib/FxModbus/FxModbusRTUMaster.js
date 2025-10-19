// Copyright 2014 Fidelix Oy / Kai Kämäräinen
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const assert = require('assert');
const util = require('util');
const fxSerial = require('../FxUtils/').fxSerial;
const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
const RESPONSE_TIMEOUT_DEFAULT = 200;
const TRANSACTION_BUFFER_SIZE = 5;
const TRANSACTION_DELAY_MIN = 1;

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from event emitter
util.inherits(fxModbusRTUMaster, fxSerial);

function fxModbusRTUMaster() {

	// Request to create base class
	fxModbusRTUMaster.super_.call(this);
	
	// *******************************************************************
	// PRIVATE VARIABLES
	// *******************************************************************
	// In some callback context, this does not refer to fxSerial instance
	// -> catch reference of this to self and use always self below
	var self = this;

	// Transaction buffer
	var m_TransactionQueue = [];
	var m_TransactionDelay = TRANSACTION_DELAY_MIN;

	// Request and response buffers
	var m_Request = null;
	var m_Response = null;
	var m_Closing = false;

	// *******************************************************************
	// PUBLIC VARIABLES
	// *******************************************************************	
	this.responseTimeout = RESPONSE_TIMEOUT_DEFAULT;
	this.transactionCounter = 0;
	this.validResponseCounter = 0;
	this.timeoutCounter = 0;
	this.crcErrorCounter = 0;
	this.serialComErrorCounter = 0;
	
	// *******************************************************************
	// PRIVATE FUNCTIONS
	// *******************************************************************

	// Async sleep
	/*private*/ function asyncSleep(milliseconds) {
		return Q.promise(resolve => setTimeout(resolve, milliseconds));
	}

	// Build request
	/*private*/ function buildRequest(is_pass_through, offset, request) {

		fxLog.trace("buildRequest...");

		return (
			// Calculate CRC and add it to the frame
			self.getCRC(request, offset, request.length - 2)
			.then(function(CRC) {
				request[request.length - 2] = CRC[0];
				request[request.length - 1] = CRC[1];
			})
			// If pass-through -mode, increment module address by 1			
			.then(function() {
				if (is_pass_through)
					request[offset + 0]++; 
			})
		)
	}
	
	// Check that received response frame is valid
	/*private*/ function checkResponse(addressToWait, response, responseLength) {

		fxLog.trace("checkResponse...");
				
		// CRC requires 2 bytes
		var CRC = [0,0];

		return (
			// Calculate CRC from response frame
			self.getCRC(response, 0, responseLength - 2, CRC)
			.then(function(CRC) {
				// Compare calculated CRC to the CRC of the frame
				if ((CRC[0] == response[responseLength - 2]) && (CRC[1] == response[responseLength - 1]))
					return (Q.resolve());
				else
					return (Q.reject("CRC-error"));
			})
		)
	}

	// Get response from device
	/*private*/ function getResponse(addressToWait, response, length, msTimeout)
	{
		fxLog.trace("getResponse...");

		var deferred = Q.defer();
		
		// Receive handler
		var l_iPos = 0;		
		var onReceive = function(data) {
			
			for (var i = 0; i < data.length; i++) {
				// Handle one byte at time
				response[l_iPos] = data[i];

				// Skip to the next location of the buffer if address match
				if (response[0] == addressToWait)
					l_iPos++;

				// If required byte count received...
				if (l_iPos >= length) {			
					self.removeListener('receive', onReceive);
					clearTimeout(onTimeout);
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

	/*private*/ function doTransaction(isPassThough, request, response, responseLength, msTimeout)
	{
		fxLog.trace("doTransaction...");
		
		// Increment trasaction counter
		self.transactionCounter++;
				
		var l_AddressToWait = (isPassThough ? request[1] : request[0]);			
		
		return (
			// Send request
			self.write(request, 0, request.length)
			.fail(function (err) {self.serialComErrorCounter++; return Q.reject(err);})
			// Wait response
			.then(function() {

				return (
					getResponse(l_AddressToWait, response, responseLength, msTimeout)
					.fail(function (err) {self.timeoutCounter++; return Q.reject(err);})
				)
			})
			// Check if response is valid
			.then(function () {
				// If pass-through -mode, decrement module address by 1
				if (isPassThough)
					response[0]--;

				// Check reponse frame
				return (
					checkResponse(l_AddressToWait, response, responseLength)
					.fail(function (err) {self.crcErrorCounter++; return Q.reject(err);})
				)
			})
			// Succeeded
			.then(function () {
				// Increment counter of valid responses
				self.validResponseCounter++;
				fxLog.trace("Transaction succeeded...");			
			})
		)
	}

	// Get encapsulated response from device
	/*private*/ function getEncapsulatedResponse(addressToWait, response, msTimeout) {

		fxLog.trace("getEncapsulatedResponse...");
	
		var deferred = Q.defer();
				
		// Receive handler
		var l_iPos = 0;
		var l_NumOfObjects = 1;
		var l_TotalLength = 255;
	
		var onReceive = function(data) {
				
			for (var i = 0; i < data.length; i++) {
					
				// Handle one byte at time
				response[l_iPos] = data[i];

				// Get total length of data
				if (l_iPos >= 7) {

					// Get object count and define initial length
					l_NumOfObjects = response[7];
					l_TotalLength = 7;

					// Loop all objects
					for (var j = 0; j < l_NumOfObjects; j++) {

						// Add object ID and length
						l_TotalLength += 2;

						// If length received, add also length
						if (l_iPos >= l_TotalLength)
							l_TotalLength += response[l_TotalLength];
					}
				}
				
				// If required byte count + CRC received...
				if (l_iPos >= (l_TotalLength + 2)) {

					self.removeListener('receive', onReceive);
					clearTimeout(onTimeout);
					deferred.resolve();	
					return;				
				}

				// Skip to the next location of the buffer if address match
				if (response[0] == addressToWait)
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

	// Do enscapsulated transaction with modbus device
	/*private*/ function doEncapsulatedTransaction(isPassThough, request, response, msTimeout) {

		fxLog.trace("doEncapsulatedTransaction...");
		
		// Increment trasaction counter
		self.transactionCounter++;

		var l_AddressToWait = (isPassThough ? request[1] : request[0]);	
		
		return (
			// Send request
			self.write(request, 0, request.length)
			.fail(function (err) {self.serialComErrorCounter++; return Q.reject(err);})
			// Wait response
			.then(function() {

				return (
					getEncapsulatedResponse(l_AddressToWait, response, msTimeout)
					.fail(function (err) {self.timeoutCounter++; return Q.reject(err);
					})
				)
			})			
			// Check if response is valid
			.then(function () {
				// If pass-through -mode, decrement module address by 1
				if (isPassThough)
					response[0]--;

				// Check reponse frame
				return (
					checkResponse(l_AddressToWait, response, response.length)
					.fail(function (err) {self.crcErrorCounter++; return Q.reject(err);})
				)				
			})
			// Succeeded
			.then(function () {
				// Increment counter of valid responses
				self.validResponseCounter++;
				fxLog.trace("Transaction succeeded...");
				return Q.resolve()
			})
		)
	}	
	
	// Handle enscapsulated response received from modbus device
	/*private*/ function handleEncapsulatedResponse(response, values) { 

		var deferred = Q.defer();

		Q.resolve()
		.then(function() {
			// Check that response legth is at least 8 (object count + first object id + length exists)
			if (response.length < 8)
				throw ("doEncapsulatedTransaction: Invalid response length");
			
			// Copy response data to the string array
			var l_NumOfObjects = response[7];
			var l_TotalLength = 7;

			// Loop all objects
			for (var i = 0; i < l_NumOfObjects; i++) {
				// Add object ID and length
				l_TotalLength += 2;
				var l_ObjectLength = response[l_TotalLength];
				values[i] = "";

				// Copy ascii data from buffer
				for (var j = (l_TotalLength + 1); j <= (l_TotalLength + l_ObjectLength); j++)
					values[i] += String.fromCharCode(response[j]);

				// Increment total length
				l_TotalLength += l_ObjectLength;                    
			}
		})
		.then(deferred.resolve)
		.catch(deferred.reject)
			
		return deferred.promise;
	}
	
	// *******************************************************************
	// EVENT HANDLERS
	// *******************************************************************
	
	// *******************************************************************
	// INTERFACE FUNCTIONS
	// *******************************************************************		

	// Open serial port connection
	/*public*/ this.openConnection = function(port, options) {	
		
		// Set response timeout
		if (options.responseTimeout)
			self.setResponseTimeout(options.responseTimeout);

		m_TransactionDelay = options.transactionDelay || TRANSACTION_DELAY_MIN;

		m_Closing = false;
		m_TransactionQueue = [];

		// Open connetion
		return (self.open(port, options));
	}

	// Close serial port connection
	/*public*/ this.closeConnection = function() {

		// Set closing flag to prevent new transactions
		m_Closing = true;

		// Wait for bus free before closing connection
		return (
			self.waitForBusFree()
			.delay(10)
			.then(Q.fbind(self.close))
		)
	}

	// Set response timeout
	/*public*/ this.setResponseTimeout = function(timeout) {

		// Check parameters
		assert((typeof(timeout) == 'number'), 'setResponseTimeout: Invalid parameter (timeout)');
		
		fxLog.trace("Set timeout = " + timeout);
		self.responseTimeout = timeout;
	}
	
	// Get transaction promise (wait if there is transaction pending)
	/*public*/ this.getTransactionPromise = function(deferred) {

		// If closing, do not give promise
		if (m_Closing === true) {
			return Q.reject("closing connection"); 
		}

		// Check if there is space in the transaction buffer
		if (m_TransactionQueue.length >= TRANSACTION_BUFFER_SIZE)
			return Q.reject("Modbus transaction buffer is full...");

		// Check parameters
		deferred = deferred || Q.defer();

		// Function to give promise for transaction...
		async function givePromise(defer, promiseToWait) {
			const delay = Math.max(m_TransactionDelay, TRANSACTION_DELAY_MIN);
			if (promiseToWait) {
				await promiseToWait.promise;
			}
			await asyncSleep(delay);

			return defer;
		}

		// Promise to wait
		const promiseToWait = (m_TransactionQueue.length) ? m_TransactionQueue[m_TransactionQueue.length - 1].promise : Q.resolve();

		// Push transaction to queue
		m_TransactionQueue.push(deferred);

        // When resolved or rejected, remove from buffer
        Q.when(deferred.promise, () => m_TransactionQueue.shift(), () => m_TransactionQueue.shift());
		
		// Wait for previous transaction end and give promise after that
		return givePromise(deferred, promiseToWait);
	}

	// Check if bus is free (no buffered transaction pending)
	/*public*/ this.isBusFree = function() {
	
		return Q.resolve(m_TransactionQueue.length == 0);
	}

	// Check if bus is free (no buffered transaction pending)
	/*public*/ this.waitForBusFree = function() {
	
		// Create promise
		var deferred = Q.defer();

		// Wait loop
		function waitBus() {
					
			self.isBusFree()
			.then(function(is_free) {
				if (is_free)
					deferred.resolve();
				else 
					setTimeout(waitBus, 5);
			})
		}
		
		// Trig waiting
		waitBus();
		
		return deferred.promise;
	}	
	
	// Calculate CRC of modus frame
	/*public*/ 
	this.getCRC = function (request, offset, length, crc) {

		fxLog.trace("getCRC...");
		
		crc = crc || [0,0];

		// Standard way to calculate CRC for Modbus frame
		var crcFull = 0xFFFF;
		let crcHigh = 0xFF;
		let crcLow = 0xFF;
		var crcLSB;

		for (var i = offset; i < length; i++) {
		
			crcFull = crcFull ^ request[i];

			for (var j = 0; j < 8; j++)	{
				crcLSB = crcFull & 0x0001;
				crcFull = (crcFull >> 1) & 0x7FFF;

				if (crcLSB == 1)
					crcFull = crcFull ^ 0xA001;
			}
		}

		// Return CRC values
		crcHigh = (crcFull >> 8) & 0xFF;
		crc[1] = crcHigh;

		crcLow = crcFull & 0xFF;
		crc[0] = crcLow;
		
		return (Q.resolve(crc));
	}

	// Function 16 - Write Multiple Registers (with pass-through support)
	/*public*/ this.writeMultipleRegisters = function(address, start_reg, reg_count, values) {

		fxLog.debug("writeMultipleRegisters... Address = " + address + ", Start = " + start_reg + ", Count = " + reg_count + ", Data = " + values);

		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeMultipleRegisters: Invalid parameter (address)');
				assert.equal(typeof(start_reg), 'number', 'writeMultipleRegisters: Invalid parameter (start_reg)');
				assert.equal(typeof(reg_count), 'number', 'writeMultipleRegisters: Invalid parameter (reg_count)');	
				assert.equal(typeof(values), 'object', 'writeMultipleRegisters: Invalid parameter (values)');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {

				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);			

				// Request is 1 addr + 1 fcn + 2 start + 2 reg + 1 count + 2 * reg vals + 2 CRC
				m_Request = new Buffer(offset + 9 + 2 * reg_count);
				// Function 16 response is fixed at 8 bytes
				m_Response = new Buffer(8);
				
				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					m_Request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 16; // Function code
				m_Request[offset + 2] = (start_reg >> 8);
				m_Request[offset + 3] = start_reg;
				m_Request[offset + 4] = (reg_count >> 8);
				m_Request[offset + 5] = reg_count;

				// Add byte count to request
				m_Request[offset + 6] = (reg_count * 2);

				// Add writable values to the frame
				for (var i = 0; i < reg_count; i++) {
					m_Request[offset + 7 + 2 * i] = (values[i] >> 8);
					m_Request[offset + 8 + 2 * i] = (values[i]);
				}
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doTransaction, is_pass_through, m_Request, m_Response, m_Response.length, self.responseTimeout))
					.then(deferred.resolve)
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
					})
				)
			})
			.catch(function(err) {
				self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);
			})
		)
	}

	// Function 6 - Write Single Register (with pass-through support)
	/*public*/ this.writeSingleRegister = function (address, register, value) {

		fxLog.debug("writeSingleRegister... Address = " + address + ", Register = " + register + ", Data = " + value);		
		
		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');
			
				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeSingleRegister: Invalid parameter (address)');
				assert.equal(typeof(register), 'number', 'writeSingleRegister: Invalid parameter (register)');
				assert.equal(typeof(value), 'number', 'writeSingleRegister: Invalid parameter (value)');	
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
		
				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);			
		
				// Request is 1 addr + 1 fcn + 2 reg + 2 reg val + 2 CRC
				m_Request = new Buffer(offset + 6 + 2);
				// Function 6 response is fixed at 8 bytes
				m_Response = new Buffer(8);

				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					m_Request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 6; // Function code
				m_Request[offset + 2] = (register >> 8);
				m_Request[offset + 3] = register;
				m_Request[offset + 4] = (value >> 8);
				m_Request[offset + 5] = value;
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doTransaction, is_pass_through, m_Request, m_Response, m_Response.length, self.responseTimeout))
					.then(deferred.resolve)
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
					})
				)
			})
			.catch(function(err) {
				self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);
			})
		)
	}

	// Function 15 - Write Multiple Coils (with pass-through support)
	/*public*/ this.writeMultipleCoils = function(address, start_reg, quantity_of_outputs, value) {

		fxLog.debug("writeMultipleCoils... Address = " + address + ", Start = " + start_reg + ", Count = " + quantity_of_outputs + ", Data = " + value);

		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeMultipleCoils: Invalid parameter (address)');
				assert.equal(typeof(start_reg), 'number', 'writeMultipleCoils: Invalid parameter (start_reg)');
				assert.equal(typeof(quantity_of_outputs), 'number', 'writeMultipleCoils: Invalid parameter (quantity_of_outputs)');
				assert.equal(typeof(value), 'object', 'writeMultipleCoils: Invalid parameter (values)');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {

				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);			
				var byte_count = (quantity_of_outputs / 8) + ((quantity_of_outputs % 8) ? 1 : 0);

				// Request is 1 addr + 1 fcn + 2 start + 2 reg + 1 count + 2 * reg vals + 2 CRC
				m_Request = new Buffer(offset + 9 + byte_count);
				// Function 15 response is fixed at 8 bytes
				m_Response = new Buffer(8);
				
				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					m_Request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 15; // Function code
				m_Request[offset + 2] = (start_reg >> 8);
				m_Request[offset + 3] = start_reg;
				m_Request[offset + 4] = (quantity_of_outputs >> 8);
				m_Request[offset + 5] = quantity_of_outputs;

				// Add byte count to request
				m_Request[offset + 6] = byte_count;

				// Add writable values to the frame
				for (var i = 0; i < byte_count; i++) {
					m_Request[offset + 7 + i] = values[i]; //TODO: values is not defined
				}
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doTransaction, is_pass_through, m_Request, m_Response, m_Response.length, self.responseTimeout))
					.then(deferred.resolve)
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
					})
				)
			})
			.catch(function(err) {
				self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);
			})
		)
	}

	// Function 5 - Write Single Coil (with pass-through support)
	/*public*/ this.writeSingleCoil = function (address, register, value) {

		fxLog.debug("writeSingleCoil... Address = " + address + ", Register = " + register + ", Data = " + value);
		
		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');
			
				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'writeSingleCoil: Invalid parameter (address)');
				assert.equal(typeof(register), 'number', 'writeSingleCoil: Invalid parameter (register)');
				assert.equal(typeof(value), 'number', 'writeSingleCoil: Invalid parameter (value)');	
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
		
				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);			
		
				// Request is 1 addr + 1 fcn + 2 reg + 2 reg val + 2 CRC
				m_Request = new Buffer(offset + 6 + 2);
				// Function 5 response is fixed at 8 bytes
				m_Response = new Buffer(8);

				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					m_Request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 5; // Function code
				m_Request[offset + 2] = (register >> 8);
				m_Request[offset + 3] = register;
				m_Request[offset + 4] = (value >> 8);
				m_Request[offset + 5] = value;
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doTransaction, is_pass_through, m_Request, m_Response, m_Response.length, self.responseTimeout))
					.then(deferred.resolve)
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
					})
				)
			})
			.catch(function(err) {
				self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);
			})
		)
	}

	// Function 3 - Read Holding Registers (with pass-through support)
	/*public*/ this.readHoldingRegisters = function (address, start_reg, reg_count, values) {

		fxLog.debug("readHoldingRegisters... Address = " + address + ", Start = " + start_reg + ", Count = " + reg_count);
		
		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'readHoldingRegisters: Invalid parameter (address)');
				assert.equal(typeof(start_reg), 'number', 'readHoldingRegisters: Invalid parameter (start_reg)');
				assert.equal(typeof(reg_count), 'number', 'readHoldingRegisters: Invalid parameter (reg_count)');	
				assert.equal(typeof(values), 'object', 'readHoldingRegisters: Invalid parameter (values)');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
		
				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);			

				// Function 3 request is always 8 bytes
				m_Request = new Buffer(offset + 8);
				// Function 3 response buffer
				m_Response = new Buffer(5 + 2 * reg_count);

				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					m_Request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 3; // Function code
				m_Request[offset + 2] = (start_reg >> 8);
				m_Request[offset + 3] = start_reg;
				m_Request[offset + 4] = (reg_count >> 8);
				m_Request[offset + 5] = reg_count;
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doTransaction, is_pass_through, m_Request, m_Response, m_Response.length, self.responseTimeout))
					// Copy response values to the value buffer
					.then(function() {
						// Copy response data to the value table
						for (var i = 0; (i < reg_count) && (m_Response[1] === 3); i++)	{
							values[i] = (m_Response[3 + (2 * i)] << 8);
							values[i] +=  m_Response[4 + (2 * i)];
						}
						deferred.resolve();
					})
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
					})
				)
			})
			.catch(function(err) {
				self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);
			})
		)
	}

	// Function 4 - Read Input Registers (with pass-through support)
	/*public*/ this.readInputRegisters = function (address, start_reg, reg_count, values) {

		fxLog.debug("readInputRegisters... Address = " + address + ", Start = " + start_reg + ", Count = " + reg_count);
		
		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'readInputRegisters: Invalid parameter (address)');
				assert.equal(typeof(start_reg), 'number', 'readInputRegisters: Invalid parameter (start_reg)');
				assert.equal(typeof(reg_count), 'number', 'readInputRegisters: Invalid parameter (reg_count)');	
				assert.equal(typeof(values), 'object', 'readInputRegisters: Invalid parameter (values)');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
		
				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);			

				// Function 4 request is always 8 bytes
				m_Request = new Buffer(offset + 8);
				// Function 4 response buffer
				m_Response = new Buffer(5 + 2 * reg_count);

				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					m_Request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 4; // Function code
				m_Request[offset + 2] = (start_reg >> 8);
				m_Request[offset + 3] = start_reg;
				m_Request[offset + 4] = (reg_count >> 8);
				m_Request[offset + 5] = reg_count;
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doTransaction, is_pass_through, m_Request, m_Response, m_Response.length, self.responseTimeout))
					// Copy response values to the value buffer
					.then(function() {
						// Copy response data to the value table
						for (var i = 0; (i < reg_count) && (m_Response[1] === 4); i++)	{
							values[i] = (m_Response[3 + (2 * i)] << 8);
							values[i] +=  m_Response[4 + (2 * i)];
						}
						deferred.resolve();
					})
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
					})
				)
			})
			.catch(function(err) {
				self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);
			})
		)
	}

	// Function 1 - Read Coils (with pass-through support)
	/*public*/ this.readCoils = function (address, start_reg, quantity_of_coils, values) {

		fxLog.debug("readCoils... Address = " + address + ", Start = " + start_reg + ", Count = " + quantity_of_coils);
		
		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'readHoldingRegisters: Invalid parameter (address)');
				assert.equal(typeof(start_reg), 'number', 'readCoils: Invalid parameter (start_reg)');
				assert.equal(typeof(quantity_of_coils), 'number', 'readCoils: Invalid parameter (quantity_of_coils)');	
				assert.equal(typeof(values), 'object', 'readCoils: Invalid parameter (values)');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
		
				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);
				var byte_count = (quantity_of_outputs / 8) + ((quantity_of_outputs % 8) ? 1 : 0); //TODO: quantity of outputs is not defined

				// Function 1 request is always 8 bytes
				m_Request = new Buffer(offset + 8);
				// Function 1 response buffer
				m_Response = new Buffer(5 + byte_count);

				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					m_Request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 1; // Function code
				m_Request[offset + 2] = (start_reg >> 8);
				m_Request[offset + 3] = start_reg;
				m_Request[offset + 4] = (quantity_of_coils >> 8);
				m_Request[offset + 5] = quantity_of_coils;
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doTransaction, is_pass_through, m_Request, m_Response, m_Response.length, self.responseTimeout))
					// Copy response values to the value buffer
					.then(function() {
						// Copy response data to the value table
						for (var i = 0; (i < reg_count) && (m_Response[1] === 1); i++)	{ //TODO: reg_count is not defined
							values[i] = m_Response[3 + (2 * i)];
						}
						deferred.resolve();
					})
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
					})
				)
			})
			.catch(function(err) {
				self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);
			})
		)
	}

	// Function 43 - Read Device Identification (with pass-through support)
	/*public*/ this.readDeviceIdentification = function(address, device_id, object_id, values) {

		fxLog.debug("readDeviceIdentification... Address = " + address + ", DeviceID = " + device_id + ", ObjectID = " + object_id);

		return (
			Q.resolve()
			.then(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'ReadDeviceIdentification: Invalid parameter (address)');			
				assert.equal(typeof(device_id), 'number', 'ReadDeviceIdentification: Invalid parameter (device_id)');
				assert.equal(typeof(object_id), 'number', 'ReadDeviceIdentification: Invalid parameter (object_id)');	
				assert.equal(typeof(values), 'object', 'ReadDeviceIdentification: Invalid parameter (values)');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
				let request;

				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				var offset = (is_pass_through ? 1 : 0);			

				// Function 43 request is always 7 bytes
				m_Request = new Buffer(offset + 7);

				// Function 43 response buffer (dynamic length)
				m_Response = [];

				// If pass-through mode defined, add pass-through address to the beginning of the request
				if (is_pass_through)
					request[0] = address[0];

				// Build outgoing request frame
				m_Request[offset + 0] = (is_pass_through ? address[1] : address);
				m_Request[offset + 1] = 43; // Function code
				m_Request[offset + 2] = 0x0E; // MEI type (MEI = Modbus Encapsulated Interface)
				m_Request[offset + 3] = device_id; // Read device ID -code
				m_Request[offset + 4] = object_id; // Object ID
				
				return (
					// Build request
					buildRequest(is_pass_through, offset, m_Request)
					// Do transaction with modbus device
					.then(Q.fbind(doEncapsulatedTransaction, is_pass_through, m_Request, m_Response, self.responseTimeout))
					// Handle response
					.then(Q.fbind(handleEncapsulatedResponse, m_Response, values))
					.then(deferred.resolve)
					.fail(function(err) {
						deferred.reject(err)
						throw (err);
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

module.exports = fxModbusRTUMaster;