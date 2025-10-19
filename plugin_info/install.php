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
    // Créer les répertoires nécessaires
    $dataDir = dirname(__FILE__) . '/../data';
    if (!file_exists($dataDir . '/filetransfer')) {
        mkdir($dataDir . '/filetransfer', 0775, true);
    }
    if (!file_exists($dataDir . '/status')) {
        mkdir($dataDir . '/status', 0775, true);
    }
    if (!file_exists($dataDir . '/logs')) {
        mkdir($dataDir . '/logs', 0775, true);
    }
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
