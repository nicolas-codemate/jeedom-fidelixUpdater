<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jeedom is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
 */

try {
    require_once dirname(__FILE__) . '/../../../../core/php/core.inc.php';
    include_file('core', 'authentification', 'php');

    if (!isConnect('admin')) {
        throw new Exception(__('401 - Accès non autorisé', __FILE__));
    }

    // Load helper class
    require_once dirname(__FILE__) . '/../class/fidelixUpdaterHelper.class.php';

    ajax::init(['uploadFirmware', 'uploadSoftware', 'uploadGraphics', 'validateFile', 'startUpdate', 'getStatus', 'cleanupUpdate', 'getProcesses', 'killProcess', 'testConnection', 'fixPermissions', 'getLogs']);

    // ========================================
    // ACTION: uploadFirmware
    // ========================================
    if (init('action') == 'uploadFirmware') {
        log::add('fidelixUpdater', 'debug', 'Upload firmware demandé');

        // Use helper to ensure directory exists with proper error handling
        try {
            $uploaddir = fidelixUpdater::ensureDirectory(fidelixUpdater::getDataPath('filetransfer'));
            log::add('fidelixUpdater', 'debug', 'Upload directory resolved to: ' . $uploaddir);
        } catch (Exception $e) {
            log::add('fidelixUpdater', 'error', 'Failed to create upload directory: ' . $e->getMessage());
            throw new Exception(__('Impossible de créer le répertoire de téléversement : ', __FILE__) . $e->getMessage());
        }

        if (!isset($_FILES['file'])) {
            throw new Exception(__('Aucun fichier trouvé. Vérifiez le paramètre PHP (post size limit)', __FILE__));
        }

        $filename = strtolower($_FILES['file']['name']);
        if (!preg_match('/\.hex[^.]*$/i', $filename)) {
            throw new Exception('Extension du fichier non valide (autorisé .hex, .hexXXXX, .hex-XXXX)');
        }

        if (filesize($_FILES['file']['tmp_name']) > 10000000) {
            throw new Exception(__('Le fichier est trop gros (maximum 10Mo)', __FILE__));
        }

        $filename = basename($_FILES['file']['name']);
        $filepath = $uploaddir . '/' . $filename;

        if (file_exists($filepath)) {
            @unlink($filepath);
        }

        file_put_contents($filepath, file_get_contents($_FILES['file']['tmp_name']));

        log::add('fidelixUpdater', 'debug', 'Firmware uploadé : ' . $filename);
        ajax::success($filename);
    }

    // ========================================
    // ACTION: uploadSoftware
    // ========================================
    if (init('action') == 'uploadSoftware') {
        log::add('fidelixUpdater', 'debug', 'Upload software demandé');

        // Use helper to ensure directory exists with proper error handling
        try {
            $uploaddir = fidelixUpdater::ensureDirectory(fidelixUpdater::getDataPath('filetransfer'));
            log::add('fidelixUpdater', 'debug', 'Upload directory resolved to: ' . $uploaddir);
        } catch (Exception $e) {
            log::add('fidelixUpdater', 'error', 'Failed to create upload directory: ' . $e->getMessage());
            throw new Exception(__('Impossible de créer le répertoire de téléversement : ', __FILE__) . $e->getMessage());
        }

        if (!isset($_FILES['file'])) {
            throw new Exception(__('Aucun fichier trouvé. Vérifiez le paramètre PHP (post size limit)', __FILE__));
        }

        $filename = strtolower($_FILES['file']['name']);
        if (!preg_match('/\.m24iec$/i', $filename)) {
            throw new Exception('Extension du fichier non valide (autorisé uniquement .M24IEC)');
        }

        if (filesize($_FILES['file']['tmp_name']) > 10000000) {
            throw new Exception(__('Le fichier est trop gros (maximum 10Mo)', __FILE__));
        }

        $filename = basename($_FILES['file']['name']);
        $filepath = $uploaddir . '/' . $filename;

        if (file_exists($filepath)) {
            @unlink($filepath);
        }

        file_put_contents($filepath, file_get_contents($_FILES['file']['tmp_name']));

        log::add('fidelixUpdater', 'debug', 'Software uploadé : ' . $filename);
        ajax::success($filename);
    }

    // ========================================
    // ACTION: uploadGraphics
    // ========================================
    if (init('action') == 'uploadGraphics') {
        log::add('fidelixUpdater', 'debug', 'Upload graphics demandé');

        // Use helper to ensure directory exists with proper error handling
        try {
            $uploaddir = fidelixUpdater::ensureDirectory(fidelixUpdater::getDataPath('filetransfer'));
            log::add('fidelixUpdater', 'debug', 'Upload directory resolved to: ' . $uploaddir);
        } catch (Exception $e) {
            log::add('fidelixUpdater', 'error', 'Failed to create upload directory: ' . $e->getMessage());
            throw new Exception(__('Impossible de créer le répertoire de téléversement : ', __FILE__) . $e->getMessage());
        }

        if (!isset($_FILES['file'])) {
            throw new Exception(__('Aucun fichier trouvé. Vérifiez le paramètre PHP (post size limit)', __FILE__));
        }

        $filename = strtolower($_FILES['file']['name']);
        if (!preg_match('/\.dat[^.]*$/i', $filename)) {
            throw new Exception('Extension du fichier non valide (autorisé uniquement .dat ou .datXXXX)');
        }

        if (filesize($_FILES['file']['tmp_name']) > 10000000) {
            throw new Exception(__('Le fichier est trop gros (maximum 10Mo)', __FILE__));
        }

        $filename = basename($_FILES['file']['name']);
        $filepath = $uploaddir . '/' . $filename;

        if (file_exists($filepath)) {
            @unlink($filepath);
        }

        file_put_contents($filepath, file_get_contents($_FILES['file']['tmp_name']));

        log::add('fidelixUpdater', 'debug', 'Graphics uploadé : ' . $filename);
        ajax::success($filename);
    }

    // ========================================
    // ACTION: validateFile
    // ========================================
    if (init('action') == 'validateFile') {
        $filename = init('filename');
        $updateType = init('updateType');

        if (empty($filename)) {
            throw new Exception('Nom de fichier non spécifié');
        }

        if (empty($updateType)) {
            throw new Exception('Type de mise à jour non spécifié');
        }

        $filenameLower = strtolower($filename);

        // Validate extension based on update type
        if ($updateType === 'm24firmware' || $updateType === 'displayfirmware') {
            // Must start with .hex (anything after is OK: .hex, .hex0281, .hex-0281, etc.)
            if (!preg_match('/\.hex[^.]*$/i', $filenameLower)) {
                throw new Exception('Extension invalide pour le firmware. Attendu: .hex, .hexXXXX ou .hex-XXXX (exemple: .hex-0281)');
            }
        } elseif ($updateType === 'm24software') {
            // Must be exactly .m24iec (case insensitive)
            if (!preg_match('/\.m24iec$/i', $filenameLower)) {
                throw new Exception('Extension invalide pour le software. Attendu: .M24IEC');
            }
        } elseif ($updateType === 'displaygraphics') {
            // Must start with .dat (anything after is OK: .dat, .datECRAN10, .dat-ECRAN10, etc.)
            if (!preg_match('/\.dat[^.]*$/i', $filenameLower)) {
                throw new Exception('Extension invalide pour le display. Attendu: .dat, .datXXXX ou .dat-XXXX (exemple: .dat-ECRAN10)');
            }
        } else {
            throw new Exception('Type de mise à jour inconnu : ' . $updateType);
        }

        log::add('fidelixUpdater', 'debug', 'Validation réussie pour ' . $filename . ' (type: ' . $updateType . ')');
        ajax::success(array('valid' => true, 'message' => 'Fichier valide'));
    }

    // ========================================
    // ACTION: startUpdate
    // ========================================
    if (init('action') == 'startUpdate') {
        // Sync processes with status files first
        fidelixUpdater::syncActiveProcesses();

        $address = (int)init('address');
        $subaddress = init('subaddress') ? (int)init('subaddress') : null;
        $connectionType = init('connectionType', 'rtu'); // 'rtu' or 'tcp'
        $port = init('port');
        $baudRate = (int)init('baudRate', 19200);
        $tcpHost = init('tcpHost');
        $tcpPort = (int)init('tcpPort', 4196);
        $filename = init('filename');
        $method = init('method');

        // TCP mode includes both 'tcp' (Modbus TCP) and 'tcp-transparent' (raw RTU over TCP)
        $isTCP = ($connectionType === 'tcp' || $connectionType === 'tcp-transparent');

        // Transparent mode: either explicitly set or automatically enabled for 'tcp-transparent' connectionType
        $transparentMode = init('transparentMode') === 'true' || init('transparentMode') === true || init('transparentMode') === '1';
        if ($connectionType === 'tcp-transparent') {
            $transparentMode = true; // Force transparent mode for tcp-transparent connection type
        }

        // Capture Jeedom username
        $username = 'system';
        if (isset($_SESSION['user']) && is_object($_SESSION['user'])) {
            try {
                $username = $_SESSION['user']->getLogin();
            } catch (Exception $e) {
                log::add('fidelixUpdater', 'debug', 'Unable to get username: ' . $e->getMessage());
            }
        }

        if (empty($address) || $address < 1 || $address > 247) {
            throw new Exception('Adresse device invalide (doit être entre 1 et 247) : ' . $address);
        }

        if ($subaddress !== null && ($subaddress < 1 || $subaddress > 247)) {
            throw new Exception('Sous-adresse invalide (doit être entre 1 et 247) : ' . $subaddress);
        }

        // Validate connection parameters based on connection type
        if ($isTCP) {
            // TCP mode: validate host and port
            if (empty($tcpHost)) {
                throw new Exception('Adresse IP du convertisseur TCP non spécifiée');
            }
            if (!filter_var($tcpHost, FILTER_VALIDATE_IP)) {
                throw new Exception('Adresse IP invalide : ' . $tcpHost);
            }
            if ($tcpPort < 1 || $tcpPort > 65535) {
                throw new Exception('Port TCP invalide (doit être entre 1 et 65535) : ' . $tcpPort);
            }
        } else {
            // RTU mode: validate serial port
            if (empty($port)) {
                throw new Exception('Port série non spécifié');
            }

            // Check if THIS specific port is locked
            if (fidelixUpdater::isPortLocked($port)) {
                throw new Exception('Un processus de mise à jour est déjà en cours sur ce port série (' . basename($port) . '). Veuillez patienter ou utiliser un autre port.');
            }
        }

        if (empty($filename)) {
            throw new Exception('Nom de fichier non spécifié');
        }

        if (!in_array($method, array('m24firmware', 'm24software', 'displayfirmware', 'displaygraphics'))) {
            throw new Exception('Méthode invalide (doit être m24firmware, m24software, displayfirmware ou displaygraphics) : ' . $method);
        }

        // Build full path to the firmware/software file
        $filePath = fidelixUpdater::getDataPath('filetransfer') . '/' . basename($filename);
        if (!file_exists($filePath)) {
            log::add('fidelixUpdater', 'error', 'Fichier non trouvé à l\'emplacement : ' . $filePath);
            throw new Exception('Fichier non trouvé : ' . $filename . ' (recherché dans ' . $filePath . ')');
        }

        // Ensure status directory exists
        fidelixUpdater::ensureDirectory(fidelixUpdater::getDataPath('status'));

        $updateId = uniqid('update_', true);
        $statusFile = fidelixUpdater::getDataPath('status') . '/status_' . $updateId . '.json';
        $scriptPath = fidelixUpdater::getDataPath() . '/update_' . $updateId . '.js';

        // Build log message based on connection type
        $logMsg = 'Démarrage mise à jour par ' . $username . ' - UpdateID: ' . $updateId . ', Address: ' . $address;
        if ($subaddress !== null) {
            $logMsg .= ', Subaddress: ' . $subaddress . ' (pass-through mode)';
        }
        if ($isTCP) {
            $logMsg .= ', Connection: TCP, Host: ' . $tcpHost . ':' . $tcpPort;
        } else {
            $logMsg .= ', Connection: RTU, Port: ' . $port . ', BaudRate: ' . $baudRate;
        }
        $logMsg .= ', Method: ' . $method . ', File: ' . $filePath;
        log::add('fidelixUpdater', 'info', $logMsg);

        // Stop Modbus daemon if needed (only for RTU mode)
        $modbusStatus = array('stopped' => false, 'reason' => 'TCP mode - no daemon management needed');
        if (!$isTCP) {
            log::add('fidelixUpdater', 'debug', 'Port value received from frontend: "' . $port . '"');
            $autoStopModbus = config::byKey('auto_stop_modbus', 'fidelixUpdater', 1);
            log::add('fidelixUpdater', 'debug', 'Auto stop Modbus config: ' . ($autoStopModbus ? 'enabled' : 'disabled'));
            $modbusStatus = fidelixUpdater::stopModbusDaemonIfNeeded($port);
            if ($modbusStatus['stopped']) {
                log::add('fidelixUpdater', 'info', 'Modbus daemon stopped successfully');
            } else if (isset($modbusStatus['reason'])) {
                log::add('fidelixUpdater', 'debug', 'Modbus daemon not stopped: ' . $modbusStatus['reason']);
            }
        }

        // Initialize status file
        $initialStatus = array(
            'phase' => 'Starting',
            'status' => 'Initializing update...',
            'progress' => 0,
            'timestamp' => date('c'),
            'error' => null,
            'connectionType' => $connectionType,
            'modbusStatus' => $modbusStatus,
            'modbusRestarted' => false
        );
        file_put_contents($statusFile, json_encode($initialStatus, JSON_PRETTY_PRINT));

        // Generate Node.js script (CRITICAL: address as INTEGER, not string!)
        // CRITICAL: Pass FULL absolute path to file, not just filename!
        $subaddressLine = $subaddress !== null ? "    subaddress: {$subaddress}," : "";

        // Build connection options based on type
        // Debug: log received parameters
        file_put_contents(fidelixUpdater::getDataPath('logs') . '/debug_params.log',
            "connectionType: $connectionType\n" .
            "isTCP: " . ($isTCP ? 'true' : 'false') . "\n" .
            "transparentMode (raw): " . var_export(init('transparentMode'), true) . "\n" .
            "transparentMode (bool): " . ($transparentMode ? 'true' : 'false') . "\n"
        );

        if ($isTCP) {
            $transparentModeJs = $transparentMode ? 'true' : 'false';
            $connectionOptionsJs = "    connectionType: 'tcp',\n" .
                                   "    host: '{$tcpHost}',\n" .
                                   "    tcpPort: {$tcpPort},\n" .
                                   "    transparentMode: {$transparentModeJs},";
        } else {
            $connectionOptionsJs = "    connectionType: 'rtu',\n" .
                                   "    port: '{$port}',\n" .
                                   "    baudRate: {$baudRate},";
        }

        log::add('fidelixUpdater', 'debug', 'Generating Node.js script with file path: ' . $filePath);

        $jsCode = <<<JSCODE
// Set process title for identification and security
process.title = 'fidelixUpdater_{$updateId}';

const fs = require('fs');
const fxM24Update = require('../3rdparty/Fidelix/FxLib/FxM24Update.js');
const multi24Update = new fxM24Update();

// Handle uncaught exceptions to prevent silent crashes
process.on('uncaughtException', (err) => {
    // Log technical details for developers (goes to logsJeedom.txt and stderr)
    console.error('UNCAUGHT EXCEPTION:', err.message);
    console.error('Stack:', err.stack);

    // Write simple user-friendly error to status file (no stack trace)
    try {
        const status = {
            phase: 'Error',
            status: 'Une erreur inattendue est survenue',
            progress: 0,
            timestamp: new Date().toISOString(),
            error: 'La mise à jour a échoué. Vérifiez les logs ou contactez le support technique.'
        };
        fs.writeFileSync('{$statusFile}', JSON.stringify(status, null, 2));
    } catch (writeErr) {
        console.error('Failed to write error to status file:', writeErr);
    }

    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    // Log technical details for developers (goes to logsJeedom.txt and stderr)
    console.error('UNHANDLED REJECTION:', reason);
    console.error('Promise:', promise);

    // Write simple user-friendly error to status file
    try {
        const status = {
            phase: 'Error',
            status: 'Une erreur inattendue est survenue',
            progress: 0,
            timestamp: new Date().toISOString(),
            error: 'La mise à jour a échoué. Vérifiez les logs ou contactez le support technique.'
        };
        fs.writeFileSync('{$statusFile}', JSON.stringify(status, null, 2));
    } catch (writeErr) {
        console.error('Failed to write error to status file:', writeErr);
    }

    process.exit(1);
});

// Log process start (technical details for logs only)
console.log('[fidelixUpdater] Process started - PID:', process.pid, '| Update ID:', '{$updateId}');

const options = {
    address: {$address},
{$subaddressLine}
    type: '{$method}',
{$connectionOptionsJs}
    statusFile: '{$statusFile}'
};

// Function to notify PHP of completion and restart Modbus daemon
function notifyPhpComplete() {
    const { exec } = require('child_process');
    const phpScript = __dirname + '/../core/php/restartModbusDaemon.php';
    const cmd = 'php ' + phpScript + ' {$updateId}';

    console.log('[fidelixUpdater] Calling PHP to restart Modbus daemon...');

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error('[fidelixUpdater] Failed to call restart daemon script:', error.message);
            if (stderr) console.error('[fidelixUpdater] stderr:', stderr);
        } else {
            console.log('[fidelixUpdater] Daemon restart script called successfully');
            if (stdout) console.log('[fidelixUpdater] stdout:', stdout);
        }
    });
}

// IMPORTANT: Using FULL ABSOLUTE path to firmware/software file
multi24Update.update('{$filePath}', options)
    .then(() => {
        console.log('Update succeeded');
        notifyPhpComplete();
        setTimeout(() => process.exit(0), 2000);  // 2s delay to let PHP script finish
    })
    .catch((err) => {
        console.error('Update failed: ' + err);
        notifyPhpComplete();  // Also notify on failure
        setTimeout(() => process.exit(1), 2000);
    });
JSCODE;

        file_put_contents($scriptPath, $jsCode);

        // Log generated script for debugging
        log::add('fidelixUpdater', 'debug', 'Generated Node.js script content:');
        log::add('fidelixUpdater', 'debug', '--- START SCRIPT ---');
        log::add('fidelixUpdater', 'debug', $jsCode);
        log::add('fidelixUpdater', 'debug', '--- END SCRIPT ---');

        // Ensure logs directory exists
        fidelixUpdater::ensureDirectory(fidelixUpdater::getDataPath('logs'));

        // Create stderr log file to capture Node.js errors
        $stderrLog = fidelixUpdater::getDataPath('logs') . '/nodejs_' . $updateId . '.log';
        log::add('fidelixUpdater', 'debug', 'Node.js stderr will be captured in: ' . $stderrLog);

        // Launch Node.js in BACKGROUND and capture PID
        // IMPORTANT: Redirect stderr to log file instead of /dev/null to capture crashes
        $cmd = system::getCmdSudo() . " /usr/bin/node " . escapeshellarg($scriptPath) . " > /dev/null 2> " . escapeshellarg($stderrLog) . " & echo $!";
        $pid = (int)trim(exec($cmd));

        log::add('fidelixUpdater', 'debug', 'Processus Node.js lancé en arrière-plan - PID: ' . $pid);

        // Node.js console log path (shared by all processes)
        $nodejsLog = fidelixUpdater::getPluginPath() . '/3rdparty/Fidelix/FxLib/logsJeedom.txt';

        // Register process in registry with log file paths
        $processInfo = array(
            'updateId' => $updateId,
            'pid' => $pid,
            'connectionType' => $connectionType,
            'address' => $address,
            'subaddress' => $subaddress,
            'type' => $method,
            'filename' => basename($filename),
            'username' => $username,
            'nodejsLog' => $nodejsLog,
            'stderrLog' => $stderrLog
        );

        // Add connection-specific fields
        if ($isTCP) {
            $processInfo['tcpHost'] = $tcpHost;
            $processInfo['tcpPort'] = $tcpPort;
        } else {
            $processInfo['port'] = $port;
        }

        fidelixUpdater::registerProcess($processInfo);

        // Return IMMEDIATELY with updateId and statusFile name
        ajax::success(array(
            'updateId' => $updateId,
            'statusFile' => 'status_' . $updateId . '.json'
        ));
    }

    // ========================================
    // ACTION: getStatus
    // ========================================
    if (init('action') == 'getStatus') {
        $statusFile = init('statusFile');
        $updateId = init('updateId');

        if (empty($statusFile)) {
            throw new Exception('statusFile non spécifié');
        }

        // Sanitize filename to prevent path traversal
        $statusFile = basename($statusFile);
        $statusPath = fidelixUpdater::getDataPath('status') . '/' . $statusFile;

        if (!file_exists($statusPath)) {
            log::add('fidelixUpdater', 'error', 'Fichier status non trouvé à l\'emplacement : ' . $statusPath);
            throw new Exception('Fichier status non trouvé : ' . $statusFile);
        }

        $status = json_decode(file_get_contents($statusPath), true);

        if ($status === null) {
            throw new Exception('Fichier status invalide (JSON malformé)');
        }

        // Check if process is still alive (if updateId provided)
        $pidExists = null;
        $pid = null;
        if (!empty($updateId)) {
            // Get process info from registry to check PID BEFORE updating status
            $activeProcesses = fidelixUpdater::getActiveProcesses();
            foreach ($activeProcesses as $process) {
                if ($process['updateId'] === $updateId) {
                    $pid = isset($process['pid']) ? $process['pid'] : null;
                    $pidExists = isset($process['pidExists']) ? $process['pidExists'] : null;
                    break;
                }
            }

            // If PID is dead and progress < 100 and no error yet, mark as crashed
            if ($pidExists === false && $status['progress'] < 100 && empty($status['error'])) {
                // Try to read stderr log file to get more info about the crash (for debugging)
                $stderrLog = fidelixUpdater::getDataPath('logs') . '/nodejs_' . $updateId . '.log';
                $stderrContent = '';

                if (file_exists($stderrLog)) {
                    $stderrContent = file_get_contents($stderrLog);
                    if (!empty(trim($stderrContent))) {
                        // Log stderr content for developers/debugging, but don't show to user
                        log::add('fidelixUpdater', 'error', "Process {$updateId} stderr output: " . $stderrContent);
                    }
                }

                // Simple user-friendly error message (no technical details)
                $errorMsg = 'Le processus de mise à jour s\'est arrêté de manière inattendue. Vérifiez que le module est bien connecté, alimenté et que le port série est correct.';

                $status['error'] = $errorMsg;
                $status['phase'] = 'Error';

                // Update status file
                file_put_contents($statusPath, json_encode($status, JSON_PRETTY_PRINT));

                log::add('fidelixUpdater', 'error', "Process {$updateId} (PID: {$pid}) died unexpectedly at {$status['progress']}%");
            }

            // Update process registry with current status (after potential error detection)
            fidelixUpdater::updateProcessStatus($updateId, $status);
        }

        // Add PID info to response
        $status['pidExists'] = $pidExists;
        $status['pid'] = $pid;

        ajax::success($status);
    }

    // ========================================
    // ACTION: cleanupUpdate
    // ========================================
    if (init('action') == 'cleanupUpdate') {
        $updateId = init('updateId');

        if (empty($updateId)) {
            throw new Exception('updateId non spécifié');
        }

        // Sanitize updateId
        $updateId = preg_replace('/[^a-zA-Z0-9._-]/', '', $updateId);

        $statusFile = fidelixUpdater::getDataPath('status') . '/status_' . $updateId . '.json';
        $scriptFile = fidelixUpdater::getDataPath() . '/update_' . $updateId . '.js';
        // Note: We keep stderr logs for historical processes (they will be cleaned by cron after 7 days)
        // Note: Modbus daemon restart is now handled by Node.js callback (restartModbusDaemon.php) and cron5 fallback

        $deleted = array();

        if (file_exists($statusFile)) {
            @unlink($statusFile);
            $deleted[] = 'status_' . $updateId . '.json';
        }

        if (file_exists($scriptFile)) {
            @unlink($scriptFile);
            $deleted[] = 'update_' . $updateId . '.js';
        }

        log::add('fidelixUpdater', 'debug', 'Cleanup effectué pour updateId: ' . $updateId . ' - Fichiers supprimés: ' . implode(', ', $deleted) . ' (logs conservés pour historique)');

        ajax::success(array('deleted' => $deleted));
    }

    // ========================================
    // ACTION: getProcesses
    // ========================================
    if (init('action') == 'getProcesses') {
        // Sync all running processes with their status files first
        fidelixUpdater::syncActiveProcesses();

        $active = fidelixUpdater::getActiveProcesses();
        $history = fidelixUpdater::getProcessHistory(50);

        ajax::success(array(
            'active' => $active,
            'history' => $history
        ));
    }

    // ========================================
    // ACTION: killProcess
    // ========================================
    if (init('action') == 'killProcess') {
        $updateId = init('updateId');

        if (empty($updateId)) {
            throw new Exception('updateId non spécifié');
        }

        // Sanitize updateId
        $updateId = preg_replace('/[^a-zA-Z0-9._-]/', '', $updateId);

        // Kill the process
        fidelixUpdater::killProcess($updateId);

        ajax::success('Process killed successfully');
    }

    // ========================================
    // ACTION: testConnection
    // ========================================
    if (init('action') == 'testConnection') {
        // Sync processes with status files first
        fidelixUpdater::syncActiveProcesses();

        $connectionType = init('connectionType', 'rtu'); // 'rtu' or 'tcp'
        $port = init('port');
        $address = (int)init('address');
        $baudRate = (int)init('baudRate', 19200);
        $tcpHost = init('tcpHost');
        $tcpPort = (int)init('tcpPort', 4196);

        // TCP mode includes both 'tcp' (Modbus TCP) and 'tcp-transparent' (raw RTU over TCP)
        $isTCP = ($connectionType === 'tcp' || $connectionType === 'tcp-transparent');
        $isTransparentMode = ($connectionType === 'tcp-transparent');

        if (empty($address) || $address < 1 || $address > 247) {
            throw new Exception('Adresse invalide (doit être entre 1 et 247) : ' . $address);
        }

        // Check Node.js installation
        $nodejs = fidelixUpdaterHelper::checkNodeJs();
        $nodeInstalled = $nodejs['installed'];
        $nodeVersion = $nodejs['version'];

        // Build base diagnostics
        $diagnostics = array(
            'nodejs' => array(
                'installed' => $nodeInstalled,
                'version' => trim($nodeVersion)
            ),
            'connectionType' => $connectionType
        );

        // If Node.js not installed, return early
        if (!$nodeInstalled) {
            ajax::success(array(
                'success' => false,
                'error' => 'Node.js n\'est pas installé sur le système',
                'diagnostics' => $diagnostics,
                'moduleInfo' => null
            ));
            return;
        }

        // TCP-specific validation and diagnostics
        if ($isTCP) {
            if (empty($tcpHost)) {
                throw new Exception('Adresse IP du convertisseur TCP non spécifiée');
            }
            if (!filter_var($tcpHost, FILTER_VALIDATE_IP)) {
                throw new Exception('Adresse IP invalide : ' . $tcpHost);
            }
            if ($tcpPort < 1 || $tcpPort > 65535) {
                throw new Exception('Port TCP invalide (doit être entre 1 et 65535) : ' . $tcpPort);
            }

            log::add('fidelixUpdater', 'info', 'Test de connexion TCP - Host: ' . $tcpHost . ':' . $tcpPort . ', Address: ' . $address);

            $diagnostics['tcp'] = array(
                'host' => $tcpHost,
                'port' => $tcpPort
            );

            // Generate unique test ID
            $testId = uniqid('test_', true);
            $resultFile = fidelixUpdater::getDataPath() . '/test_result_' . $testId . '.json';
            $scriptPath = fidelixUpdater::getPluginPath() . '/3rdparty/Fidelix/FxLib/testConnectionTCP.js';

            // Run TCP test script (synchronous - wait for result)
            // 5th argument: transparent mode (true/false)
            $transparentModeArg = $isTransparentMode ? 'true' : 'false';
            $cmd = system::getCmdSudo() . " /usr/bin/node " . escapeshellarg($scriptPath) . " " .
                   escapeshellarg($tcpHost) . " " .
                   escapeshellarg($tcpPort) . " " .
                   escapeshellarg($address) . " " .
                   escapeshellarg($resultFile) . " " .
                   escapeshellarg($transparentModeArg) . " 2>&1";

            $output = array();
            $returnCode = 0;
            exec($cmd, $output, $returnCode);

            log::add('fidelixUpdater', 'debug', 'TCP test command executed - Return code: ' . $returnCode);

        } else {
            // RTU-specific validation and diagnostics
            if (empty($port)) {
                throw new Exception('Port série non spécifié');
            }

            // Check if THIS specific port is locked
            if (fidelixUpdater::isPortLocked($port)) {
                throw new Exception('Un processus de mise à jour est déjà en cours sur ce port série (' . basename($port) . '). Veuillez patienter avant de tester la connexion.');
            }

            log::add('fidelixUpdater', 'info', 'Test de connexion RTU - Port: ' . $port . ', Address: ' . $address . ', BaudRate: ' . $baudRate);

            // Check port permissions (Unix-level only, no I/O test)
            $portPermissions = fidelixUpdaterHelper::checkPortPermissions($port);

            // Check if www-data is in dialout group
            $dialout = fidelixUpdaterHelper::checkDialoutGroup();
            $hasDialoutPermission = $dialout['inDialout'];
            $groups = $dialout['groups'];

            $diagnostics['port'] = array(
                'path' => $port,
                'exists' => $portPermissions['exists'],
                'readable' => $portPermissions['readable'],
                'writable' => $portPermissions['writable'],
                'checkMethod' => $portPermissions['reason']
            );
            $diagnostics['permissions'] = array(
                'wwwDataInDialout' => $hasDialoutPermission,
                'groups' => trim($groups)
            );

            if (!$portPermissions['exists']) {
                ajax::success(array(
                    'success' => false,
                    'error' => 'Le port série n\'existe pas : ' . $port,
                    'diagnostics' => $diagnostics,
                    'moduleInfo' => null
                ));
                return;
            }

            // If permissions are not OK, return early with clear error message
            if (!$portPermissions['readable'] || !$portPermissions['writable']) {
                ajax::success(array(
                    'success' => false,
                    'error' => 'Permissions insuffisantes sur le port série. L\'utilisateur www-data doit être dans le groupe dialout.',
                    'diagnostics' => $diagnostics,
                    'moduleInfo' => null
                ));
                return;
            }

            // Generate unique test ID
            $testId = uniqid('test_', true);
            $resultFile = fidelixUpdater::getDataPath() . '/test_result_' . $testId . '.json';
            $scriptPath = fidelixUpdater::getPluginPath() . '/3rdparty/Fidelix/FxLib/testConnection.js';

            // Stop Modbus daemon if needed before testing (only for RTU)
            $autoStopModbus = config::byKey('auto_stop_modbus', 'fidelixUpdater', 1);
            log::add('fidelixUpdater', 'debug', 'Auto stop Modbus config: ' . ($autoStopModbus ? 'enabled' : 'disabled'));
            $modbusStatus = fidelixUpdater::stopModbusDaemonIfNeeded($port);
            if ($modbusStatus['stopped']) {
                log::add('fidelixUpdater', 'info', 'Modbus daemon stopped for connection test');
            } else if (isset($modbusStatus['reason'])) {
                log::add('fidelixUpdater', 'debug', 'Modbus daemon not stopped for test: ' . $modbusStatus['reason']);
            }

            // Run RTU test script (synchronous - wait for result)
            $cmd = system::getCmdSudo() . " /usr/bin/node " . escapeshellarg($scriptPath) . " " .
                   escapeshellarg($port) . " " .
                   escapeshellarg($address) . " " .
                   escapeshellarg($baudRate) . " " .
                   escapeshellarg($resultFile) . " 2>&1";

            $output = array();
            $returnCode = 0;
            exec($cmd, $output, $returnCode);

            log::add('fidelixUpdater', 'debug', 'RTU test command executed - Return code: ' . $returnCode);

            // Restart Modbus daemon if it was stopped
            fidelixUpdater::restartModbusDaemonIfNeeded($modbusStatus);
        }

        // Read result file
        if (file_exists($resultFile)) {
            $testResult = json_decode(file_get_contents($resultFile), true);
            @unlink($resultFile); // Cleanup

            if ($testResult) {
                // Merge diagnostics
                $testResult['diagnostics'] = array_merge($diagnostics, $testResult['diagnostics']);

                ajax::success($testResult);
                return;
            }
        }

        // If we get here, test failed to produce a result
        ajax::success(array(
            'success' => false,
            'error' => 'Le test n\'a pas pu être exécuté. Vérifiez les logs.',
            'diagnostics' => $diagnostics,
            'moduleInfo' => null,
            'output' => implode("\n", $output)
        ));
    }

    // ========================================
    // ACTION: fixPermissions
    // ========================================
    if (init('action') == 'fixPermissions') {
        log::add('fidelixUpdater', 'info', 'Reconfiguration des permissions demandée');

        $fixScript = fidelixUpdater::getPluginPath() . '/resources/fix-permissions.sh';

        if (!file_exists($fixScript)) {
            log::add('fidelixUpdater', 'error', 'Script de correction non trouvé à l\'emplacement : ' . $fixScript);
            throw new Exception('Script de correction non trouvé : ' . $fixScript);
        }

        // Execute fix script
        $cmd = system::getCmdSudo() . " bash " . escapeshellarg($fixScript) . " 2>&1";
        $output = array();
        $returnCode = 0;

        exec($cmd, $output, $returnCode);

        $result = array(
            'success' => ($returnCode === 0),
            'returnCode' => $returnCode,
            'output' => implode("\n", $output)
        );

        if ($returnCode === 0) {
            log::add('fidelixUpdater', 'info', 'Reconfiguration réussie');
        } else {
            log::add('fidelixUpdater', 'error', 'Échec de la reconfiguration - Code: ' . $returnCode);
            log::add('fidelixUpdater', 'debug', 'Output: ' . implode("\n", $output));
            $result['error'] = 'La reconfiguration a échoué (code: ' . $returnCode . ')';
        }

        ajax::success($result);
    }

    // ========================================
    // ACTION: getLogs
    // ========================================
    if (init('action') == 'getLogs') {
        $updateId = init('updateId');

        if (empty($updateId)) {
            throw new Exception('updateId non spécifié');
        }

        // Sanitize updateId
        $updateId = preg_replace('/[^a-zA-Z0-9._-]/', '', $updateId);

        // Get process from registry to find log file paths
        $registry = fidelixUpdater::loadProcessesRegistry();
        $process = null;

        foreach ($registry['processes'] as $p) {
            if ($p['updateId'] === $updateId) {
                $process = $p;
                break;
            }
        }

        if (!$process) {
            throw new Exception('Processus non trouvé : ' . $updateId);
        }

        $logs = array(
            'nodejs' => '',
            'stderr' => '',
            'jeedom' => ''
        );

        // Read Node.js console log (logsJeedom.txt - shared file, may contain other processes)
        if (isset($process['logFiles']['nodejs']) && file_exists($process['logFiles']['nodejs'])) {
            $nodejsContent = file_get_contents($process['logFiles']['nodejs']);
            // Try to extract only logs for this process (lines between process start and end)
            $logs['nodejs'] = $nodejsContent; // For now, show full file (TODO: filter by updateId)
        }

        // Read stderr log (specific to this process)
        if (isset($process['logFiles']['stderr']) && file_exists($process['logFiles']['stderr'])) {
            $logs['stderr'] = file_get_contents($process['logFiles']['stderr']);
        }

        // Get Jeedom logs for this process (filter by updateId)
        $jeedomLogFile = __DIR__ . '/../../../../log/fidelixUpdater';
        if (file_exists($jeedomLogFile)) {
            $jeedomContent = file_get_contents($jeedomLogFile);
            $lines = explode("\n", $jeedomContent);
            $filteredLines = array();
            foreach ($lines as $line) {
                // Keep lines that mention this updateId
                if (strpos($line, $updateId) !== false) {
                    $filteredLines[] = $line;
                }
            }
            $logs['jeedom'] = implode("\n", $filteredLines);
        }

        ajax::success(array(
            'process' => $process,
            'logs' => $logs
        ));
    }

    throw new Exception(__('Aucune méthode correspondante à', __FILE__) . ' : ' . init('action'));

} catch (Exception $e) {
    ajax::error(displayException($e), $e->getCode());
}
