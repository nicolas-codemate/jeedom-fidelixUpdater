#!/usr/bin/env php
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

// Script CLI pour redémarrer le daemon Modbus après une mise à jour
// Usage: php restartModbusDaemon.php <updateId>

// Charge Jeedom core
require_once __DIR__.'/../../../../core/php/core.inc.php';
require_once __DIR__.'/../class/fidelixUpdater.class.php';

// Vérifier arguments
if (!isset($argv[1])) {
    echo "Usage: php restartModbusDaemon.php <updateId>\n";
    exit(1);
}

$updateId = $argv[1];
$statusFile = fidelixUpdater::getDataPath('status').'/status_'.$updateId.'.json';

log::add('fidelixUpdater', 'debug', "restartModbusDaemon: called for updateId={$updateId}");

// Vérifier que le fichier status existe
if (!file_exists($statusFile)) {
    log::add('fidelixUpdater', 'debug', "restartModbusDaemon: status file not found for {$updateId}");
    exit(0);
}

// Lire le status file
$status = json_decode(file_get_contents($statusFile), true);

if ($status === null) {
    log::add('fidelixUpdater', 'error', "restartModbusDaemon: invalid JSON in status file for {$updateId}");
    exit(1);
}

// Vérifier si le daemon a déjà été redémarré
if (isset($status['modbusRestarted']) && $status['modbusRestarted'] === true) {
    log::add('fidelixUpdater', 'debug', "restartModbusDaemon: daemon already restarted for {$updateId}, skipping");
    exit(0);
}

// Vérifier que modbusStatus existe
if (!isset($status['modbusStatus'])) {
    log::add('fidelixUpdater', 'debug', "restartModbusDaemon: no modbusStatus in status file for {$updateId}, skipping");
    exit(0);
}

$modbusStatus = $status['modbusStatus'];

// Conditions strictes : on ne redémarre QUE si on a arrêté nous-mêmes
if (!isset($modbusStatus['stopped']) || $modbusStatus['stopped'] !== true) {
    log::add('fidelixUpdater', 'debug', "restartModbusDaemon: daemon was not stopped by us for {$updateId}, skipping");
    exit(0);
}

if (!isset($modbusStatus['wasRunning']) || $modbusStatus['wasRunning'] !== true) {
    log::add('fidelixUpdater', 'debug', "restartModbusDaemon: daemon was not running before for {$updateId}, skipping");
    exit(0);
}

// Tentative de redémarrage
try {
    $restarted = fidelixUpdater::restartModbusDaemonIfNeeded($modbusStatus);

    if ($restarted) {
        // Mettre le flag pour éviter les doublons
        $status['modbusRestarted'] = true;
        file_put_contents($statusFile, json_encode($status, JSON_PRETTY_PRINT));

        log::add('fidelixUpdater', 'info', "Modbus daemon restarted by Node.js callback for updateId={$updateId}");
        exit(0);
    }

    log::add('fidelixUpdater', 'debug', "restartModbusDaemon: restart returned false for {$updateId} (plugin not available or daemon already running)");
    exit(0);
} catch (Exception $e) {
    log::add('fidelixUpdater', 'error', "restartModbusDaemon: exception for {$updateId}: ".$e->getMessage());
    exit(1);
}
