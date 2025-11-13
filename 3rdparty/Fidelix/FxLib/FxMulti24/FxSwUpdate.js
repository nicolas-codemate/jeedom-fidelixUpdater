// Copyright 2014 Fidelix Oy / Kai Kämäräinen
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const assert = require('assert');
const util = require('util');
const fxDevice = require('./FxDevice.js');
const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
//const WAIT_PATTERN_TIMEOUT = 2000;
const NUM_OF_RETRIES = 10;  // PATCHED: Was 3, increased to 10 (ref: C# implementation)
const PORT_STABILIZATION_DELAY = 500;  // PATCHED: Delay after serial port opening to ensure port is ready (ms)

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from fxDevice
util.inherits(fxSwUpdate, fxDevice);

function fxSwUpdate() {

	// If instance not created, create now
	if (!(this instanceof fxSwUpdate)) {
		return new (Function.prototype.bind.apply(fxSwUpdate, [null, ...arguments]));
	}

	// Request to create base class
	fxSwUpdate.super_.call(this);
	
	// *******************************************************************
	// PRIVATE VARIABLES
	// *******************************************************************
	// In some callback context, this does not refer to fxSerial instance
	// -> catch reference of this to self and use always self below
	var self = this;
	var m_Deferred = Q.defer();
	var m_Options = {};
	var m_FileBuffer = null;
	var m_TotalRegCount = 0;
	var m_TotalPacketCount = 0;
	//let m_SendPacketCount = 0;
		
	// *******************************************************************
	// PUBLIC VARIABLES
	// *******************************************************************	
	this.progress = 0;
	this.phase = "";
	this.status = "";
	
	// *******************************************************************
	// PRIVATE FUNCTIONS
	// *******************************************************************

	// Repeat until
    /*private*/ function repeatUntilResolvedOrNoRetriesLeft(call, interval, retries) {
		
		var deferred = Q.defer();
		var retrycount = retries || 1;
		
		// Loop until resolved	
		function doLoop() {
		
			call()
			.then(deferred.resolve)
			.fail(function(err) {		
				if (retrycount-- <= 0)
					deferred.reject("Retry counter expired... " + err);
				else 
					setTimeout(doLoop, interval); // Retry
			})
		}
					
		doLoop(); // Trig loop
		
		//Q.when(deferred); // Wait to resolve
			
		return deferred.promise;
	}	

  // Repeat until
	/*private*/ 
	/*
	function repeatUntilResolvedOrTimeout(call, interval, msTimeout) {
		
		var deferred = Q.defer();

		// Loop until resolved	
		function doLoop() {
		
			call()
			.then(deferred.resolve)
			.fail(function() {		
				setTimeout(doLoop, interval); // Retry
			})
		}
					
		doLoop(); // Trig loop					
					
		Q.when(deferred)						// Wait to resolve
		.timeout(msTimeout)						// Use defined timeout
		.catch(function(err) {					// FAILED
			deferred.reject(err);
		})
			
		return deferred.promise;
	}	
	*/
	
	// Notify
    /*private*/ function notifyProgress(notify) {
		
		var deferred = Q.defer();

		notify = notify || {};
		notify.phase = notify.phase || self.phase;
		notify.status = notify.status || self.status;
		notify.progress = notify.progress || self.progress;
		notify.progress = Math.round(notify.progress);
		
		// Update member variables
		self.phase = notify.phase;
		self.status = notify.status;
		self.progress = notify.progress;
		
		fxLog.debug(self.phase + " : " + self.status + " " + self.progress + "%");
		self.emit('progress', notify);
		
		process.nextTick(deferred.resolve);
			
		return deferred.promise;
	}	
		
	// Transfer data to the device 
	/*private*/ function transferData() {

		var deferred = Q.defer();

		var l_RetryCounter = 0;
		var l_FileBufferPos = 0;
		var l_Values = [];

		fxLog.trace("transferData");
			
		function waitDeviceReady(packet) {	
					 
			return (
				// Wait for packet counter
				self.waitSwPacketCounter(packet, 500)
				.then(function() {
					
					// If last packet sent...
					if (packet >= m_TotalPacketCount) {
						deferred.resolve()
						return (Q.resolve());
					}
					
					// Get next packet from file buffer to registers
					var l_RegCount = 0;

					while (l_RegCount < 64) {
					
						var l_HighByte = (l_FileBufferPos < m_FileBuffer.length) ? m_FileBuffer[l_FileBufferPos++] : 0;
						var l_LowByte = (l_FileBufferPos < m_FileBuffer.length) ? m_FileBuffer[l_FileBufferPos++] : 0;

						l_Values[l_RegCount] = (l_HighByte << 8) + l_LowByte;
						l_RegCount++;
					}														
					
					l_RetryCounter = 0; // Clear retry counter
					
					packet++;
					process.nextTick(sendPacket.bind(null, l_Values, packet));

					return Q.resolve();
				})
				.catch(function(err) {
				// Error occured
					if (l_RetryCounter++ >= NUM_OF_RETRIES)
						deferred.reject(err);
					else
						return (waitDeviceReady(packet)); // RETRY
				})	
			)				
		}
			
		function sendPacket(data, packet) {
					
			return (
				// Send packet to the device
				self.sendSwPacket(data, packet)
				// Notify progress
				.then(Q.fbind(notifyProgress, {progress : 10 + (80 * packet / m_TotalPacketCount)}))
				// Start next round
				.then(function() {
					return (waitDeviceReady(packet));
				})
				.catch (function(err) {
				// Error occured
					if (l_RetryCounter++ >= NUM_OF_RETRIES)
						deferred.reject(err);
					else
						return process.nextTick(sendPacket.bind(null, data, packet)); // RETRY
				})
			)				
		}
		// Trig programming
		var i = 0;
		waitDeviceReady(i);		
					
		// Do repeat programming until resolved
		return deferred.promise;
		
	}
	
	// Program device
	/*private*/ function doProgram() {
							
		fxLog.trace("doProgram...");
		
		return (
			// CHECK BUFFER DATA
			notifyProgress({phase : "Preparing", status : "Checking buffer data...", progress : 0})
			.then(function() {
				m_TotalRegCount = Math.floor((m_FileBuffer.length + 1) / 2);
				m_TotalPacketCount = Math.floor((m_TotalRegCount + 63) / 64);
				//m_SendPacketCount = 0;
			})
			// OPEN CONNECTION
			.then(Q.fbind(notifyProgress, {status : "Opening connection...", progress : 2}))
			.then(function() {
				console.log('[FxSwUpdate] Opening connection to port:', m_Options.port);
				return Q.fbind(self.openConnection, m_Options.port, m_Options)();
			})
			.then(function() {
				console.log('[FxSwUpdate] Connection opened successfully');
			})
			.delay(PORT_STABILIZATION_DELAY)
			.then(function() {
				console.log('[FxSwUpdate] Port stabilized after ' + PORT_STABILIZATION_DELAY + 'ms delay');
			})
			// SET DEVICE TO THE PASS-THROUGH MODE
			.then(function() {

				// If pass-through address is 0, do nothing (no pass-through mode)
				if (self.passThroughModule.address !== 0) {
					console.log('[FxSwUpdate] Activating pass-through mode for address:', self.passThroughModule.address);

					return (
						// Activate pass-through mode by boot mode command...
						notifyProgress({status : "Activating pass-through mode...", progress : 5})
						.then(Q.fbind(repeatUntilResolvedOrNoRetriesLeft, Q.fbind(self.setupBootMode, true, false), 100, NUM_OF_RETRIES))
						.then(function() {
							console.log('[FxSwUpdate] Pass-through mode activated successfully');
						})
						.catch(function (err) {
							// Error occured
							console.error('[FxSwUpdate] Failed to activate pass-through mode:', err);
							return Q.reject("Unable to activate pass-through mode : " + err);
						})
					)
				} else {
					console.log('[FxSwUpdate] Skipping pass-through mode (address is 0)');
				}
			})
			.delay(500)  // PATCHED: Was 100ms, increased to 500ms for device stability
			// SET DEVICE TO THE PROGRAMMING MODE
			.then(Q.fbind(notifyProgress, {status : "Setting up device to the programming mode...", progress : 7}))
			.then(function() {
				console.log('[FxSwUpdate] Setting device to programming mode...');

				return (
					// Set device to the programming mode
					repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.startSwProgramming), 100, NUM_OF_RETRIES)
					.then(function() {
						console.log('[FxSwUpdate] Device set to programming mode successfully');
					})
					.catch(function(err) {
						// Error occured
						console.error('[FxSwUpdate] Failed to set device to programming mode:', err);
						return Q.reject("Unable to set device to the programming mode : " + err);
					})
				)
			})
			.delay(500)  // PATCHED: Was 100ms, increased to 500ms for device stability
			// PROGRAM DEVICE
			.then(Q.fbind(notifyProgress, {phase : "Programming", status : "Programming device... ", progress : 10}))
			.then(function() {
				console.log('[FxSwUpdate] Starting data transfer... Total packets:', m_TotalPacketCount);
				return transferData();
			})
			.then(function() {
				console.log('[FxSwUpdate] Data transfer completed successfully');
			})
			.delay(500)  // PATCHED: Was 100ms, increased to 500ms for device stability
			// RESTORE DEVICE BACK TO THE NORMAL MODE
			.then(Q.fbind(notifyProgress, {phase : "Finishing", status : "Restoring device back to the normal mode...", progress : 95}))		
			.then(function() {

				return (
					// Set device back to normal mode mode
					repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.endSwProgramming), 100, NUM_OF_RETRIES)
					.catch (function(err) {
						// Error occured
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
	// EVENT HANDLERS
	// *******************************************************************
	
	// *******************************************************************
	// INTERFACE FUNCTIONS
	// *******************************************************************		

	/*public*/ this.supportedTargetModules = ['MULTI-24'];

	// Program device (specify before start targetModuleAddress, targetModuleType, passThroughModuleAddress, passThroughModuleType)
	/*public*/ this.program = function(options) {
			
		try {
			fxLog.trace("program... Buffer => Port " + options.port);
		
			// Check if programming is busy...
			assert.notEqual(m_Deferred.state, 'pending', 'Programming is already active');
						
			// Check parameters			
			assert.equal(typeof(options.port), 'string', 'Program: Invalid parameter (options.port)');
			assert.notEqual(typeof(options.data), null, 'Program: Invalid parameter (options.data)');
		
			// Update options
			m_Options = options || {};
			m_Options.responseTimeout = 5000;			
			m_FileBuffer = new Buffer( new Uint8Array(options.data) );
			
			m_Deferred = Q.defer();
			
			// Do background operation
			doProgram().then(m_Deferred.resolve, m_Deferred.reject)
			.fin(function(){m_FileBuffer = null;});
		}		
		catch (err) {
			// Error occured
			let error = "Program error : " + err;
			self.emit('error', error, fxLog.error);		
			m_Deferred.reject(err);			
		}
		
		return m_Deferred.promise;
	}	
		
	// Cancel programming
	/*public*/ this.cancel = function() {

		fxLog.trace("cancel...");
	
		if (m_Deferred.state === 'pending') {
			// Cancel programming
			m_Deferred.reject("Programming cancelled...");
		}
	
		return m_Deferred.promise;
	}		

	// Cancel programming
	/*public*/ this.isBusy = function() {

		fxLog.trace("isBusy...");
	
		return (m_Deferred.state === 'pending');
	}		
}	

// module.exports = new fxSwUpdate();
module.exports = fxSwUpdate;