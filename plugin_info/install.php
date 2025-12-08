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

    // Créer les répertoires nécessaires avec gestion d'erreurs robuste
    $dataDir = realpath($pluginDir) . '/data';
    log::add('fidelixUpdater', 'debug', 'Plugin directory resolved to: ' . realpath($pluginDir));
    log::add('fidelixUpdater', 'debug', 'Data directory target: ' . $dataDir);

    // Créer le répertoire parent data/ d'abord
    if (!file_exists($dataDir)) {
        log::add('fidelixUpdater', 'info', 'Creating data directory: ' . $dataDir);
        if (!mkdir($dataDir, 0775, true)) {
            log::add('fidelixUpdater', 'error', 'FAILED to create data directory: ' . $dataDir);
            throw new Exception('Cannot create data directory');
        }
        chmod($dataDir, 0775);
        log::add('fidelixUpdater', 'info', 'Data directory created successfully');
    } else {
        log::add('fidelixUpdater', 'debug', 'Data directory already exists');
    }

    // Créer les sous-répertoires
    $subdirs = array('filetransfer', 'status', 'logs');
    foreach ($subdirs as $subdir) {
        $path = $dataDir . '/' . $subdir;
        if (!file_exists($path)) {
            log::add('fidelixUpdater', 'info', 'Creating subdirectory: ' . $path);
            if (!mkdir($path, 0775, true)) {
                log::add('fidelixUpdater', 'error', 'FAILED to create subdirectory: ' . $path);
                throw new Exception('Cannot create subdirectory: ' . $subdir);
            }
            chmod($path, 0775);
            log::add('fidelixUpdater', 'info', 'Subdirectory created: ' . $subdir);
        } else {
            log::add('fidelixUpdater', 'debug', 'Subdirectory already exists: ' . $subdir);
        }

        // Vérifier que le répertoire est accessible en écriture
        if (!is_writable($path)) {
            log::add('fidelixUpdater', 'warning', 'Directory is not writable: ' . $path);
            log::add('fidelixUpdater', 'warning', 'Attempting to fix permissions...');
            chmod($path, 0775);
            if (!is_writable($path)) {
                log::add('fidelixUpdater', 'error', 'FAILED to make directory writable: ' . $path);
                throw new Exception('Directory is not writable: ' . $subdir);
            }
        }
    }

    log::add('fidelixUpdater', 'info', 'All directories created and verified successfully');

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
