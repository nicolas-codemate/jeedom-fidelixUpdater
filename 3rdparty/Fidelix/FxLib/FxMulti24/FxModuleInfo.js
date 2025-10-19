// Copyright 2014 Fidelix Oy / Kai Kämäräinen

// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
//const assert = require('assert');
//const util = require('util');
const Q = require('q');
//const fxLog = require('../FxUtils/').fxLog.configure({modulename: __filename});

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************

// *******************************************************************
// INTERFACE OBJECT (fxModuleInfo)
// *******************************************************************

// Inherit from CPU
//util.inherits(fxModuleInfo, CPU);

function fxModuleInfo() {

	// Request to create base class
	//fxModuleInfo.super_.call(this);
	
	// *******************************************************************
	// PRIVATE VARIABLES
	// *******************************************************************
	// In some callback context, this does not refer to fxSerial instance
	// -> catch reference of this to self and use always self below
	var self = this;
	
	// Supported modules
	var m_ModuleTypes = ["MULTI-24", "DISPLAY"];
	
	// Module info
	var info = {};	

	// *******************************************************************
	// PUBLIC VARIABLES
	// *******************************************************************	
	this.type = ""; // Type of the module
	this.address = 1; // Address of the module
	this.hwVersion = 0; // Hw version of the module
		
	// *******************************************************************
	// PRIVATE FUNCTIONS
	// *******************************************************************
		
	// *******************************************************************
	// EVENT HANDLERS
	// *******************************************************************
	
	// *******************************************************************
	// INTERFACE FUNCTIONS
	// *******************************************************************		

	// *** CPU-specific methods and properties ***
		
	// List supported CPU types
	/*public*/ 
	/*
	this.enumSupportedCPUs = function(list) {
		return (["ATmega8515", "ATmega64", "ATmega8535", "ATmega640", "STM32F103VE", "STM32F407VE"]);
	}
	*/
	
	/* Get CPU info */	
	this.getCPUInfo = function() {
		
		return (
			// Resolve CPU-type of the module
			Q.fcall(function() {
				if (info.cpuType == "STM32F407VE") {
					info.bootloaderSizeB = 128 * 1024;					
					info.eepromSizeB = 0;
					info.programMemorySizeB = 524288;
					info.pageSizeB = 256;
				}
				else if (info.cpuType == "STM32F103VE") {
					info.bootloaderSizeB = 16384;
					info.eepromSizeB = 0;
					info.programMemorySizeB = 524288;
					info.pageSizeB = 256;
				}
				else if (info.cpuType == "ATmega64") {
					info.bootloaderSizeB = 2048;
					info.eepromSizeB = 2048;
					info.programMemorySizeB = 65536;
					info.pageSizeB = 256;
				}					
				else if (info.cpuType == "ATmega640") {
					info.bootloaderSizeB = 2048;
					info.eepromSizeB = 4096;
					info.programMemorySizeB = 65536;
					info.pageSizeB = 256;
				}
				else if (info.cpuType == "ATmega8515") {
					info.bootloaderSizeB = 2048;
					info.eepromSizeB = 2048;
					info.programMemorySizeB = 8192;
					info.pageSizeB = 64;
				}
				else if (info.cpuType == "ATmega8535") {
					info.bootloaderSizeB = 2048;
					info.eepromSizeB = 2048;
					info.programMemorySizeB = 8192;
					info.pageSizeB = 64;
				}
				else
					return Q.reject("UNKNOWN CPU " + info.cpuType);
				
				// Calculate page count				
				info.pageCount = (info.programMemorySizeB - info.bootloaderSizeB) / info.pageSizeB;
				
				return (Q.resolve(info));
			})
			.catch(Q.reject)
		)		
	}	
	
	// *** Module-specific methods and properties ***
	
	// List supported modules
	/*public*/ this.enumSupportedModules = function() {
		return (m_ModuleTypes);
	}

	// Get module name by ID
	/*public*/ this.getNameByID = function(moduleID) {
	
		if (moduleID < m_ModuleTypes.length)
			return (Q.resolve(m_ModuleTypes[moduleID]));

		return (Q.reject("UNKNOWN MODULE"));
	}

	// Get module ID by name
	/*public*/ this.getIDByName = function(moduleName) {
	
		// Seek specified module name from table
		for (var i = 0; i < m_ModuleTypes.length; i++)
		{
			if (m_ModuleTypes[i] == moduleName)
				return (Q.resolve(i));
		}

		return (Q.reject("UNKNOWN MODULE"));
	}

	/* Get target module info */
	/*public*/ this.getModuleInfo = function(moduleID) {
	
		moduleID = moduleID || self.type;
		info.moduleType = moduleID;
		
		return (
			// Resolve CPU-type of the module
			Q.fcall(function() {
				if (info.moduleType == "MULTI-24")
					info.cpuType = "STM32F407VE";
				else if (info.moduleType == "DISPLAY")
					info.cpuType = "STM32F103VE";
				else
					return Q.reject("UNKNOWN MODULE : " + info.moduleType);
			})
			// Get CPU-info
			.then(self.getCPUInfo)
			// Get module dependent info
			.then(function() {
				if (info.moduleType == "MULTI-24") {
					info.bootloaderStartRegister = 127;
					info.pagesReservedForData = 512;
					info.programPageCount = info.pageCount - info.pagesReservedForData;
				}
				else if (info.moduleType == "DISPLAY") {
					info.bootloaderStartRegister = 3063;
					info.pagesReservedForData = 1104;
					info.programPageCount = info.pageCount - info.pagesReservedForData;
				}
				else
					return Q.reject("UNKNOWN MODULE : " + info.moduleType);
					
				return Q.resolve(info);
			})
			.catch(Q.reject)
		)
	}			
}

module.exports = fxModuleInfo;


