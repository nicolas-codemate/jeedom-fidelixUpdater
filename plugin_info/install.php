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

require_once dirname(__FILE__) . '/../../../core/php/core.inc.php';

// Fonction exécutée automatiquement après l'installation du plugin
function fidelixUpdater_install() {
    $pluginDir = dirname(__FILE__) . '/..';
    $fixScript = $pluginDir . '/resources/fix-permissions.sh';

    log::add('fidelixUpdater', 'info', 'Starting plugin installation/configuration...');

    // Créer les répertoires nécessaires (au cas où le script échoue)
    $dataDir = $pluginDir . '/data';
    if (!file_exists($dataDir . '/filetransfer')) {
        mkdir($dataDir . '/filetransfer', 0775, true);
    }
    if (!file_exists($dataDir . '/status')) {
        mkdir($dataDir . '/status', 0775, true);
    }
    if (!file_exists($dataDir . '/logs')) {
        mkdir($dataDir . '/logs', 0775, true);
    }

    log::add('fidelixUpdater', 'debug', 'Directories created');

    // Initialize processes registry
    require_once $pluginDir . '/core/class/fidelixUpdater.class.php';
    if (fidelixUpdater::initializeRegistry()) {
        log::add('fidelixUpdater', 'info', 'Processes registry initialized');
    } else {
        log::add('fidelixUpdater', 'warning', 'Failed to initialize processes registry');
    }

    // Execute fix-permissions script if it exists
    if (file_exists($fixScript)) {
        log::add('fidelixUpdater', 'info', 'Running permissions configuration script...');

        $cmd = system::getCmdSudo() . " bash " . escapeshellarg($fixScript) . " 2>&1";
        $output = array();
        $returnCode = 0;

        exec($cmd, $output, $returnCode);

        if ($returnCode === 0) {
            log::add('fidelixUpdater', 'info', 'Permissions configured successfully');
            log::add('fidelixUpdater', 'debug', 'Script output: ' . implode("\n", $output));
        } else {
            log::add('fidelixUpdater', 'warning', 'Permissions script returned non-zero exit code: ' . $returnCode);
            log::add('fidelixUpdater', 'warning', 'Output: ' . implode("\n", $output));
        }
    } else {
        log::add('fidelixUpdater', 'warning', 'Permissions script not found at: ' . $fixScript);
    }

    // Enregistrer le plugin dans la table update de Jeedom
    try {
        log::add('fidelixUpdater', 'info', 'Registering plugin in Jeedom update system...');
        update::findNewUpdateObject();
        log::add('fidelixUpdater', 'info', 'Plugin registered successfully');
    } catch (Exception $e) {
        log::add('fidelixUpdater', 'error', 'Failed to register plugin: ' . $e->getMessage());
    }

    log::add('fidelixUpdater', 'info', 'Plugin installation completed');
}

// Fonction exécutée automatiquement après la mise à jour du plugin
function fidelixUpdater_update() {
    fidelixUpdater_install();
}

// Fonction exécutée automatiquement après la suppression du plugin
function fidelixUpdater_remove() {
    // Nettoyer les fichiers temporaires
    $dataDir = dirname(__FILE__) . '/../data';

    // Supprimer les fichiers de status et logs (garder filetransfer au cas où)
    if (file_exists($dataDir . '/status')) {
        foreach (glob($dataDir . '/status/*') as $file) {
            @unlink($file);
        }
    }

    if (file_exists($dataDir . '/logs')) {
        foreach (glob($dataDir . '/logs/*') as $file) {
            @unlink($file);
        }
    }
}
