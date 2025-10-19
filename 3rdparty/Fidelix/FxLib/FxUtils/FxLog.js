// Copyright 2014 Fidelix Oy / Kai Kämäräinen

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const path = require('path');

// *******************************************************************
// LOG LOGIC
// *******************************************************************
var fxLog = function() 
{
	self = this;

	this.log = require('debug')('log');
	this.trace = require('debug')('trace');
	this.info = require('debug')('info');
	this.debug = require('debug')('debug');
	this.warn = require('debug')('warn');
	this.error = require('debug')('error');

	return (this);
}					

// Configure module
fxLog.configure = function(options) {

	var logger = new fxLog();
	
	if ((options.modulename != null) && (typeof(options.modulename) === 'string'))
	{
		logger.name = path.basename(options.modulename);
		
		logger.log = require('debug')('log' + '_' + self.name);
		logger.trace = require('debug')('trace' + '_' + self.name);
		logger.info = require('debug')('info' + '_' + self.name);
		logger.debug = require('debug')('debug' + '_' + self.name);
		logger.warn = require('debug')('warn' + '_' + self.name);
		logger.error = require('debug')('error' + '_' + self.name);					
	}	
	
	return (logger);
}

module.exports = fxLog;