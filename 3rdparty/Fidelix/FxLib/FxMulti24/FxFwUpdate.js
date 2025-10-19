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
const fs = require('fs-extra');
const path = require('path');


const logFilePath = path.resolve(__dirname, '../logsJeedom.txt');

// Créer un flux d'écriture pour écrire dans le fichier de log
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Rediriger les sorties de console.log vers le fichier de log externe
console.log = function(message) {
    logStream.write(message + '\n');
};

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
//const WAIT_PATTERN_TIMEOUT = 2000;
const NUM_OF_RETRIES = 10;  // PATCHED: Was 3, increased to 10 (ref: C# implementation)

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************
// Inherit from fxDevice
util.inherits(fxFwUpdate, fxDevice);

function fxFwUpdate() {

	// If instance not created, create now
	if (!(this instanceof fxFwUpdate)) {
		return new (Function.prototype.bind.apply(fxFwUpdate, [null, ...arguments]));
	}
		
	// Request to create base class
	fxFwUpdate.super_.call(this);
	
	// *******************************************************************
	// PRIVATE VARIABLES
	// *******************************************************************
	// In some callback context, this does not refer to fxSerial instance
	// -> catch reference of this to self and use always self below
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

	// Repeat until
    /*private*/ function repeatUntilResolvedOrNoRetriesLeft(call, interval, retries) {
		
		fxLog.trace("repeatUntilResolvedOrNoRetriesLeft... interval = " + interval + ", retries = " + retries);				

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
		
			fxLog.trace("repeatUntilResolvedOrTimeout... interval = " + interval + ", timeout = " + msTimeout);				

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

	// Read hex word from string
	/*private*/ function hexWordFromString(str, pos) {
	
//		fxLog.trace("hexWordFromString... string = " + str);			
		var hexstr = str.substring(pos, pos + 4);

		return (parseInt("0x" + hexstr, 16));
	}

	// Read hex byte from string
	/*private*/ function hexByteFromString(str, pos)	{
	
//		fxLog.trace("hexByteFromString... string = " + str);	
		var hexstr = str.substring(pos, pos + 2);
							
		return (parseInt("0x" + hexstr, 16));
	}

	// Get checksum from the hex data
	/*private*/ function hexGetCRC(pageCount, pageSize)
	{
		fxLog.trace("hexGetCRC...");				

		let l_CheckSum = 0;
		let i;

		for (i = 0; i < (pageCount - 1); i++)	{
			for (let j = 0; j < pageSize; j++)
				l_CheckSum += m_HexData[i][j];
		}
		
		// Last page's two last bytes not included
		for (let j = 0; j < (pageSize - 2); j++)
			l_CheckSum += m_HexData[i][j];

		l_CheckSum &= 0xffff; // 16 bit sum
		
		var l_CRC = [0,0];
		l_CRC[0] = (l_CheckSum >> 0);
		l_CRC[1] = (l_CheckSum >> 8);
		
		return Q.resolve(l_CRC);
	}


	// Read intel hex file to buffer
	/*private*/ 
	function getHexData(buffer) {

		fxLog.trace("getHexData...");		
		
		var l_Offset = 0;
		var l_BufferPos = 0;
		var l_ReadString = "";
		var l_DataBytes, l_BaseAddress, l_RecordType = 0;
		var l_Checksum, l_CalculatedChecksum = 0;
										
		var deferred = Q.defer();
		
		// Get target device information		
		self.targetModule.getModuleInfo()
		.then(function(moduleinfo) {
			
			var l_PageSize = moduleinfo.pageSizeB;
			var l_PageCount = moduleinfo.programPageCount;
			var l_AddressOffset = moduleinfo.bootloaderSizeB;
			var cnt;
			var l_Line = 0;
		
			// Create empty page (fill by 0xFF)
			var l_EmptyPage = [];
			for (cnt = 0; cnt < l_PageSize; cnt++)
				l_EmptyPage[cnt] = 0xFF;
				
			// Clear hex buffer
			m_HexData = []; 
			for (var page = 0; page < l_PageCount; page++)
				m_HexData[page] = new Buffer(l_EmptyPage);
				
			do 	{
				// Read hex line from buffer
				l_ReadString = "";
				
				while (true) {
				
					var ch = buffer.toString('ascii', l_BufferPos, l_BufferPos + 1);
					l_BufferPos++;
										
					// If : found, break
					if (ch == ':') 
						break;

					l_ReadString += ch;
				
					if (l_BufferPos >= buffer.length)
						break; // End of buffer reached
				}	

				l_Line++;
				
				if (l_Line > 1)	{      
			
					// Get header information
					l_DataBytes = hexByteFromString(l_ReadString, 0);
					l_BaseAddress = hexWordFromString(l_ReadString, 2);
					l_RecordType = hexByteFromString(l_ReadString, 6);
					l_Checksum = hexByteFromString(l_ReadString, 8 + (2 * l_DataBytes));

					// Check checksum
					l_CalculatedChecksum = 0;
					for (cnt = 0; cnt < l_DataBytes + 4; cnt++)
						l_CalculatedChecksum += hexByteFromString(l_ReadString, 2 * cnt);

					l_CalculatedChecksum = (255 - (l_CalculatedChecksum%256) + 1) % 256;

					if (l_CalculatedChecksum != l_Checksum)
						throw ("Checksum error of hex buffer");

					// Handle record
					if (l_RecordType == 0)	{

						var l_Address, l_PagePos, l_Page, l_Byte = 0;
					
						// Read bytes
						for (cnt = 0; cnt < l_DataBytes; cnt++) {
						
							// Get address information
							l_Address = l_Offset + l_BaseAddress + cnt;
							l_PagePos = Math.floor(l_Address % l_PageSize);
							l_Page = Math.floor(l_Address / l_PageSize);

							// If invalid page read from file, throw error
							if (l_Page >= l_PageCount)
								throw ("Page " + l_Page + " of hex file is out of buffer");
							
							// Get page data
							l_Byte = hexByteFromString(l_ReadString, 8 + (cnt * 2));
							m_HexData[l_Page][l_PagePos] = l_Byte;
						}						
					}
					else if (l_RecordType == 1)
						break;
					else if (l_RecordType == 2)
						l_Offset = 16 * hexWordFromString(l_ReadString, 8);
					else if (l_RecordType == 4)	{
						l_Offset = hexByteFromString(l_ReadString, 10);
						l_Offset <<= 16;
						l_Offset -= l_AddressOffset; // Remove bootloader size from offset
					}
					else if (l_RecordType == 5)
						; //skip
					else 
						throw ("Invalid record type");
				}

			} while (l_BufferPos < buffer.length);
			
			return (
				// Get checksum of the hex data
				hexGetCRC(l_PageCount, l_PageSize)
				.then(function(CRC) {
					// Add checksum to the end of hex data
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
		

	// function notifyProgress(notify) {
	// 	var deferred = Q.defer();
	
	// 	notify = notify || {};
	// 	notify.phase = notify.phase || self.phase;
	// 	notify.status = notify.status || self.status;
	// 	notify.progress = notify.progress || self.progress;
	// 	notify.progress = Math.round(notify.progress);
	
	// 	// Update member variables
	// 	self.phase = notify.phase;
	// 	self.status = notify.status;
	// 	self.progress = notify.progress;
	
	// 	const logMessage = `${self.phase} : ${self.status} ${self.progress}%`;
	
	// 	// Écrire dans un fichier texte
	// 	fs.appendFile('../logsJeedom.txt', logMessage + '\n', (err) => {
	// 		if (err) {
	// 			console.error('Error writing to file:', err);
	// 		} else {
	// 			console.log('Logged:', logMessage); // Afficher le message dans la console
	// 		}
	// 		deferred.resolve();
	// 	});
	
	// 	const progressMessage = `Progress: ${notify.progress}%`;
	// 	fs.appendFile('../logsJeedom.txt', progressMessage + '\n', (err) => {
	// 		if (err) {
	// 			console.error('Error writing progress to file:', err);
	// 		} else {
	// 			console.log('Progress:', progressMessage); // Afficher la progression dans la console
	// 		}
	// 	});
	
	// 	self.emit('progress', notify);
	
	// 	return deferred.promise;
	// }
	// Transfer data to the device 
	/*private*/ function transferData() {

		var deferred = Q.defer();
		
		var l_RetryCounter = 0;
		var l_PageCount = 0;

		fxLog.trace("transferData");
			
		function waitDeviceReady(page) {	
					
			return (
				self.getFwPageAddress()
				.then(function(pageReported) {
					
					// Device reports by address 0xFFFF as successfull programming
					if (pageReported == 0xFFFF) {					
						deferred.resolve();	
						return (Q.resolve(0xFFFF));						
					}
					// else if page address is not valid...
					else if ((pageReported < 0) || (pageReported >= l_PageCount)) {
						return Q.reject("Invalid page address " + pageReported + " reported by device...");
					}
					// else if not next page reported
					else if (pageReported != (page + 1)) {
						return (
							Q.fcall(function() {
								// If no retries left, stop
								if (l_RetryCounter++ >= NUM_OF_RETRIES)
									return Q.reject("Device is not ready for next page " + (page + 1));
							
							})			
							// Little bit delay
							.delay(50)
							// Retry with the same page
							.thenResolve(page)
						)
					}
					
					// ...device is ready for next page...
					page = pageReported;
					l_RetryCounter = 0;
					return Q.resolve(page);
				})
				.then(function(page) {		
					// If not last page, send packet to device
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
				// Send page data to the device
				Q.fcall(self.programFwPage, m_HexData[page], page)
				// Nofify progress
				.then(Q.fbind(notifyProgress, {progress : 10 + (80 * page / l_PageCount)}))
				// Start next round by waiting device report
				.then(function() {
					return waitDeviceReady(page);
				})
				.catch (function(err) {
					// Error occured
					if (l_RetryCounter++ >= NUM_OF_RETRIES) 
						deferred.reject(err);
					else
						return process.nextTick(sendPacket.bind(null, page)); // RETRY
				})
			)
		}

		// Get page count information and trig programming
		var page = -1;
		self.targetModule.getModuleInfo()
		.then(function(moduleinfo) {
			l_PageCount = moduleinfo.programPageCount;
			waitDeviceReady(page);
		})
		.catch(deferred.reject)
					
		// Do repeat programming until resolved
		return deferred.promise;		
	}
	
	// Program device
	/*private*/ function doProgram() {
    fxLog.trace("doProgram...");
    console.log('Debut de la phase de Mise à jour...')
    return (
        // CHECK BUFFER DATA AND CONVERT TO DEVICE FORMAT
        notifyProgress({phase : "Preparing", status : "Checking buffer data...", progress : 0})
        .then(function() {
            console.log('Checking buffer data...');
            return Q.fbind(getHexData, m_Options.data)();
        })
        // OPEN CONNECTION
        .then(Q.fbind(notifyProgress, {status : "Opening connection...", progress : 2}))
        .then(function() {
            console.log('Opening connection...');
            return Q.fbind(self.openConnection, m_Options.port, m_Options)();
        })
        // SET DEVICE TO THE BOOT MODE			
        .then(Q.fbind(notifyProgress, {status : "Activating boot mode...", progress : 5}))		
        .then(function() {
            console.log('Activating boot Mode......') 
            return (
                // Activate boot mode...
                repeatUntilResolvedOrNoRetriesLeft(Q.fbind(self.setupBootMode, (self.passThroughModule.address !== 0), true), 100, NUM_OF_RETRIES)
                .fail(function (err) {
                    // Error occured
					console.log('Erreur durant l activation du boot Mode : verifiez l\id de l\'equipement Fidelix renseigné')
                    return (Q.reject("Unable to activate boot mode : " + err));
                })
            )
        })
        .delay(500)  // PATCHED: Was 100ms, increased to 500ms for device stability
        // SET DEVICE TO THE PROGRAMMING MODE
        .then(Q.fbind(notifyProgress, {status : "Setting up device to the programming mode...", progress : 7}))		
        .then(function() {
            console.log('Setting up device to the programming mode...');
            return (
                // Set device to the programming mode
                repeatUntilResolvedOrNoRetriesLeft(self.setupFwProgramMode, 100, NUM_OF_RETRIES)
                .fail(function(err) {
                    // Error occured
                    return (Q.reject("Unable to set device to the programming mode : " + err));
                })
            )
        })
        .delay(500)  // PATCHED: Was 100ms, increased to 500ms for device stability
        // PROGRAM DEVICE    
        .then(Q.fbind(notifyProgress, {phase : "Programming", status : "Programming device... ", progress : 10}))
        .then(function() {
            console.log("Programming phase started");
            return Q.fbind(transferData)();
        })
        .delay(500)  // PATCHED: Was 100ms, increased to 500ms for device stability
        .then(Q.fbind(notifyProgress, {phase : "Programming OK", status : "Device programmed successfully...", progress : 100}))
        .then(function() {
            console.log("Programming phase completed successfully");
        })
        .catch(function (err) {	
            self.emit('error', err, fxLog.error(err));
            //self.emit('error', err,  console.log("Error occurred during programming phase: ", err.toString()));
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
		
			options.data = new Buffer( new Uint8Array(options.data) );
			
			// Update options
			m_Options = options || {};			
			m_Options.responseTimeout = 5000;

			m_Deferred = Q.defer();
			
		// Do background operation
			doProgram().then(m_Deferred.resolve, m_Deferred.reject)
			.fin(function() {options.data = null});
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
			m_Deferred.reject('Programming cancelled...');
		}
	
		return m_Deferred.promise;
	}		

	// Cancel programming
	/*public*/ this.isBusy = function() {

		fxLog.trace("isBusy...");
	
		return (m_Deferred.state === 'pending');
	}		
}	

// module.exports = new fxFwUpdate();
module.exports = fxFwUpdate;