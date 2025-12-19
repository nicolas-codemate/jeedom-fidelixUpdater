// Copyright 2016 Fidelix Oy / Kai Kämäräinen
'use strict'
	
// *******************************************************************
// MODULE REQUIREMENTS
// *******************************************************************
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const Q = require('q');
const fs = require('fs-extra');
const path = require('path');


const fxLog = require('./FxUtils/').fxLog.configure({modulename: __filename});
const fxSwUpdate = require('./FxMulti24/').fxSwUpdate();
const fxFwUpdate = require('./FxMulti24/').fxFwUpdate();
const fxSwUpdateTCP = require('./FxMulti24/').fxSwUpdateTCP();
const fxFwUpdateTCP = require('./FxMulti24/').fxFwUpdateTCP();

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
//var FILETRANSFERDIR = path.normalize(process.env.ROOTDIR + path.sep + "filetransfer");
var FILETRANSFERDIR = path.normalize(__dirname + "/../../../data/filetransfer");  // PATCHED: Use relative path for portability (works in Docker and standard Jeedom)


const logFilePath = path.resolve(__dirname, './logsJeedom.txt');

// Create stream for log file
const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });

// Redirect console.log to log file
console.log = function(message) {
    logStream.write(message + '\n');
};

// *******************************************************************
// HELPER FUNCTIONS
// *******************************************************************

// Helper function to write status file while preserving custom fields
// PATCHED: Preserve modbusStatus and modbusRestarted fields added by PHP
function writeStatusFile(filePath, updates) {
  try {
    // Read existing status file to preserve custom fields (modbusStatus, modbusRestarted, etc.)
    let existingData = {};
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      existingData = JSON.parse(fileContent);
    }

    // Merge updates with existing data
    const statusData = {
      ...existingData,  // Preserve existing fields
      ...updates         // Override with new values
    };

    fs.writeFileSync(filePath, JSON.stringify(statusData, null, 2));
  } catch (err) {
    fxLog.debug("Failed to write status file: " + err);
  }
}

// *******************************************************************
// MULTI24 UPDATE ROUTINES
// *******************************************************************

// Inherit from event emitter
util.inherits(fxM24Update, EventEmitter);

function fxM24Update() {

  // If instance not created, create now
  if (!(this instanceof fxM24Update)) {
    return new (Function.prototype.bind.apply(fxM24Update, [null, ...arguments]));
  }
      
  var self = this;
  var device = null;

  // PATCHED: Add statusFile property for Solution 3
  this.statusFile = null;

  // Open event handler
  function open() {
    fxLog.debug("on open emitted");
    self.emit("open");       
  }

  // Close event handler
  function close() {
    fxLog.debug("On close emitted");
    self.emit("close");   
  }

  // Disconnect event handler
  function disconnect() {
    fxLog.debug("on disconnect emitted");
    self.emit("disconnect");       
  }

  // Error event handler
  function error(err) {
    fxLog.debug("error " + err);
    self.emit("error", err);
  }

  // Progress event handler
  // PATCHED: Added status file writing for real-time progress (Solution 3)
  function progress(notify) {
    fxLog.debug("Notify " + notify.phase + " : " + notify.status + " " + notify.progress + "%");
    self.emit("progress", notify);

    // Write to status file if provided (Solution 3)
    if (self.statusFile) {
      writeStatusFile(self.statusFile, {
        phase: notify.phase || 'Unknown',
        status: notify.status || '',
        progress: Math.round(notify.progress) || 0,
        timestamp: new Date().toISOString(),
        error: null
      });
    }
  }

  // File removed event handler
  /*
  function fileRemoved(err) {
    fxLog.debug('File removed err',err);
  }
  */

  // Wait for file ready
  function waitFileReady(name) {
    var deferred = Q.defer();

    function doWait() {
      var fileSizeStart = 0;

      return (
        Q.fcall(function() {
          fileSizeStart = fs.statSync(name).size;
        })			
        .delay(5000)
        .then(function() {
                var fileSizeEnd = fs.statSync(name).size;
                if (fileSizeEnd != fileSizeStart) {
                        doWait();
                }
                else {
                        deferred.resolve();
                }
        })
        .fail(deferred.reject)
      )
    }

    doWait();

    return deferred.promise;
  }

  // Cancel software update
  this.cancel = function(filename) {
    
    fxLog.debug('multi24update.cancel');
    
    // If programming is busy, do cancel
    if (device != null) { 
      device.cancel();
    }

    if (filename) {
      // Remove file
      const fileToHandle = FILETRANSFERDIR + path.sep + filename;	
      fs.unlinkSync(fileToHandle); 
    }
  }

  // Execute software update
  this.update = function(filename, options) {

    // Build descriptive labels for logging
    var typeLabels = {
      'm24software': 'Software Multi24',
      'm24firmware': 'Firmware Multi24',
      'displayfirmware': 'Firmware Display',
      'displaygraphics': 'Graphics Display'
    };
    var typeLabel = typeLabels[options.type] || options.type;

    // Determine connection type (RTU by default, TCP if specified)
    // Note: 'tcp-transparent' is also TCP, just with transparent/raw mode enabled
    const isTCP = options.connectionType === 'tcp' || options.connectionType === 'tcp-transparent';
    var connectionLabel = 'RTU';
    if (options.connectionType === 'tcp-transparent') {
      connectionLabel = 'TCP Transparent';
    } else if (options.connectionType === 'tcp') {
      connectionLabel = 'TCP Modbus';
    }

    // Build passthrough info
    var passthroughLabel = options.subaddress
      ? 'Passthrough (' + options.address + ' -> ' + options.subaddress + ')'
      : 'Direct (' + options.address + ')';

    // Log header with all update info
    console.log('');
    console.log('╔' + '═'.repeat(58) + '╗');
    console.log('║  FIDELIX UPDATE - ' + typeLabel.padEnd(39) + '║');
    console.log('║  Mode: ' + connectionLabel.padEnd(50) + '║');
    console.log('║  Address: ' + passthroughLabel.padEnd(47) + '║');
    if (isTCP) {
      console.log('║  Host: ' + (options.host + ':' + options.tcpPort).padEnd(50) + '║');
    } else {
      console.log('║  Port: ' + (options.port || '-').padEnd(50) + '║');
    }
    console.log('╚' + '═'.repeat(58) + '╝');
    console.log('');

    fxLog.debug('multi24update: Setting device params for ' + options.type);

    try {
      if (options.address === undefined){
        console.log('multi24update: No module address defined...')
        throw('multi24update: No module address defined...');
      }

      if (isTCP) {
        // Validate TCP options
        if (!options.host) {
          throw('multi24update: No TCP host defined for TCP connection');
        }
        if (!options.tcpPort) {
          throw('multi24update: No TCP port defined for TCP connection');
        }
      }

      if ((options.type === 'm24software') || (options.type === 'm24firmware')) {
        // Select RTU or TCP device based on connection type
        if (isTCP) {
          device = (options.type === 'm24software') ? fxSwUpdateTCP : fxFwUpdateTCP;
        } else {
          device = (options.type === 'm24software') ? fxSwUpdate : fxFwUpdate;
        }
        device.targetModule.address = options.subaddress || options.address;
        device.passThroughModule.address = options.subaddress ? options.address : 0;
        device.targetModule.type = 'MULTI-24';
        device.passThroughModule.type = options.subaddress ? 'MULTI-24' : '';
      }
      else if ((options.type === 'displayfirmware') || (options.type === 'displaygraphics')) {
        // Select RTU or TCP device based on connection type
        if (isTCP) {
          device = (options.type === 'displaygraphics') ? fxSwUpdateTCP : fxFwUpdateTCP;
        } else {
          device = (options.type === 'displaygraphics') ? fxSwUpdate : fxFwUpdate;
        }
        device.targetModule.address = options.subaddress || options.address;
        device.passThroughModule.address = options.subaddress ? options.address : 0;
        device.targetModule.type = 'DISPLAY';
        device.passThroughModule.type = options.subaddress ? 'MULTI-24' : '';
      }
      else
        throw('multi24update: No module type provided...');
    }
    catch (err) {
      fxLog.error(err);
      return (Q.reject(err));
    }

    // PATCHED: Set status file for real-time progress (Solution 3)
    self.statusFile = options.statusFile || null;
    if (self.statusFile) {
      fxLog.debug("Status file enabled: " + self.statusFile);
      // Initialize status file (preserve existing fields from PHP)
      writeStatusFile(self.statusFile, {
        phase: 'Initializing',
        status: 'Starting update...',
        progress: 0,
        timestamp: new Date().toISOString(),
        error: null
      });
    }

    // Set up event handlers for the selected device (works for both RTU and TCP)
    device.on("open", open);
    device.on("close", close);
    device.on("disconnect", disconnect);
    device.on("error", error);
    device.on("progress", progress);

    var deferred = Q.defer();
    
    Q.fcall(function() {                    // READ FILE TO THE BUFFER
        console.log('Start reading file to buffer')
        // fs.writeFile(fileLogJeedom, 'READING FILE TO BUFFER', (err) => {
        //   if (err) {
        //     console.error('Erreur lors de l\'écriture dans le fichier :', err);
        //     return;
        //   }
        //   console.log('Données écrites avec succès dans le fichier.');
        // });
        console.log('multi24update: Reading file to buffer', filename)
        fxLog.debug('multi24update: Reading file to buffer', filename);

        var fileToHandle = null;
        var data;

        try {
          console.log('Debut de la lecture du fichier de mise à jour')

          // PATCHED: Support both absolute paths (new) and relative filenames (backward compatibility)
          if (path.isAbsolute(filename)) {
            // Filename is already an absolute path, use it directly
            fileToHandle = filename;
            console.log('Using absolute path: ' + fileToHandle);
          } else {
            // Filename is relative, construct full path (backward compatibility)
            fileToHandle = FILETRANSFERDIR + path.sep + filename;
            console.log('Constructed path from filename: ' + fileToHandle);
          }

          // Verify file exists before attempting to read
          if (!fs.existsSync(fileToHandle)) {
            throw new Error("File not found: " + fileToHandle);
          }

          console.log('Reading file: ' + fileToHandle);
          // Read file
          data = fs.readFileSync(fileToHandle);

          console.log('File read successfully, size: ' + data.length + ' bytes');

          // PATCHED: Keep file until programming succeeds (moved deletion to end)
          // Will be deleted in .then() after successful programming or in .catch() on error
          console.log('Keeping file for programming: ' + fileToHandle);
        }
        catch(err) {
          fxLog.error("Error in reading file " + fileToHandle + ": " + err.message);
          console.log('Erreur sur la lecture du fichier: ' + err.message)
          if (fileToHandle != null && fs.existsSync(fileToHandle)) {
            try {
              fs.unlinkSync(fileToHandle);
              console.log('Cleaned up file after read error: ' + fileToHandle);
            } catch (unlinkErr) {
              console.log('Failed to clean up file: ' + unlinkErr.message);
            }
          }
          throw("Can't read file: " + err.message);
        }

        options.data = Buffer.from(data);  // PATCHED: new Buffer() deprecated, use Buffer.from()
        options.fileToHandle = fileToHandle; // PATCHED: Store file path for later cleanup
        fxLog.debug('File read length', options.data.length);
        fxLog.debug('Start programming');
        console.log('Start programming, data buffer size: ' + options.data.length + ' bytes')
        return Q.resolve();
    })
    .then(Q.fbind(device.program, options)) // DO PROGRAM
    .then(function() {                      // SUCCEEDED
      console.log('Programming completed successfully');
      // PATCHED: Delete file after successful programming
      if (options.fileToHandle && fs.existsSync(options.fileToHandle)) {
        try {
          fs.unlinkSync(options.fileToHandle);
          console.log('Temporary file deleted after successful programming: ' + options.fileToHandle);
        } catch (unlinkErr) {
          console.log('Warning: Failed to delete temporary file: ' + unlinkErr.message);
        }
      }
      console.log('Mise à jour effectuée avec succès')
      fxLog.debug("Update succeeded...");
      deferred.resolve();
    })
    .catch(function(err) {                  // FAILED
        // PATCHED: Added recovery mechanism to prevent device bricking
        fxLog.error("Update failed, attempting recovery... " + err);
        console.log("Update failed, attempting recovery: " + err);

        // PATCHED: Cleanup uploaded file on error
        if (options.fileToHandle && fs.existsSync(options.fileToHandle)) {
            try {
                fs.unlinkSync(options.fileToHandle);
                console.log('Temporary file deleted after programming error: ' + options.fileToHandle);
            } catch (unlinkErr) {
                console.log('Warning: Failed to delete temporary file after error: ' + unlinkErr.message);
            }
        }

        // PATCHED: Write error to status file immediately
        if (self.statusFile) {
            writeStatusFile(self.statusFile, {
                phase: 'Error',
                status: 'Update failed',
                progress: 0,
                timestamp: new Date().toISOString(),
                error: String(err)
            });
        }

        // Try to restore device to normal mode
        return Q.resolve()
            .then(function() {
                if (!device) {
                    return Q.resolve();
                }

                // Try to end programming mode based on device type
                if (device === fxSwUpdate) {
                    fxLog.debug("Attempting to end SW programming mode...");
                    return device.endSwProgramming().timeout(5000).catch(function(recoveryErr) {
                        fxLog.debug("Recovery: endSwProgramming failed: " + recoveryErr);
                    });
                } else if (device === fxFwUpdate) {
                    fxLog.debug("Attempting to end FW programming mode...");
                    return device.endFwProgramming().timeout(5000).catch(function(recoveryErr) {
                        fxLog.debug("Recovery: endFwProgramming failed: " + recoveryErr);
                    });
                }
                return Q.resolve();
            })
            .delay(1000)
            .then(function() {
                if (!device) {
                    return Q.resolve();
                }
                // Try to close connection
                fxLog.debug("Attempting to close connection...");
                return device.closeConnection().timeout(2000).catch(function(closeErr) {
                    fxLog.debug("Recovery: closeConnection failed: " + closeErr);
                });
            })
            .finally(function() {
                deferred.reject(err);  // Still reject with original error
            });
    })
    .fin(function() {                       // FINALLY
      // Clear device handle
      device = null;
    })
 
    return deferred.promise;
  }

  // Get update file 
  //  Filename format samples
  //      "1-m24firmware-9.99.hex" where first 1 = device address and 9.99 is version number
  //      "1.10-displayfirmware-9.99.hex" where first 1 = device address 10 = subaddress and 9.99 is version number  
  this.getUpdateFile = function(name, filetype, addressToCheck) {

    var deferred = Q.defer();

    try {

      // Read filetransfer -directory content
      fs.readdir(FILETRANSFERDIR, function(err,files) {

        if (err)
          throw (err);

        // Get file type as lowercase
        var fileType = '.' + filetype.toLowerCase();

        for (var i = 0; i < files.length; i++) {

          // Convert file name to the lowercase  
          var fileName = files[i].toLowerCase();
          // Get file identificaton as lowercase
          var fileId = name.toLowerCase();

          // If file identification found and file type (extension) match and filename doesn't contain "_processing" -text
          if ((fileName.indexOf(fileId) > -1) && (fileName.indexOf(fileType) > -1) && (fileName.indexOf("_processing") < 0)) {
            
            /*
            var start = (fileId + '-').length;
            var end = fileName.length - fileType.length;
            var fileVersion = fileName.slice(start, end);
            var new_version = parseFloat(fileVersion);
            */

            // Device address should be before filename, delimited by some character
            var fileAddress = "1.0";
            if (fileName.indexOf(fileId) > 1)
              fileAddress = fileName.slice(0, fileName.indexOf(fileId) - 1);

            // Parse address and subaddress from address string
            var fileChannel = fileAddress.split("-");
            var channel = 1;
            var addressParts = fileAddress.split(".");
            if (fileChannel.length > 1) {
              channel = parseInt(fileChannel[0].replace('ch', ''));
              addressParts = fileChannel[1].split(".");
            }
            else {
              addressParts = fileAddress.split(".");
            }

            var address = 1;
            var subaddress = undefined;
            if (addressParts.length >= 1)
              address = parseInt(addressParts[0]);
            if (addressParts.length >= 2)
              subaddress = parseInt(addressParts[1]);

            // If addressToCheck defined, check if address match
            if ((addressToCheck) && (fileAddress !== addressToCheck))
              continue;

            fxLog.debug('Update file found : address = ' + fileAddress + ', fileName = ' + files[i]);
            // Wait for file load finish before starting update
            waitFileReady(FILETRANSFERDIR + path.sep + files[i])
            .then(Q.fbind(deferred.resolve, {"channel": channel, "address": address, "subaddress": subaddress, "fileName": files[i]}))

            return deferred.promise;                
          }
        }

        // No update file found
        deferred.resolve(null);
      });      
    }
    catch(err) {
      // Error occured
      fxLog.error('Error in checking M24 version update ' + err);
      deferred.resolve(null);
    }

    return deferred.promise;
  }
}

module.exports = fxM24Update;