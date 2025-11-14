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
     * Get absolute path to plugin directory
     *
     * @return string Absolute path to plugin root directory
     */
    public static function getPluginPath() {
        static $pluginPath = null;

        if ($pluginPath === null) {
            $pluginPath = realpath(__DIR__ . '/../..');
            if ($pluginPath === false) {
                throw new Exception('Cannot resolve plugin directory path');
            }
            log::add('fidelixUpdater', 'debug', 'Plugin path resolved to: ' . $pluginPath);
        }

        return $pluginPath;
    }

    /**
     * Get absolute path to data directory or subdirectory
     *
     * @param string $subdir Optional subdirectory name (e.g., 'filetransfer', 'status', 'logs')
     * @return string Absolute path to data directory
     */
    public static function getDataPath($subdir = '') {
        $path = self::getPluginPath() . '/data';

        if (!empty($subdir)) {
            $path .= '/' . trim($subdir, '/');
        }

        return $path;
    }

    /**
     * Ensure directory exists and is writable, create if necessary
     *
     * @param string $path Directory path to ensure
     * @param int $permissions Permissions to set (default: 0775)
     * @return string Resolved absolute path
     * @throws Exception If directory cannot be created or is not writable
     */
    public static function ensureDirectory($path, $permissions = 0775) {
        // Resolve to absolute path if not already
        if (!is_dir($path)) {
            // Try to resolve parent directory first
            $parent = dirname($path);
            if (is_dir($parent)) {
                $path = realpath($parent) . '/' . basename($path);
            }
        }

        // Create directory if it doesn't exist
        if (!file_exists($path)) {
            log::add('fidelixUpdater', 'debug', 'Creating directory: ' . $path);

            if (!mkdir($path, $permissions, true)) {
                $error = error_get_last();
                log::add('fidelixUpdater', 'error', 'Failed to create directory: ' . $path . ' - ' . ($error ? $error['message'] : 'Unknown error'));
                throw new Exception('Cannot create directory: ' . $path);
            }

            chmod($path, $permissions);
            log::add('fidelixUpdater', 'debug', 'Directory created successfully: ' . $path);
        }

        // Verify it's a directory
        if (!is_dir($path)) {
            log::add('fidelixUpdater', 'error', 'Path exists but is not a directory: ' . $path);
            throw new Exception('Path exists but is not a directory: ' . $path);
        }

        // Verify it's writable
        if (!is_writable($path)) {
            log::add('fidelixUpdater', 'warning', 'Directory is not writable, attempting chmod: ' . $path);
            chmod($path, $permissions);

            if (!is_writable($path)) {
                log::add('fidelixUpdater', 'error', 'Directory is not writable: ' . $path);
                throw new Exception('Directory is not writable: ' . $path);
            }
        }

        return realpath($path);
    }

    /**
     * Get path to processes registry file
     *
     * @return string Path to processes.json
     */
    private static function getProcessesFilePath() {
        $dataPath = self::getDataPath();
        self::ensureDirectory($dataPath);
        return $dataPath . '/processes.json';
    }

    /**
     * Load processes registry
     *
     * @return array Array of processes
     */
    public static function loadProcessesRegistry() {
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
            'error' => null,
            // Log file paths for debugging
            'logFiles' => array(
                'nodejs' => isset($processData['nodejsLog']) ? $processData['nodejsLog'] : null,
                'stderr' => isset($processData['stderrLog']) ? $processData['stderrLog'] : null
            )
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
     * Synchronize all running processes with their status files
     * This ensures processes.json is up-to-date even when modals are closed
     *
     * @return int Number of processes synchronized
     */
    public static function syncActiveProcesses() {
        $registry = self::loadProcessesRegistry();
        $synced = 0;

        foreach ($registry['processes'] as &$process) {
            if ($process['status'] === 'running') {
                $needsUpdate = false;

                // First, try to read the status file (always read it first!)
                $statusFile = self::getDataPath('status') . '/status_' . $process['updateId'] . '.json';
                $statusData = null;

                if (file_exists($statusFile)) {
                    $statusData = json_decode(file_get_contents($statusFile), true);

                    if ($statusData && is_array($statusData)) {
                        // Update process with latest status from file
                        $process['phase'] = isset($statusData['phase']) ? $statusData['phase'] : $process['phase'];
                        $process['progress'] = isset($statusData['progress']) ? (int)$statusData['progress'] : $process['progress'];
                        $process['lastUpdate'] = date('c');

                        // Check if process completed or failed according to status file
                        if (isset($statusData['error']) && $statusData['error'] !== null) {
                            $process['status'] = 'failed';
                            $process['error'] = $statusData['error'];
                            $process['endTime'] = date('c');
                            $needsUpdate = true;
                        } elseif ($process['progress'] >= 100) {
                            $process['status'] = 'completed';
                            $process['endTime'] = date('c');
                            $needsUpdate = true;
                        } else {
                            // Process still running, mark as updated
                            $needsUpdate = true;
                        }
                    }
                }

                // ONLY check PID if status file indicates process is still running (progress < 100 and no error)
                if ($process['status'] === 'running' && $process['progress'] < 100 && empty($process['error'])) {
                    $pid = isset($process['pid']) ? (int)$process['pid'] : 0;
                    $pidExists = ($pid > 0) ? posix_kill($pid, 0) : false;

                    // If PID is dead, check if status file was recently updated
                    if (!$pidExists) {
                        $lastUpdateTime = strtotime($process['lastUpdate']);
                        $timeSinceUpdate = time() - $lastUpdateTime;

                        // Only mark as crashed if no update for more than 30 seconds
                        if ($timeSinceUpdate > 30) {
                            $process['status'] = 'failed';
                            $process['error'] = 'Le processus de mise à jour s\'est arrêté de manière inattendue. Vérifiez que le module est bien connecté et alimenté.';
                            $process['phase'] = 'Error';
                            $process['endTime'] = date('c');
                            $needsUpdate = true;

                            log::add('fidelixUpdater', 'error', "Process {$process['updateId']} (PID: {$pid}) died unexpectedly at {$process['progress']}% (no update for {$timeSinceUpdate}s)");
                        }
                    }
                }

                if ($needsUpdate) {
                    $synced++;
                }
            }
        }

        if ($synced > 0) {
            self::saveProcessesRegistry($registry);
        }

        return $synced;
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
     * Cleanup temporary files (status, script, and uploaded files)
     * Removes files for processes that are no longer in the registry or are completed/failed
     *
     * @return array Number of files removed
     */
    public static function cleanupTempFiles() {
        $registry = self::loadProcessesRegistry();
        $removed = array('status' => 0, 'scripts' => 0, 'uploads' => 0, 'stderrlogs' => 0);

        // Get all active/running updateIds and their filenames
        $activeUpdateIds = array();
        $activeFilenames = array();
        foreach ($registry['processes'] as $process) {
            if ($process['status'] === 'running') {
                $activeUpdateIds[] = $process['updateId'];
                if (isset($process['filename'])) {
                    $activeFilenames[] = $process['filename'];
                }
            }
        }

        // Cleanup status files
        $statusDir = self::getDataPath('status');
        if (is_dir($statusDir)) {
            $statusFiles = scandir($statusDir);
            foreach ($statusFiles as $file) {
                if (strpos($file, 'status_update_') === 0 && strpos($file, '.json') !== false) {
                    $updateId = str_replace(array('status_', '.json'), '', $file);
                    if (!in_array($updateId, $activeUpdateIds)) {
                        @unlink($statusDir . '/' . $file);
                        $removed['status']++;
                    }
                }
            }
        }

        // Cleanup script files
        $dataDir = self::getDataPath();
        if (is_dir($dataDir)) {
            $scriptFiles = scandir($dataDir);
            foreach ($scriptFiles as $file) {
                if (strpos($file, 'update_update_') === 0 && strpos($file, '.js') !== false) {
                    $updateId = str_replace(array('update_', '.js'), '', $file);
                    if (!in_array($updateId, $activeUpdateIds)) {
                        @unlink($dataDir . '/' . $file);
                        $removed['scripts']++;
                    }
                }
            }
        }

        // Cleanup stderr log files (keep for 7 days for historical processes)
        $logsDir = self::getDataPath('logs');
        $oneWeekAgo = time() - (7 * 24 * 60 * 60); // 7 days
        if (is_dir($logsDir)) {
            $logFiles = scandir($logsDir);
            foreach ($logFiles as $file) {
                if (strpos($file, 'nodejs_update_') === 0 && strpos($file, '.log') !== false) {
                    $updateId = str_replace(array('nodejs_', '.log'), '', $file);

                    // Keep logs for active processes
                    if (in_array($updateId, $activeUpdateIds)) {
                        continue;
                    }

                    // For completed/failed processes, check if older than 7 days
                    $process = null;
                    foreach ($registry['processes'] as $p) {
                        if ($p['updateId'] === $updateId) {
                            $process = $p;
                            break;
                        }
                    }

                    // If process found and has endTime, check age
                    if ($process && isset($process['endTime'])) {
                        $endTime = strtotime($process['endTime']);
                        if ($endTime < $oneWeekAgo) {
                            // Process ended more than 7 days ago, remove log
                            @unlink($logsDir . '/' . $file);
                            $removed['stderrlogs']++;
                        }
                    } else {
                        // Process not in registry or no endTime, remove orphaned log
                        @unlink($logsDir . '/' . $file);
                        $removed['stderrlogs']++;
                    }
                }
            }
        }

        // Cleanup uploaded firmware/software files (only if not in use by running process)
        $filetransferDir = self::getDataPath('filetransfer');
        if (is_dir($filetransferDir)) {
            $uploadedFiles = scandir($filetransferDir);
            foreach ($uploadedFiles as $file) {
                if ($file === '.' || $file === '..') {
                    continue;
                }

                // Only delete .hex and .M24IEC files
                $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
                if (in_array($ext, array('hex', 'm24iec'))) {
                    // Check if file is currently being used by a running process
                    if (!in_array($file, $activeFilenames)) {
                        @unlink($filetransferDir . '/' . $file);
                        $removed['uploads']++;
                    }
                }
            }
        }

        return $removed;
    }

    /**
     * Hourly cron function called by Jeedom
     * Performs cleanup of old processes and temporary files
     * Recommended frequency: hourly (ensures quick process sync and port unlocking)
     */
    public static function cronHourly() {
        log::add('fidelixUpdater', 'debug', 'Running hourly cron cleanup');

        // Sync active processes first
        $synced = self::syncActiveProcesses();

        // Cleanup old processes from registry
        $removedProcesses = self::cleanupOldProcesses();

        // Cleanup temporary files
        $removedFiles = self::cleanupTempFiles();

        log::add('fidelixUpdater', 'info', "Cron cleanup completed: synced={$synced}, removed_processes={$removedProcesses}, removed_status_files={$removedFiles['status']}, removed_script_files={$removedFiles['scripts']}, removed_stderr_logs={$removedFiles['stderrlogs']}, removed_upload_files={$removedFiles['uploads']}");
    }

    /**
     * Legacy cron function for backward compatibility
     * @deprecated Use cronHourly() instead
     */
    public static function cron() {
        self::cronHourly();
    }

    /**
     * Initialize processes registry file if it doesn't exist
     *
     * @return bool Success status
     */
    public static function initializeRegistry() {
        $filePath = self::getProcessesFilePath();

        if (!file_exists($filePath)) {
            $initialData = array('processes' => array());
            return file_put_contents($filePath, json_encode($initialData, JSON_PRETTY_PRINT)) !== false;
        }

        return true;
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
     * Note: stderr logs are kept for historical processes and cleaned by cron after 7 days
     *
     * @param string $updateId Process update ID
     */
    private static function cleanupProcessFiles($updateId) {
        $statusFile = self::getDataPath('status') . '/status_' . $updateId . '.json';
        $scriptFile = self::getDataPath() . '/update_' . $updateId . '.js';
        // Note: We keep stderr logs for historical processes (they will be cleaned by cron after 7 days)

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
