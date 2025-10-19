// Copyright 2014 Fidelix Oy / Kai Kämäräinen
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const assert = require('assert');
const util = require('util');
const fxModbus = require('../FxModbus/').fxModbusRTUMaster;
const fxModuleInfo = require('./FxModuleInfo.js');
const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
const WAIT_PATTERN_TIMEOUT = 3000;  // PATCHED: Was 2000ms, increased to 3000ms (ref: C# implementation)

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from fxModbus
util.inherits(fxDevice, fxModbus);

function fxDevice() {

	// Request to create base class
	fxDevice.super_.call(this);
	
	// *******************************************************************
	// PRIVATE VARIABLES
	// *******************************************************************
	// In some callback context, this does not refer to fxSerial instance
	// -> catch reference of this to self and use always self below
	var self = this;
		
	// *******************************************************************
	// PUBLIC VARIABLES
	// *******************************************************************	
	// *** Module identification properties ***
	this.targetModule = new fxModuleInfo();
	this.passThroughModule = new fxModuleInfo();
	
	// *******************************************************************
	// PRIVATE FUNCTIONS
	// *******************************************************************
	
	// Wait for a specific pattern from serial port
	/*private*/ function tryReadPattern(rxBuffer, patternToWait, patternLength, bytesBefore, bytesAfter, msTimeout) {
	
		var deferred = Q.defer();
				
		// Receive handler
		var l_iPos = 0;
		var l_PatternFound = false;		

		fxLog.trace("tryReadPattern... Pattern = " + patternToWait.toString('hex') + ", Timeout = " + msTimeout + " ms");				
		
		var onReceive = function(data) {
				
			try {
				for (var ch = 0; ch < data.length; ch++) {		
					// Handle one byte at time
					rxBuffer[l_iPos] = data[ch];
				
					// If required byte count received...
					if (l_iPos >= (patternLength + bytesBefore + bytesAfter - 1)) {
						// Compare pattern
						var i = 0;
						while (rxBuffer[bytesBefore + i] == patternToWait[i]) {
							i++;

							// If whole the pattern checked, pattern match
							if (i >= patternLength)	{
								l_PatternFound = true;						
								break;
							}
						}

						// If pattern found, break
						if (l_PatternFound) {
							self.removeListener('receive', onReceive);
							clearTimeout(onTimeout);
							deferred.resolve();
							return;
						}

						// ...remove one byte from the beginning (move bytes to left)
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
		
		// Timeout handler
		var onTimeout = setTimeout(function () {
			self.removeListener('receive', onReceive);
			deferred.reject("Timeout");
		}, msTimeout);

		return deferred.promise;
	}

	// *** Methods to set device to the boot mode ***
	// Ask boot version from device
	/*private*/ function askBootVersion(address, version) {
			
		var l_Buffer = new Buffer(20);
		var l_Offset = 1;

		fxLog.trace("askBootVersion... Address = " + address);		
		
		return (
			Q.fcall(function() {			
				// Set default version
				version = 0.0;
				
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert(((typeof(address) == 'number') || (typeof(address) == 'object')), 'AskBootVersion: Invalid parameter (address)');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
			
				// If pass-through address is 0, command is not pass-through (discard pass-through address)
				if ((typeof(address) == 'object') && (address[0] == 0))
					address = address[1];
					
				var is_pass_through = (typeof(address) == 'object');
				
				// SEND "Versio" -command to the device
				l_Buffer[1] = (is_pass_through ? address[1] : address); 
				l_Buffer.write('Versio\0', 2);

				// If pass-through -address defined
				if (is_pass_through) {
					l_Buffer[0] = address[0];
					l_Buffer[1]++; // Increment module address 
					l_Offset = 0;
				}
				
				// Send raw data to the device
				self.write(l_Buffer, l_Offset, (9 - l_Offset))
				.then(function() {
					// WAIT 'Vx.xx' -response from device where x.xx is numeric value
					var l_PatternToWait = new Buffer(2);
					l_PatternToWait[0] = l_Buffer[1]; // Address
					l_PatternToWait.write('V', 1);
					
					// Wait response
					return (tryReadPattern(l_Buffer, l_PatternToWait, 2, 0, 4, WAIT_PATTERN_TIMEOUT))
				})
				.then(deferred.resolve)
				.catch(deferred.reject)
					
				return deferred.promise;
			})
			.then(function() {
				// Convert version information from buffer to string
				version = version || "";
				version += String.fromCharCode(l_Buffer[2]);
				version += String.fromCharCode(l_Buffer[3]);
				version += String.fromCharCode(l_Buffer[4]);
				version += String.fromCharCode(l_Buffer[5]);			
				return Q.resolve(version);
			})			
			.catch(function(err) {
			// Error occured
				err = "AskBootVersion error : " + err;
				//self.emit('error', err, fxLog.error(err));		
				return (Q.reject(err));			
			})
		)
	}

	// Send pass-through command to the device
	/*private*/ function sendPassThroughCommand() {
		
		var l_Buffer = new Buffer(20);
		var l_Offset = 1;

		fxLog.trace("sendPassThroughCommand...");		
		
		return (
			Q.fcall(function() {
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');				
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {
				// SEND "Passth" -command to the device
				l_Buffer[1] = self.passThroughModule.address;
				l_Buffer.write('Passth\0', 2);
				
				// Send raw data to the device
				self.write(l_Buffer, l_Offset, (9 - l_Offset))			
				// Wait response
				.then(function() {
					// WAIT "OK" -response from device
					var l_PatternToWait = new Buffer(3);
					l_PatternToWait[0] = l_Buffer[1]; // Address
					l_PatternToWait.write('OK', 1);		

					return (tryReadPattern(l_Buffer, l_PatternToWait, 3, 0, 0, WAIT_PATTERN_TIMEOUT))					
				})
				.then(deferred.resolve)
				.catch(deferred.reject)
				
				return deferred.promise;
			})
			.catch(function(err) {
			// Error occured
				err = "sendPassThroughCommand error : " + err;
				//self.emit('error', err, fxLog.error(err));		
				return Q.reject(err);			
			})
		)
	}

	// Send boot mode command to the device
	/*private*/ function sendBootModeCommand(sendToPassThroughDevice) {
			
		var l_PassThroughAddress = (sendToPassThroughDevice ? 0 : self.passThroughModule.address);
		var l_ModuleAddress = (sendToPassThroughDevice ? self.passThroughModule.address : self.targetModule.address);
		
		fxLog.trace("sendBootModeCommand... PassThrough = " + sendToPassThroughDevice);
		
		return (
			Q.fcall(function() {
				if (sendToPassThroughDevice)
					return (self.passThroughModule.getModuleInfo());
					
				return (self.targetModule.getModuleInfo());
			})
			.then(function(moduleinfo) {		
				return (
					Q.resolve()
					// Write something other than 5555 hex to the bootloader start register (device seem to detect value change only)
					.then(Q.fbind(self.writeSingleRegister, [l_PassThroughAddress, l_ModuleAddress], moduleinfo.bootloaderStartRegister, 0xFFFF))
					// Little bit delay
					.delay(500)
					// Activate boot mode by sending 5555 hex to the bootloader start register
					.then(Q.fbind(self.writeSingleRegister, [l_PassThroughAddress, l_ModuleAddress], moduleinfo.bootloaderStartRegister, 0x5555))
				)
			})
			// Error occured
			.catch(function(err) {
				err = "sendBootModeCommand error : " + err;
				//self.emit('error', err, fxLog.error(err));
				return Q.reject(err);
			})			
		)
		
	}
	
	// *******************************************************************
	// EVENT HANDLERS
	// *******************************************************************
	
	// *******************************************************************
	// INTERFACE FUNCTIONS
	// *******************************************************************		
	
	// Setup device to the boot mode 
	//		(setPassThroughModule = set pass-through module to the boot mode) 
	//		(setTargetModule = set target module to the boot mode)
	/*public*/ this.setupBootMode = function(setPassThroughModule, setTargetModule) {
			
		fxLog.debug("setupBootMode... PassThrough = " + setPassThroughModule + ", Target = " + setTargetModule);

		// Setup pass-through device
		function setupPassThroughDevice() {		
					
			return (
				// Check if pass-through device is already in boot mode
				askBootVersion(self.passThroughModule.address)
				.fail(function() {
					return (
						// Little bit delay
						Q.delay(50)
						// Set pass-through device to the boot mode
						.then(Q.fbind(sendBootModeCommand, true))
						// Little bit delay for bootup mode setup
						.delay(500)
						// Ask boot version from pass-through device
						.then(Q.fbind(askBootVersion, self.passThroughModule.address))
					)
				})
				.then(function(version) {

					// Not in boot mode...
					if (version == "0.0") {
						return Q.reject("Unable to set pass-through device to boot mode");
					}
					
					return (Q.resolve(version));
				})
				// Little bit delay
				.delay(50)
				// Continue by setting device to the pass-through mode
				.then(sendPassThroughCommand)
				// Little bit delay
				.delay(50)
				.catch(Q.reject)
			)
		}

		// Setup target device
		function setupTargetDevice() {		
										
			return (
				// Check if target device is already in boot mode
				askBootVersion([self.passThroughModule.address, self.targetModule.address])
				.fail(function() {
					return (
						// Little bit delay
						Q.delay(50)
						// Set target device to the boot mode
						.then(Q.fbind(sendBootModeCommand, false))
						// Little bit delay for bootup mode setup
						.delay(500)
						// Ask boot version from target device
						.then(Q.fbind(askBootVersion, [self.passThroughModule.address, self.targetModule.address]))
					)
				})				
				.then(function(version) {
					// Not in boot mode...
					if (version == "0.0") {
						return Q.reject("Unable to set target device to boot mode");
					}
					
					return (Q.resolve(version));
				})
			)
		}			
				
		return (
			Q.resolve()	
			// Setup pass-through device
			.then(function() {
				// If pass-through device defined to be set
				if (setPassThroughModule)
					return setupPassThroughDevice();
			})
			// Setup target device
			.then(function() {
				// If target device defined to be set
				if (setTargetModule)			
					return setupTargetDevice();
			})
			.then(Q.resolve)
			// Error occured
			.catch(function(err) {
				err = "setupBootMode error : " + err;
				self.emit('error', err, fxLog.error(err));
				return Q.reject(err);
			})			
		)
	}
	
	// *** Methods for software programming ***
	
	// Start software update sequency (set device to the programming mode)
	/*public*/ this.startSwProgramming = function() {
	
		var l_Values = new Buffer(4);
		
		fxLog.debug("startSwProgramming...");	
	
		return (
			// Read registers FF3E-FF3F
			self.readHoldingRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3E, 2, l_Values)
			.delay(50)
			// If value of register FF3E = AAAA (goto programming state) or value of register FF3F = 0 (acknowledgement from device)	
			.then(function() {		
				if ((l_Values[0] == 0xAAAA) || (l_Values[1] == 0)) {
					l_Values[0] = 0xFFFF; // Set "invalid command value" (it seems that device doesn't detect if value not changed)
					l_Values[1] = 0xFFFF; // Set "invalid packet counter" to be able to detect that device moved to the programming mode succesfully
					return (self.writeMultipleRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3E, 2, l_Values).delay(500).thenResolve());
				}
			})
			// Set device to the programming mode
			.then(Q.fbind(self.writeSingleRegister, [self.passThroughModule.address, self.targetModule.address], 0xFF3E, 0xAAAA))
			// Little bit delay for setup
			.delay(500)
			// Read response
			.then(function() {			
				var deferred = Q.defer();
				var retrycount = 5;

				// Loop until resolved	
				function doLoop() {

					self.readHoldingRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3F, 1, l_Values)
					.then(function () {
						if (l_Values[0] != 0) 
							throw ("Device is not in programming mode yet, retry");
							
						deferred.resolve();
					})
					.catch(function(err) {		
						(retrycount-- <= 0) ? deferred.reject(err) : setTimeout(doLoop, 200); // Retry by 200 ms interval if retries left
					})
				}
							
				doLoop(); // Trig loop
					
				return deferred.promise;									
			})
			// Error occured
			.catch(function(err) {
				err = "startSwProgramming error : " + err;
				self.emit('error', err, fxLog.error(err));
				return Q.reject(err);
			})	
		)
	}

	// Read software packet counter from the device
	/*public*/ this.getSwPacketCounter = function() {
	
		var l_Values = [0];

		fxLog.debug("getSwPacketCounter...");	
		
		return (
			// Read packet counter from register
			self.readHoldingRegisters([self.passThroughModule.address, self.targetModule.address], 0xFF3F, 1, l_Values)
			// Get packet counter
			.then(function() {
				return Q.resolve(l_Values[0]);
			})
			// Error occured
			.catch(function(err) {
				err = "getSwPacketCounter error : " + err;
				self.emit('error', err, fxLog.error(err));
				return Q.reject(err);
			})
		)
	}
	
    // Wait for a specific software packet counter report from the device
    /*public*/ this.waitSwPacketCounter = function(packetCounterToWait, msTimeout) {
		
		var deferred = Q.defer();

		fxLog.debug("waitSwPacketCounter... " + packetCounterToWait);	
		
		// Query packet counter from device...
		function doLoop() {
					
			self.getSwPacketCounter()
			.then(function(packetCounter) {
				if (packetCounter == packetCounterToWait)
					deferred.resolve(packetCounter);
				else
					setTimeout(doLoop, 5); // Retry by 5 ms interval
			})
			.catch(deferred.reject);			
		}
														
		doLoop(); // Trig loop						
					
		deferred.promise.timeout(msTimeout)				// Use defined timeout
		.catch(function(err) {							// FAILED
			err = "waitSwPacketCounter error : " + err;
			self.emit('error', err, fxLog.error(err));
			deferred.reject(err);
		})
			
		return deferred.promise;
	}

	// Send single software packet to the device
	/*public*/ this.sendSwPacket = function(packet, packetCounter) {
	
		//var deferred = Q.defer();
	
		fxLog.debug("sendSwPacket... " + packetCounter);	
	
		// Add packet counter to the end of packet
		packet[64] = packetCounter;
		
		return (
			// Send packet to the device
			self.writeMultipleRegisters([self.passThroughModule.address, self.targetModule.address], 0xFEFE, 65, packet)
			// Error occured
			.catch(function(err) {
				err = "sendSwPacket error : " + err;
				self.emit('error', err, fxLog.error(err));
				return Q.reject(err);
			})			
		)
	}

	// End software update sequency (return device back to the normal mode)
	/*public*/ this.endSwProgramming = function() {
	
		var l_Values = [0,0];

		fxLog.debug("endSwProgramming...");	
		
		return (
			// Set device back to the normal mode
			self.writeSingleRegister([self.passThroughModule.address, self.targetModule.address], 0xFF3E, 0xBBBB)
			// Little bit delay
			.delay(500)
			// Read response
			.then(Q.fbind(self.readHoldingRegisters, [self.passThroughModule.address, self.targetModule.address], 0xFF3F, 1, l_Values))
			// Handle response
			.then(function() {
				// If programming succeeded, device acknowledges by 0x2222
				if (l_Values[0] == 0x2222)
					return Q.resolve();
				// If programming fails, device acknowledges by 0x0101 
				else if (l_Values[0] == 0x0101)
					throw("Device reported about unsuccessfull programming...");				
				else
					throw("Unable to set device back to the normal mode...");
			})
			// Error occured
			.catch(function(err) {
				err = "endSwProgramming error : " + err;
				self.emit('error', err, fxLog.error(err));
				return Q.reject(err);
			})			
		)
	}

	// *** Methods for firmware programming ***

	// Setup device for firmware programming mode (first page address returned as response)
	/*public*/ this.setupFwProgramMode = function() {
	
		var l_Buffer = new Buffer(20);
		var l_Offset = 1;

		fxLog.trace("setupFwProgramMode...");		

		return (
			Q.fcall(function() {						
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');
			})
			// Get transaction promise		
			.then(Q.fbind(self.getTransactionPromise))
			.then(function(deferred) {			
				// SEND "Progb" -command to the programmable device
				l_Buffer[1] = self.targetModule.address;
				l_Buffer.write('Progrb\0\0', 2);

				// If pass-through -address defined
				if (self.passThroughModule.address != 0) {
					l_Buffer[0] = self.passThroughModule.address;
					l_Buffer[1]++; // Increment module address 
					l_Offset = 0;
				}

				// Send raw data to the device
				self.write(l_Buffer, l_Offset, 10 - l_Offset)
				// Get first page address as response
				.then(self.getFwPageAddress)
				.then(function(pageAddress) {
					deferred.resolve(pageAddress);
				})
				.catch(deferred.reject)					
				
				return deferred.promise;
			})
		)
	}

	// Get firmware page address to program from device
	/*public*/ this.getFwPageAddress = function() {
	
		var l_Buffer = new Buffer(20);

		fxLog.trace("getFwPageAddress...");		

		return (
			Q.fcall(function() {						
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');
			})
			// Wait response
			.then(function() {
				// WAIT 'p' -response from device
				var l_PatternToWait = new Buffer(2);
				l_PatternToWait[0] = ((self.passThroughModule.address != 0) ? (self.targetModule.address + 1) : self.targetModule.address);
				l_PatternToWait.write('p', 1);

				return (tryReadPattern(l_Buffer, l_PatternToWait, 2, 0, 4, WAIT_PATTERN_TIMEOUT))
			})
			// Handle response
			.then(function() {
			
				// If pass-through mode, decrement one from module address (should locate in buffer position 1)
				if (self.passThroughModule.address != 0)
					l_Buffer[0]--;

				return (
					// Calculate CRC from message
					self.getCRC(l_Buffer, 0, 4)
					// Check if CRC is valid
					.then(function(CRC) {
					
						// If calculated CRC doesn't match with the CRC of the message, operation failed
						if ((CRC[0] != l_Buffer[4]) || (CRC[1] != l_Buffer[5]))
							return (Q.reject("CRC-error"));
							
						return (Q.resolve());
					})
					// Get value 
					.then(function() {
						// Get page address
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
	/*public*/ this.programFwPage = function(pageData, pageAddress) {	

		fxLog.trace("programFwPage... pageAddress = " + pageAddress);		

		return (
			Q.fcall(function() {						
				// Check if port is open...
				assert(self.isOpen, 'Serial port is not open');

				// Check parameters
				assert((typeof(pageData) == 'object'), 'ProgramFwPage: Invalid parameter (pageData)');				
				assert((typeof(pageAddress) == 'number'), 'ProgramFwPage: Invalid parameter (pageAddress)');
			})
			.then(function() {
	
				var l_PageSize = pageData.length;
				var l_Buffer = new Buffer(l_PageSize + 4);
				
				// Define address information
				l_Buffer[0] = self.passThroughModule.address;
				l_Buffer[1] = self.targetModule.address;
				
				// Copy page data to the send buffer
				pageData.copy(l_Buffer, 2);				
				
				return (
					// Get CRC
					self.getCRC(l_Buffer, 1, l_PageSize + 2)
					.then(function(CRC) {					
						l_Buffer[l_PageSize + 2] = CRC[1];
						l_Buffer[l_PageSize + 3] = CRC[0];					
					})
					// Program page
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
	
} /* END OF fxDevice */

module.exports = fxDevice;