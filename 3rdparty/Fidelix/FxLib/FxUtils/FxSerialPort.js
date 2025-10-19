// Copyright 2014 Fidelix Oy / Kai Kämäräinen
'use strict'

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const {SerialPort} = require('serialport');
const util = require('util');
const eventEmitter = require('events').EventEmitter;
const fxLog = require('./FxLog.js').configure({modulename: __filename});
const Q = require('q');

// *******************************************************************
// DEFINITIONS
// *******************************************************************
const USE_BUFFERED_READ = false;

// *******************************************************************
// INTERFACE OBJECT
// *******************************************************************

// Inherit from event emitter
util.inherits(fxSerialPort, eventEmitter);

function fxSerialPort() {
	
	// *******************************************************************
	// PRIVATE VARIABLES
	// *******************************************************************

	// In some callback context, this does not refer to fxSerial instance
	// -> catch reference of this to self and use always self below
	var self = this;
	
	var m_SerialPort = null;
	var m_RxBuffer = new Buffer(2048);
	m_RxBuffer.used = 0;	
	
	// *******************************************************************
	// PUBLIC VARIABLES
	// *******************************************************************
	this.isOpen = false;
	this.options = {};
	this.portName = null;

	// *******************************************************************
	// PRIVATE FUNCTIONS
	// *******************************************************************

	// *******************************************************************
	// EVENT HANDLERS
	// *******************************************************************	
	
	/*private*/ 
	var onError = function (err) {
		
		err = self.portName + ' error : ' + err;
		self.emit('error', err, fxLog.error(err));
	}
	
	// Serial port disconnect event handler (unexpected close of port)
	/*private*/ 
	var onDisconnect = function (err) {
		
		let error = self.portName + ' connection lost ' + err;
		self.emit('close', err);
		self.emit('disconnect', err, fxLog.error(error));
		
		// Remove listeners on next tick
		process.nextTick(self.removeAllListeners.bind(self));
		
		self.isOpen = false;
		m_SerialPort = null;
	}
	
	// Serial port receive event handler
	/*private*/ 
	var onReceive = function(data) {
		//fxLog.logToFile('rx:' + data.toString('hex'));
		// Ensure that port is open
		if (self.isOpen)
		{
			// Generate receive char event
			for (var i = 0; i < data.length ; i++) {
				self.emit('rxchar', data[i]);
			}

			// Request receive event
			data = Buffer.concat([data]);
			var info = self.portName + ' Rx : ' + data.toString('hex'); // TODO: How to add extra space between hex -bytes???
			self.emit('receive', data, fxLog.log(info));
			
			if (USE_BUFFERED_READ) {
			
				// Add data to the buffer
				var _space_available = m_RxBuffer.length - m_RxBuffer.used;
				data = data.slice(0, _space_available);
				data.copy(m_RxBuffer, m_RxBuffer.used);
				m_RxBuffer.used += data.length;
				
				if (m_RxBuffer.used >= m_RxBuffer.length)
				{
					var err = self.portName + ' error : receive buffer full';
					self.emit('bufferfull', err, fxLog.error(err));
				}							 				
			}
		}		
	}	

// *******************************************************************
// INTERFACE FUNCTIONS
// *******************************************************************		
	
	this.listSerialPorts = SerialPort.list;
        
	this.flush = function() {

		if (self.isOpen) {
			
			var deferred = Q.defer();
				
			m_SerialPort.flush(function(){
			deferred.resolve();
			});

			return deferred.promise; 
		}

		return Q.resolve();
	}

	// Open serial port connection
	this.open = function (portName, options) {
	
		var deferred = Q.defer();
						
		// If port is already open, reopen
		if (self.isOpen)		
			fxLog.debug(portName + " reopening...");
		else
			fxLog.debug(portName + " opening...");
			
		// Ensure that port is closed before open, (reopen if is still open)
		self.close().then(function() {
		
			// Assign desired settings to the serial port
			self.portName = portName;
			options = options || {};
			options.baudRate = options.baudRate || 57600;
			options.dataBits = options.dataBits || 8;
			options.parity = options.parity || 'none';
			options.stopBits = options.stopBits || 2;
			options.autoOpen = false;
			self.options = options;
			
			try {
				// Open port
				m_SerialPort = new SerialPort({path:self.portName, baudRate:options.baudRate, dataBits:options.dataBits, parity:options.parity, stopBits:options.stopBits, autoOpen:false});
			

				// Clear receive buffer
				m_RxBuffer.used = 0;
					
				// Catch error event
				m_SerialPort.on('error', onError);
						
				/*m_SerialPort.once('open', function() {
					self.isOpen = true;
					var info = self.portName + " open succeeded...";
					self.emit('open', info, fxLog.debug(info));						
					deferred.resolve();
				});*/

				// Open port
				m_SerialPort.open(function (err) {
					
					// Flush serialport
          m_SerialPort.flush();

					// Wait callback
					if (err){
						err = self.portName + " open failed : " + err;
						fxLog.error(err);
						deferred.reject(err);
					}
					else {						
						self.isOpen = true;
						
						// Catch disconnect and data events
						m_SerialPort.once('disconnect', onDisconnect);
						m_SerialPort.on('data', onReceive);
						
						self.isOpen = true;
						var info = self.portName + " open succeeded...";
						self.emit('open', info, fxLog.debug(info));
						self.emit('connect');
						deferred.resolve();
					}
				});
			} 
			catch (err) {
				let error = self.portName + " unexpected error : " + err;
				fxLog.error(error);
				deferred.reject(err);
			}
		});
		
		return deferred.promise;
	}	
	
	// Close serial port connection
	/*public*/ 
	this.close = function () {

		var deferred = Q.defer();
				
		// If port is not open
		if (!self.isOpen) {
			deferred.resolve();
			return deferred.promise;
		}
				
		fxLog.debug(self.portName + " closing...");
		
		try {
			// Remove OnClose event listener
			m_SerialPort.removeListener('disconnect', onDisconnect);
			
			// Close serial port
			m_SerialPort.close(function (err) {
				// Wait callback
				if (err) {
					err = self.portName + " close failed : " + err;
					fxLog.error(err);
					deferred.reject(err);
				}
				else {		
					self.isOpen = false;
					var info = self.portName + " close succeeded...";
					self.emit('close', info, fxLog.debug(info));
					// Remove listeners on next tick
					process.nextTick(self.removeAllListeners.bind(self));
					deferred.resolve();
				}
			});			
		}		
		catch (err)	{
			let error = self.portName + " unexpected error : " + err;
			fxLog.error(error);
			deferred.reject(err);
		}		
				
		return deferred.promise;		
	}

	/*public*/ 
	this.read = function (offset, length) {
		let err;
		var deferred = Q.defer();
		
		// Ensure that port is open
		if (self.isOpen) {
		
			if (!USE_BUFFERED_READ) {			
				err = self.portName + ' error : Buffered read is not in use';
				self.emit('error', err, fxLog.error(err));
				deferred.reject(err);
			}
			else {
				offset = offset || 0;
				if (offset > m_RxBuffer.used)
					offset = m_RxBuffer.used;
				if (!length || length > (m_RxBuffer.used - offset))
					length = m_RxBuffer.used - offset;
				
				var data = new Buffer(length);
				m_RxBuffer.copy(data, 0, offset, offset + length);
				m_RxBuffer.copy(m_RxBuffer, offset, offset + length);
				m_RxBuffer.used -= data.length;
												
				deferred.resolve(data);
			}
		}
		else {
		// Port is not open
			err = self.portName + ' error : Cannot read, port is not open';
			self.emit('error', err, fxLog.error(err));		
			deferred.reject(err);
		}
		
		return deferred.promise;
	}

	/*public*/ 
	this.bytesToRead = function () {

		// Ensure that port is open
		return (self.isOpen) ? (m_RxBuffer.used) : 0;
	}

	/*public*/ 
	this.write = function (data, offset, length) {

		var deferred = Q.defer();
				
		// Ensure that port is open
		if (self.isOpen) {

			// Get data to transmit
			let txBuffer = (data instanceof Buffer) ? data : Buffer.from(data);

			offset = offset || 0;
			length = length || data.length;

			txBuffer = txBuffer.slice(offset, offset + length);

//            m_SerialPort.flush(function(){	
				//fxLog.logToFile('tx:' + buf.toString('hex'));
				m_SerialPort.write(txBuffer, function (err) {
					// Wait callback
					if (err) {

						err = self.portName + ' write error : ' + err;
						self.emit('error', err, fxLog.error(err));
						deferred.reject(err);
					}
					else {

						var info = self.portName + ' Tx : ' + txBuffer.toString('hex'); // TODO: How to add extra space between hex -bytes???
						self.emit('write', info, fxLog.log(info));
						deferred.resolve();
					}
				});
//			});
		}
		else {
		// Port is not open
			var err = self.portName + ' error : Cannot write, port is not open';
			self.emit('error', err, fxLog.error(err));
			deferred.reject(err);
		}
		
		return deferred.promise;
	}			
}

module.exports = fxSerialPort;
