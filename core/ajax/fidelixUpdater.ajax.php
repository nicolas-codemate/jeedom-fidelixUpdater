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

    ajax::init(['uploadFirmware', 'uploadSoftware', 'startUpdate', 'getStatus', 'cleanupUpdate', 'getProcesses', 'killProcess', 'testConnection', 'fixPermissions']);

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

        $extension = strtolower(strrchr($_FILES['file']['name'], '.'));
        if (!in_array($extension, array('.hex'))) {
            throw new Exception('Extension du fichier non valide (autorisé .hex) : ' . $extension);
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

        $extension = strtolower(strrchr($_FILES['file']['name'], '.'));
        if (!in_array($extension, array('.m24iec'))) {
            throw new Exception('Extension du fichier non valide (autorisé .M24IEC) : ' . $extension);
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
    // ACTION: startUpdate
    // ========================================
    if (init('action') == 'startUpdate') {
        // Sync processes with status files first
        fidelixUpdater::syncActiveProcesses();

        $address = (int)init('address');
        $subaddress = init('subaddress') ? (int)init('subaddress') : null;
        $port = init('port');
        $baudRate = (int)init('baudRate', 19200);
        $filename = init('filename');
        $method = init('method');

        if (empty($address) || $address < 1 || $address > 247) {
            throw new Exception('Adresse device invalide (doit être entre 1 et 247) : ' . $address);
        }

        if ($subaddress !== null && ($subaddress < 1 || $subaddress > 247)) {
            throw new Exception('Sous-adresse invalide (doit être entre 1 et 247) : ' . $subaddress);
        }

        if (empty($port)) {
            throw new Exception('Port série non spécifié');
        }

        // Check if THIS specific port is locked
        if (fidelixUpdater::isPortLocked($port)) {
            throw new Exception('Un processus de mise à jour est déjà en cours sur ce port série (' . basename($port) . '). Veuillez patienter ou utiliser un autre port.');
        }

        if (empty($filename)) {
            throw new Exception('Nom de fichier non spécifié');
        }

        if (!in_array($method, array('m24firmware', 'm24software'))) {
            throw new Exception('Méthode invalide (doit être m24firmware ou m24software) : ' . $method);
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

        $logMsg = 'Démarrage mise à jour - UpdateID: ' . $updateId . ', Address: ' . $address;
        if ($subaddress !== null) {
            $logMsg .= ', Subaddress: ' . $subaddress . ' (pass-through mode)';
        }
        $logMsg .= ', BaudRate: ' . $baudRate . ', Method: ' . $method . ', File: ' . $filePath;
        log::add('fidelixUpdater', 'info', $logMsg);

        // Initialize status file
        $initialStatus = array(
            'phase' => 'Starting',
            'status' => 'Initializing update...',
            'progress' => 0,
            'timestamp' => date('c'),
            'error' => null
        );
        file_put_contents($statusFile, json_encode($initialStatus, JSON_PRETTY_PRINT));

        // Generate Node.js script (CRITICAL: address as INTEGER, not string!)
        // CRITICAL: Pass FULL absolute path to file, not just filename!
        $subaddressLine = $subaddress !== null ? "    subaddress: {$subaddress}," : "";

        log::add('fidelixUpdater', 'debug', 'Generating Node.js script with file path: ' . $filePath);

        $jsCode = <<<JSCODE
// Set process title for identification and security
process.title = 'fidelixUpdater_{$updateId}';

const fs = require('fs');
const fxM24Update = require('../3rdparty/Fidelix/FxLib/FxM24Update.js');
const multi24Update = new fxM24Update();

// Handle uncaught exceptions to prevent silent crashes
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err.message);
    console.error('Stack:', err.stack);

    // Write error to status file
    try {
        const status = {
            phase: 'Error',
            status: 'Uncaught exception: ' + err.message,
            progress: 0,
            timestamp: new Date().toISOString(),
            error: 'EXCEPTION: ' + err.message + '\\n\\nStack trace:\\n' + err.stack
        };
        fs.writeFileSync('{$statusFile}', JSON.stringify(status, null, 2));
    } catch (writeErr) {
        console.error('Failed to write error to status file:', writeErr);
    }

    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
    console.error('Promise:', promise);

    // Write error to status file
    try {
        const status = {
            phase: 'Error',
            status: 'Unhandled promise rejection',
            progress: 0,
            timestamp: new Date().toISOString(),
            error: 'PROMISE REJECTION: ' + (reason ? reason.toString() : 'Unknown reason')
        };
        fs.writeFileSync('{$statusFile}', JSON.stringify(status, null, 2));
    } catch (writeErr) {
        console.error('Failed to write error to status file:', writeErr);
    }

    process.exit(1);
});

// Log process start
console.log('Process started with PID:', process.pid);
console.log('Status file:', '{$statusFile}');
console.log('Update ID:', '{$updateId}');

const options = {
    address: {$address},
{$subaddressLine}
    type: '{$method}',
    port: '{$port}',
    baudRate: {$baudRate},
    statusFile: '{$statusFile}'
};

// IMPORTANT: Using FULL ABSOLUTE path to firmware/software file
multi24Update.update('{$filePath}', options)
    .then(() => {
        console.log('Update succeeded');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Update failed: ' + err);
        process.exit(1);
    });
JSCODE;

        file_put_contents($scriptPath, $jsCode);

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

        // Register process in registry
        fidelixUpdater::registerProcess(array(
            'updateId' => $updateId,
            'pid' => $pid,
            'port' => $port,
            'address' => $address,
            'subaddress' => $subaddress,
            'type' => $method,
            'filename' => basename($filename)
        ));

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
                // Try to read stderr log file to get more info about the crash
                $stderrLog = fidelixUpdater::getDataPath('logs') . '/nodejs_' . $updateId . '.log';
                $stderrContent = '';

                if (file_exists($stderrLog)) {
                    $stderrContent = file_get_contents($stderrLog);
                    if (!empty(trim($stderrContent))) {
                        log::add('fidelixUpdater', 'error', "Process {$updateId} stderr output: " . $stderrContent);
                    }
                }

                // Build error message with stderr content if available
                $errorMsg = 'Le processus de mise à jour s\'est arrêté de manière inattendue. Vérifiez que le module est bien connecté et alimenté.';
                if (!empty(trim($stderrContent))) {
                    $errorMsg .= "\n\nDétails techniques:\n" . trim($stderrContent);
                }

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
        $stderrLog = fidelixUpdater::getDataPath('logs') . '/nodejs_' . $updateId . '.log';

        $deleted = array();

        if (file_exists($statusFile)) {
            @unlink($statusFile);
            $deleted[] = 'status_' . $updateId . '.json';
        }

        if (file_exists($scriptFile)) {
            @unlink($scriptFile);
            $deleted[] = 'update_' . $updateId . '.js';
        }

        if (file_exists($stderrLog)) {
            @unlink($stderrLog);
            $deleted[] = 'nodejs_' . $updateId . '.log';
        }

        log::add('fidelixUpdater', 'debug', 'Cleanup effectué pour updateId: ' . $updateId . ' - Fichiers supprimés: ' . implode(', ', $deleted));

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

        $port = init('port');
        $address = (int)init('address');
        $baudRate = (int)init('baudRate', 19200);

        if (empty($port)) {
            throw new Exception('Port série non spécifié');
        }

        if (empty($address) || $address < 1 || $address > 247) {
            throw new Exception('Adresse invalide (doit être entre 1 et 247) : ' . $address);
        }

        // Check if THIS specific port is locked
        if (fidelixUpdater::isPortLocked($port)) {
            throw new Exception('Un processus de mise à jour est déjà en cours sur ce port série (' . basename($port) . '). Veuillez patienter avant de tester la connexion.');
        }

        log::add('fidelixUpdater', 'info', 'Test de connexion - Port: ' . $port . ', Address: ' . $address . ', BaudRate: ' . $baudRate);

        // Check Node.js installation
        $nodejs = fidelixUpdaterHelper::checkNodeJs();
        $nodeInstalled = $nodejs['installed'];
        $nodeVersion = $nodejs['version'];

        // Check port permissions (Unix-level only, no I/O test)
        $portPermissions = fidelixUpdaterHelper::checkPortPermissions($port);

        // Check if www-data is in dialout group
        $dialout = fidelixUpdaterHelper::checkDialoutGroup();
        $hasDialoutPermission = $dialout['inDialout'];
        $groups = $dialout['groups'];

        $diagnostics = array(
            'nodejs' => array(
                'installed' => $nodeInstalled,
                'version' => trim($nodeVersion)
            ),
            'port' => array(
                'path' => $port,
                'exists' => $portPermissions['exists'],
                'readable' => $portPermissions['readable'],
                'writable' => $portPermissions['writable'],
                'checkMethod' => $portPermissions['reason']
            ),
            'permissions' => array(
                'wwwDataInDialout' => $hasDialoutPermission,
                'groups' => trim($groups)
            )
        );

        // If basic checks fail, return early
        if (!$nodeInstalled) {
            ajax::success(array(
                'success' => false,
                'error' => 'Node.js n\'est pas installé sur le système',
                'diagnostics' => $diagnostics,
                'moduleInfo' => null
            ));
            return;
        }

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

        // Run test script (synchronous - wait for result)
        $cmd = system::getCmdSudo() . " /usr/bin/node " . escapeshellarg($scriptPath) . " " .
               escapeshellarg($port) . " " .
               escapeshellarg($address) . " " .
               escapeshellarg($baudRate) . " " .
               escapeshellarg($resultFile) . " 2>&1";

        $output = array();
        $returnCode = 0;
        exec($cmd, $output, $returnCode);

        log::add('fidelixUpdater', 'debug', 'Test command executed - Return code: ' . $returnCode);

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

    throw new Exception(__('Aucune méthode correspondante à', __FILE__) . ' : ' . init('action'));

} catch (Exception $e) {
    ajax::error(displayException($e), $e->getCode());
}
