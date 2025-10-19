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

// *******************************************************************
// INTERNAL OBJECTS/VARIABLES/DEFINITIONS
// *******************************************************************
//var FILETRANSFERDIR = path.normalize(process.env.ROOTDIR + path.sep + "filetransfer");
var FILETRANSFERDIR = path.normalize("/var/www/html/plugins/fidelixUpdater/data/filetransfer");  // PATCHED: Changed plugin name


const logFilePath = path.resolve(__dirname, './logsJeedom.txt');

// Create stream for log file
const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });

// Redirect console.log to log file
console.log = function(message) {
    logStream.write(message + '\n');
};

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
      try {
        const statusData = {
          phase: notify.phase || 'Unknown',
          status: notify.status || '',
          progress: Math.round(notify.progress) || 0,
          timestamp: new Date().toISOString(),
          error: null
        };
        fs.writeFileSync(self.statusFile, JSON.stringify(statusData, null, 2));
      } catch (err) {
        fxLog.debug("Failed to write status file: " + err);
      }
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
        
    console.log('multi24update: Setting device params for ' + options.type)
    fxLog.debug('multi24update: Setting device params for ' + options.type);

    try {
      if (options.address === undefined){
        console.log('multi24update: No module address defined...')
        throw('multi24update: No module address defined...');
      }          

      if ((options.type === 'm24software') || (options.type === 'm24firmware')) {  
        device = (options.type === 'm24software') ? fxSwUpdate : fxFwUpdate;
        device.targetModule.address = options.subaddress || options.address;
        device.passThroughModule.address = options.subaddress ? options.address : 0;
        device.targetModule.type = 'MULTI-24';
        device.passThroughModule.type = options.subaddress ? 'MULTI-24' : '';
      } 
      else if ((options.type === 'displayfirmware') || (options.type === 'displaygraphics')) {
        device = (options.type === 'displaygraphics') ? fxSwUpdate : fxFwUpdate;      
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
      // Initialize status file
      try {
        fs.writeFileSync(self.statusFile, JSON.stringify({
          phase: 'Initializing',
          status: 'Starting update...',
          progress: 0,
          timestamp: new Date().toISOString(),
          error: null
        }, null, 2));
      } catch (err) {
        fxLog.debug("Failed to initialize status file: " + err);
      }
    }

    if (device === fxFwUpdate) {
      fxFwUpdate.on("open",open);
      fxFwUpdate.on("close", close);
      fxFwUpdate.on("disconnect",disconnect);
      fxFwUpdate.on("error",error);
      fxFwUpdate.on("progress",progress);
    }
    else { // fxSwUpdate
      fxSwUpdate.on("open",open);
      fxSwUpdate.on("close", close);
      fxSwUpdate.on("disconnect",disconnect);
      fxSwUpdate.on("error",error);
      fxSwUpdate.on("progress",progress);
    }

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
          fileToHandle = FILETRANSFERDIR + path.sep + filename;	
          // Read file          
          data = fs.readFileSync(fileToHandle);
          // Remove file
          fs.unlinkSync(fileToHandle);          
        }
        catch(err) {
          fxLog.error("Error in reading file " + fileToHandle);
          console.log('Erreur sur la lecture du fichier')
          if (fileToHandle != null) {
            fs.unlinkSync(fileToHandle);
          }
          throw("Can't read file");
        }

        options.data = Buffer.from(data);  // PATCHED: new Buffer() deprecated, use Buffer.from()
        fxLog.debug('File read length', options.data.length);
        fxLog.debug('Start programming');
        console.log('Start programming')
        return Q.resolve();
    })
    .then(Q.fbind(device.program, options)) // DO PROGRAM
    .then(function() {                      // SUCCEEDED
      console.log('Mise à jour effectuée avec succès')
      fxLog.debug("Update succeeded...");
      deferred.resolve();
    })
    .catch(function(err) {                  // FAILED
        // PATCHED: Added recovery mechanism to prevent device bricking
        fxLog.error("Update failed, attempting recovery... " + err);
        console.log("Update failed, attempting recovery: " + err);

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