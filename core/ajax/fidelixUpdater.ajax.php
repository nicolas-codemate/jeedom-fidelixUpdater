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

    ajax::init(['uploadFirmware', 'uploadSoftware', 'testConnection', 'fixPermissions']);

    // ========================================
    // ACTION: uploadFirmware
    // ========================================
    if (init('action') == 'uploadFirmware') {
        log::add('fidelixUpdater', 'debug', 'Upload firmware demandé');

        $uploaddir = __DIR__ . '/../../data/filetransfer';

        if (!file_exists($uploaddir)) {
            mkdir($uploaddir, 0775, true);
        }

        if (!file_exists($uploaddir)) {
            throw new Exception(__('Répertoire de téléversement non trouvé : ', __FILE__) . $uploaddir);
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

        $uploaddir = __DIR__ . '/../../data/filetransfer';

        if (!file_exists($uploaddir)) {
            mkdir($uploaddir, 0775, true);
        }

        if (!file_exists($uploaddir)) {
            throw new Exception(__('Répertoire de téléversement non trouvé : ', __FILE__) . $uploaddir);
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
        $address = (int)init('address');
        $subaddress = init('subaddress') ? (int)init('subaddress') : null;
        $port = init('port');
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

        if (empty($filename)) {
            throw new Exception('Nom de fichier non spécifié');
        }

        if (!in_array($method, array('m24firmware', 'm24software'))) {
            throw new Exception('Méthode invalide (doit être m24firmware ou m24software) : ' . $method);
        }

        $updateId = uniqid('update_', true);
        $statusFile = __DIR__ . '/../../data/status/status_' . $updateId . '.json';
        $scriptPath = __DIR__ . '/../../data/update_' . $updateId . '.js';

        $logMsg = 'Démarrage mise à jour - UpdateID: ' . $updateId . ', Address: ' . $address;
        if ($subaddress !== null) {
            $logMsg .= ', Subaddress: ' . $subaddress . ' (pass-through mode)';
        }
        $logMsg .= ', Method: ' . $method . ', File: ' . $filename;
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
        $subaddressLine = $subaddress !== null ? "    subaddress: {$subaddress}," : "";

        $jsCode = <<<JSCODE
const fxM24Update = require('../3rdparty/Fidelix/FxLib/FxM24Update.js');
const multi24Update = new fxM24Update();

const options = {
    address: {$address},
{$subaddressLine}
    type: '{$method}',
    port: '{$port}',
    baudRate: 57600,
    statusFile: '{$statusFile}'
};

multi24Update.update('{$filename}', options)
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

        // Launch Node.js in BACKGROUND (non-blocking) with '&'
        $cmd = "sudo /usr/bin/node " . escapeshellarg($scriptPath) . " > /dev/null 2>&1 &";
        exec($cmd);

        log::add('fidelixUpdater', 'debug', 'Processus Node.js lancé en arrière-plan');

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

        if (empty($statusFile)) {
            throw new Exception('statusFile non spécifié');
        }

        // Sanitize filename to prevent path traversal
        $statusFile = basename($statusFile);
        $statusPath = __DIR__ . '/../../data/status/' . $statusFile;

        if (!file_exists($statusPath)) {
            throw new Exception('Fichier status non trouvé : ' . $statusFile);
        }

        $status = json_decode(file_get_contents($statusPath), true);

        if ($status === null) {
            throw new Exception('Fichier status invalide (JSON malformé)');
        }

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

        $statusFile = __DIR__ . '/../../data/status/status_' . $updateId . '.json';
        $scriptFile = __DIR__ . '/../../data/update_' . $updateId . '.js';

        $deleted = array();

        if (file_exists($statusFile)) {
            @unlink($statusFile);
            $deleted[] = 'status_' . $updateId . '.json';
        }

        if (file_exists($scriptFile)) {
            @unlink($scriptFile);
            $deleted[] = 'update_' . $updateId . '.js';
        }

        log::add('fidelixUpdater', 'debug', 'Cleanup effectué pour updateId: ' . $updateId . ' - Fichiers supprimés: ' . implode(', ', $deleted));

        ajax::success(array('deleted' => $deleted));
    }

    // ========================================
    // ACTION: testConnection
    // ========================================
    if (init('action') == 'testConnection') {
        $port = init('port');
        $address = (int)init('address');

        if (empty($port)) {
            throw new Exception('Port série non spécifié');
        }

        if (empty($address) || $address < 1 || $address > 247) {
            throw new Exception('Adresse invalide (doit être entre 1 et 247) : ' . $address);
        }

        log::add('fidelixUpdater', 'info', 'Test de connexion - Port: ' . $port . ', Address: ' . $address);

        // Check Node.js installation
        $nodeVersion = shell_exec('node -v 2>&1');
        $nodeInstalled = !empty($nodeVersion) && strpos($nodeVersion, 'v') === 0;

        // Check port permissions
        $portPermissions = array(
            'exists' => file_exists($port),
            'readable' => is_readable($port),
            'writable' => is_writable($port)
        );

        // Check if www-data is in dialout group
        $groups = shell_exec('groups www-data 2>&1');
        $hasDialoutPermission = strpos($groups, 'dialout') !== false;

        $diagnostics = array(
            'nodejs' => array(
                'installed' => $nodeInstalled,
                'version' => trim($nodeVersion)
            ),
            'port' => array(
                'path' => $port,
                'exists' => $portPermissions['exists'],
                'readable' => $portPermissions['readable'],
                'writable' => $portPermissions['writable']
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

        // Generate unique test ID
        $testId = uniqid('test_', true);
        $resultFile = '/srv/plugins/fidelixUpdater/data/test_result_' . $testId . '.json';
        $scriptPath = '/srv/plugins/fidelixUpdater/3rdparty/Fidelix/FxLib/testConnection.js';

        // Run test script (synchronous - wait for result)
        $cmd = "sudo /usr/bin/node " . escapeshellarg($scriptPath) . " " .
               escapeshellarg($port) . " " .
               escapeshellarg($address) . " " .
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

        $fixScript = '/srv/plugins/fidelixUpdater/resources/fix-permissions.sh';

        if (!file_exists($fixScript)) {
            throw new Exception('Script de correction non trouvé : ' . $fixScript);
        }

        // Execute fix script
        $cmd = "sudo bash " . escapeshellarg($fixScript) . " 2>&1";
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
