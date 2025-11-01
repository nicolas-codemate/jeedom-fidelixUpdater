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
