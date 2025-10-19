// Copyright 2014 Fidelix Oy / Kai Kämäräinen
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const {SerialPort} = require('serialport');
const eventEmitter = require('events').EventEmitter;
const util = require('util');
const fxLog = require('./FxLog.js').configure({modulename: __filename});
const fxSerialPort = require('./FxSerialPort.js')
const Q = require('q');

// *******************************************************************
// DEFINITIONS
// *******************************************************************
const WAIT_TIMEOUT_DEFAULT = 1000;

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************

// Inherit from event emitter
util.inherits(fxSerial, eventEmitter);

function fxSerial() {
	// *******************************************************************
	// STATIC VARIABLES
	// *******************************************************************


	// *******************************************************************
	// PRIVATE VARIABLES
	// *******************************************************************
	var self = this;
	
	var m_SerialPort = null;

	// *******************************************************************
	// PUBLIC VARIABLES
	// *******************************************************************
	this.isOpen = false;

	// *******************************************************************
	// PRIVATE FUNCTIONS
	// *******************************************************************

	// *******************************************************************
	// EVENT HANDLERS
	// *******************************************************************	
		
	// Serial port disconnect event handler (unexpected close of port)
	/*private*/ 
	const onDisconnect = function(err) {
		
		if (m_SerialPort) {			
			m_SerialPort.removeAllListeners();
		}
			
		self.isOpen = false;
//		self.emit('close', err);
		self.emit('disconnect', err);
		m_SerialPort = null;

		// Remove listeners on next tick
		process.nextTick(self.removeAllListeners.bind(self));
	}

	/*private*/ 
	const onConnect = function () {
		self.isOpen = true;
	}

	// *******************************************************************
	// INTERFACE FUNCTIONS
	// *******************************************************************		
	
	this.listSerialPorts = SerialPort.list;

	// Wait response from device
	this.waitResponse = function(patternToWait, length, msTimeout)	{
		msTimeout = msTimeout || WAIT_TIMEOUT_DEFAULT;
		patternToWait = patternToWait || Buffer.from([]);
		length = length || patternToWait.length;
		fxLog.trace(`waitResponse(${Buffer.concat([patternToWait]).toString('hex')}, ${msTimeout})`);

		return Q.promise((resolve, reject) => {
		
			// Receive handler
			let response = Buffer.from([]);
			let onReceive = function(data) {				
				// Add received data to the buffer
				response = Buffer.concat([response, data]);

				// Try to find pattern to wait
				let matchingPatternPos = response.indexOf(patternToWait);

				// If matching pattern received, remove data before pattern
				if (matchingPatternPos > 0) {
					response = response.slice(matchingPatternPos);
					matchingPatternPos = 0;				
				}

				// If matching pattern found andd required byte count received...
				if ((matchingPatternPos === 0) && (response.length >= length)) {						
					self.removeListener('receive', onReceive);
					clearTimeout(onTimeout);
					resolve(response);
					return;
				}
			}
			
			self.on('receive', onReceive);
		
			// Timeout handler
			let onTimeout = setTimeout(function () {
				self.removeListener('receive', onReceive);
				reject('Timeout');				
			}, msTimeout);
		})
	}	
	
    this.flush = function(...args) {

		return (m_SerialPort) ? m_SerialPort.flush.call(...args) : Q.reject('Port is not open');
	}

	// Open serial port connection
	this.open = function(portName, ...args) {

		// If serial port is already created, recall open
		if (m_SerialPort) {
			return m_SerialPort.open(portName, ...args);
		}
        console.log('Ouverture du port série sur le port :', portName)
		m_SerialPort = new fxSerialPort();
		console.log('Ouverture Reussie')
		// Redirect serial port events
		m_SerialPort.on('error', (...args) => self.emit('error', ...args));
		m_SerialPort.on('connect', (...args) => self.emit('connect', ...args));
		m_SerialPort.on('disconnect', (...args) => self.emit('disconnect', ...args));
		m_SerialPort.on('open', (...args) => self.emit('open', ...args));
		m_SerialPort.on('close', (...args) => self.emit('close', ...args));
		m_SerialPort.on('write', (...args) => self.emit('write', ...args));
		m_SerialPort.on('bufferfull', (...args) => self.emit('bufferfull', ...args));	
		m_SerialPort.on('receive', (...args) => self.emit('receive', ...args));
		m_SerialPort.on('rxchar', (...args) => self.emit('rxchar', ...args));
								
		// Catch disconnect event
		m_SerialPort.once('disconnect', onDisconnect);
		m_SerialPort.once('close', onDisconnect);
		m_SerialPort.on('connect', onConnect);

		return m_SerialPort.open(portName, ...args);
	}	
	
	// Close serial port connection
	/*public*/ 
	this.close = function (...args) {

		return (m_SerialPort) ? m_SerialPort.close.call(m_SerialPort, ...args) : Q.reject('Port is not open');
	}

	/*public*/ 
	this.read = function (...args) {

		return (m_SerialPort) ? m_SerialPort.read.call(m_SerialPort, ...args) : Q.reject('Port is not open');
	}

	/*public*/ 
	this.bytesToRead = function (...args) {

		return (m_SerialPort) ? m_SerialPort.bytesToRead.call(m_SerialPort, ...args) : Q.reject('Port is not open');
	}

	/*public*/ 
	this.write = function (...args) {

		if (!m_SerialPort) {
			return Q.reject('Port is not open');
		}

		return (m_SerialPort) ? m_SerialPort.write.call(m_SerialPort, ...args) : Q.reject('Port is not open');
	}	
}

module.exports = fxSerial;