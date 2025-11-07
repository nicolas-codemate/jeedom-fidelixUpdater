<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jeedom is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
 */

require_once dirname(__FILE__) . '/../../../../core/php/core.inc.php';

class fidelixUpdater extends eqLogic {
    /*     * *************************Attributs****************************** */

    /*     * ***********************Methodes statiques*************************** */

    /**
     * Check if dependencies are installed and up to date
     *
     * @return array Status information about dependencies
     */
    public static function dependancy_info() {
        $return = array();
        $return['log'] = 'fidelixUpdater_dep';
        $return['progress_file'] = jeedom::getTmpFolder('fidelixUpdater') . '/dependancy';
        $return['state'] = 'ok';

        // Check if NodeJS is installed
        exec('which node 2>&1', $output, $returnCode);
        if ($returnCode !== 0) {
            $return['state'] = 'nok';
            log::add('fidelixUpdater', 'debug', 'NodeJS not found');
            return $return;
        }

        // Check NodeJS version
        exec('node -v 2>&1', $nodeVersion, $returnCode);
        if ($returnCode !== 0 || empty($nodeVersion)) {
            $return['state'] = 'nok';
            log::add('fidelixUpdater', 'debug', 'Unable to get NodeJS version');
            return $return;
        }

        $version = trim($nodeVersion[0]);
        log::add('fidelixUpdater', 'debug', 'Found NodeJS version: ' . $version);

        // Check if version is >= v20
        if (version_compare($version, 'v20', '<')) {
            $return['state'] = 'nok';
            log::add('fidelixUpdater', 'debug', 'NodeJS version too old (need v20+, found ' . $version . ')');
            return $return;
        }

        log::add('fidelixUpdater', 'debug', 'Dependencies check: OK');
        return $return;
    }

    /**
     * Install plugin dependencies
     *
     * @return array Information about the installation script
     */
    public static function dependancy_install() {
        log::add('fidelixUpdater', 'info', 'Starting dependencies installation');

        $resourcePath = realpath(__DIR__ . '/../../resources');
        $progressFile = jeedom::getTmpFolder('fidelixUpdater') . '/dependancy';

        // Ensure tmp folder exists
        if (!file_exists(jeedom::getTmpFolder('fidelixUpdater'))) {
            mkdir(jeedom::getTmpFolder('fidelixUpdater'), 0755, true);
        }

        return array(
            'script' => $resourcePath . '/install_apt.sh',
            'log' => 'fidelixUpdater_dep'
        );
    }

    /**
     * Get path to processes registry file
     *
     * @return string Path to processes.json
     */
    private static function getProcessesFilePath() {
        $dataPath = __DIR__ . '/../../data';
        if (!file_exists($dataPath)) {
            mkdir($dataPath, 0755, true);
        }
        return $dataPath . '/processes.json';
    }

    /**
     * Load processes registry
     *
     * @return array Array of processes
     */
    private static function loadProcessesRegistry() {
        $filePath = self::getProcessesFilePath();

        if (!file_exists($filePath)) {
            return array('processes' => array());
        }

        $content = file_get_contents($filePath);
        $data = json_decode($content, true);

        return is_array($data) ? $data : array('processes' => array());
    }

    /**
     * Save processes registry
     *
     * @param array $data Registry data
     * @return bool Success status
     */
    private static function saveProcessesRegistry($data) {
        $filePath = self::getProcessesFilePath();
        return file_put_contents($filePath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) !== false;
    }

    /**
     * Register a new process in the registry
     *
     * @param array $processData Process information
     * @return bool Success status
     */
    public static function registerProcess($processData) {
        $registry = self::loadProcessesRegistry();

        $process = array(
            'updateId' => $processData['updateId'],
            'pid' => $processData['pid'],
            'port' => $processData['port'],
            'address' => $processData['address'],
            'subaddress' => isset($processData['subaddress']) ? $processData['subaddress'] : null,
            'type' => $processData['type'],
            'filename' => $processData['filename'],
            'status' => 'running',
            'phase' => 'Starting',
            'progress' => 0,
            'startTime' => date('c'),
            'lastUpdate' => date('c'),
            'endTime' => null,
            'error' => null
        );

        $registry['processes'][] = $process;

        // Cleanup old processes opportunistically
        self::cleanupOldProcesses();

        return self::saveProcessesRegistry($registry);
    }

    /**
     * Update process status from polling
     *
     * @param string $updateId Process update ID
     * @param array $statusData Status information from status file
     * @return bool Success status
     */
    public static function updateProcessStatus($updateId, $statusData) {
        $registry = self::loadProcessesRegistry();
        $found = false;

        foreach ($registry['processes'] as &$process) {
            if ($process['updateId'] === $updateId) {
                $process['phase'] = isset($statusData['phase']) ? $statusData['phase'] : $process['phase'];
                $process['progress'] = isset($statusData['progress']) ? (int)$statusData['progress'] : $process['progress'];
                $process['lastUpdate'] = date('c');

                // Update status based on progress and error
                if (isset($statusData['error']) && $statusData['error'] !== null) {
                    $process['status'] = 'failed';
                    $process['error'] = $statusData['error'];
                    $process['endTime'] = date('c');
                } elseif ($process['progress'] >= 100) {
                    $process['status'] = 'completed';
                    $process['endTime'] = date('c');
                }

                $found = true;
                break;
            }
        }

        if ($found) {
            return self::saveProcessesRegistry($registry);
        }

        return false;
    }

    /**
     * Get all active (running) processes
     *
     * @return array Array of running processes
     */
    public static function getActiveProcesses() {
        $registry = self::loadProcessesRegistry();
        $active = array();
        $now = time();

        foreach ($registry['processes'] as $process) {
            if ($process['status'] === 'running') {
                // Check if process is a zombie (no update for 5+ minutes)
                $lastUpdate = strtotime($process['lastUpdate']);
                $process['isZombie'] = ($now - $lastUpdate) > 300; // 5 minutes

                // Verify if PID still exists
                if (isset($process['pid']) && $process['pid'] > 0) {
                    $process['pidExists'] = posix_kill($process['pid'], 0);
                } else {
                    $process['pidExists'] = false;
                }

                $active[] = $process;
            }
        }

        return $active;
    }

    /**
     * Get process history (completed, failed, killed)
     *
     * @param int $limit Maximum number of entries to return
     * @return array Array of historical processes
     */
    public static function getProcessHistory($limit = 50) {
        $registry = self::loadProcessesRegistry();
        $history = array();

        foreach ($registry['processes'] as $process) {
            if ($process['status'] !== 'running') {
                $history[] = $process;
            }
        }

        // Sort by startTime descending (most recent first)
        usort($history, function($a, $b) {
            return strtotime($b['startTime']) - strtotime($a['startTime']);
        });

        // Limit results
        return array_slice($history, 0, $limit);
    }

    /**
     * Check if a serial port is currently locked by an active process
     *
     * @param string $port Serial port path
     * @return bool True if port is locked
     */
    public static function isPortLocked($port) {
        $active = self::getActiveProcesses();

        foreach ($active as $process) {
            if ($process['port'] === $port) {
                // Only consider it locked if PID still exists
                if (isset($process['pidExists']) && $process['pidExists']) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Cleanup old processes from registry (older than 1 week)
     *
     * @return int Number of processes removed
     */
    public static function cleanupOldProcesses() {
        $registry = self::loadProcessesRegistry();
        $oneWeekAgo = time() - (7 * 24 * 60 * 60); // 7 days
        $removed = 0;

        $filtered = array();
        foreach ($registry['processes'] as $process) {
            // Keep running processes
            if ($process['status'] === 'running') {
                $filtered[] = $process;
                continue;
            }

            // Remove processes older than 1 week
            if (isset($process['endTime'])) {
                $endTime = strtotime($process['endTime']);
                if ($endTime < $oneWeekAgo) {
                    $removed++;
                    continue;
                }
            }

            $filtered[] = $process;
        }

        // If still more than 50 entries, keep only the 50 most recent
        if (count($filtered) > 50) {
            usort($filtered, function($a, $b) {
                return strtotime($b['startTime']) - strtotime($a['startTime']);
            });
            $removed += count($filtered) - 50;
            $filtered = array_slice($filtered, 0, 50);
        }

        $registry['processes'] = $filtered;
        self::saveProcessesRegistry($registry);

        return $removed;
    }

    /**
     * Kill a process (SIGTERM then SIGKILL if needed)
     *
     * @param string $updateId Process update ID
     * @return bool Success status
     * @throws Exception If process not found or cannot be killed
     */
    public static function killProcess($updateId) {
        $registry = self::loadProcessesRegistry();
        $process = null;
        $processIndex = null;

        // Find the process
        foreach ($registry['processes'] as $index => $p) {
            if ($p['updateId'] === $updateId) {
                $process = $p;
                $processIndex = $index;
                break;
            }
        }

        if (!$process) {
            throw new Exception('Process not found');
        }

        if ($process['status'] !== 'running') {
            throw new Exception('Process is not running (status: ' . $process['status'] . ')');
        }

        $pid = isset($process['pid']) ? (int)$process['pid'] : 0;
        if ($pid <= 0) {
            throw new Exception('Invalid PID');
        }

        // Verify process exists and is ours
        if (!posix_kill($pid, 0)) {
            // Process doesn't exist, mark as killed anyway
            $registry['processes'][$processIndex]['status'] = 'killed';
            $registry['processes'][$processIndex]['endTime'] = date('c');
            self::saveProcessesRegistry($registry);

            // Cleanup temp files
            self::cleanupProcessFiles($updateId);

            throw new Exception('Process PID does not exist (already terminated?)');
        }

        // Verify process title contains fidelixUpdater for safety
        $cmdline = @file_get_contents("/proc/{$pid}/cmdline");
        if ($cmdline !== false && strpos($cmdline, 'fidelixUpdater') === false) {
            throw new Exception('Process does not appear to be a fidelixUpdater process (safety check)');
        }

        log::add('fidelixUpdater', 'info', "Killing process {$updateId} (PID: {$pid})");

        // Send SIGTERM (graceful)
        posix_kill($pid, SIGTERM);

        // Wait up to 5 seconds for process to terminate
        $waited = 0;
        while ($waited < 5) {
            usleep(500000); // 500ms
            $waited += 0.5;

            if (!posix_kill($pid, 0)) {
                // Process terminated
                log::add('fidelixUpdater', 'info', "Process {$updateId} terminated gracefully");
                break;
            }
        }

        // If still alive, send SIGKILL (forced)
        if (posix_kill($pid, 0)) {
            log::add('fidelixUpdater', 'warning', "Process {$updateId} did not terminate, sending SIGKILL");
            posix_kill($pid, SIGKILL);
            usleep(500000); // Wait 500ms more
        }

        // Update registry
        $registry['processes'][$processIndex]['status'] = 'killed';
        $registry['processes'][$processIndex]['endTime'] = date('c');
        self::saveProcessesRegistry($registry);

        // Cleanup temp files
        self::cleanupProcessFiles($updateId);

        log::add('fidelixUpdater', 'info', "Process {$updateId} killed successfully");

        return true;
    }

    /**
     * Cleanup temporary files for a process
     *
     * @param string $updateId Process update ID
     */
    private static function cleanupProcessFiles($updateId) {
        $statusFile = __DIR__ . '/../../data/status/status_' . $updateId . '.json';
        $scriptFile = __DIR__ . '/../../data/update_' . $updateId . '.js';

        @unlink($statusFile);
        @unlink($scriptFile);
    }

    /*     * *********************Méthodes d'instance************************* */

    public function preInsert() {
    }

    public function postInsert() {
    }

    public function preSave() {
    }

    public function postSave() {
    }

    public function preUpdate() {
    }

    public function postUpdate() {
    }

    public function preRemove() {
    }

    public function postRemove() {
    }

    /*     * **********************Getteur Setteur*************************** */
}

class fidelixUpdaterCmd extends cmd {
    /*     * *************************Attributs****************************** */

    /*     * ***********************Methodes statiques*************************** */

    /*     * *********************Méthodes d'instance************************* */

    public function execute($_options = array()) {
    }

    /*     * **********************Getteur Setteur*************************** */
}
