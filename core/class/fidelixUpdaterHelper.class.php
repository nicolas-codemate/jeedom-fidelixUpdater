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

/**
 * Helper class for Fidelix Updater plugin
 * Contains utility functions used across the plugin
 */
class fidelixUpdaterHelper
{
    /**
     * Check Unix permissions on a serial port without attempting to open it
     * This avoids false negatives when port exists but has no hardware connected
     *
     * @param string $port Path to serial port (e.g., /dev/ttyS0)
     * @return array ['exists' => bool, 'readable' => bool, 'writable' => bool, 'reason' => string]
     */
    public static function checkPortPermissions($port)
    {
        if (!file_exists($port)) {
            return array(
                'exists' => false,
                'readable' => false,
                'writable' => false,
                'reason' => 'Port does not exist'
            );
        }

        // Get file permissions and group
        $perms = fileperms($port);
        $gid = filegroup($port);

        // Get www-data user groups using 'id' command (most reliable method)
        // This works regardless of the current process's groups
        $output = shell_exec('id -G www-data 2>&1');
        if (empty($output)) {
            return array(
                'exists' => true,
                'readable' => false,
                'writable' => false,
                'reason' => 'Cannot determine www-data groups'
            );
        }

        // Parse group IDs from output (space-separated list)
        // Example: "33 20 1000" => [33, 20, 1000]
        $wwwDataGroups = array_map('intval', explode(' ', trim($output)));

        // Check if www-data belongs to the port's group
        $hasGroupAccess = in_array($gid, $wwwDataGroups);

        // Check Unix permission bits (group: rw-)
        $groupCanRead = ($perms & 0x0020) !== 0;  // bit 6 (group read)
        $groupCanWrite = ($perms & 0x0010) !== 0; // bit 5 (group write)

        return array(
            'exists' => true,
            'readable' => $hasGroupAccess && $groupCanRead,
            'writable' => $hasGroupAccess && $groupCanWrite,
            'reason' => 'Based on Unix permissions (does not test I/O)'
        );
    }

    /**
     * Get serial ports mapping with corrected key/value order
     * Jeedom's getUsbMapping() returns [description => port] but we often need [port => description]
     *
     * @param bool $normalize If true, returns [port => description], otherwise returns raw Jeedom mapping
     * @return array Serial ports mapping
     */
    public static function getSerialPorts($normalize = true)
    {
        $usbMapping = jeedom::getUsbMapping('', true);

        if (!is_array($usbMapping)) {
            return array();
        }

        if (!$normalize) {
            return $usbMapping;
        }

        // Normalize to [port => description]
        $normalized = array();
        foreach ($usbMapping as $description => $port) {
            $normalized[$port] = $description;
        }

        return $normalized;
    }

    /**
     * Check if www-data user is in dialout group
     *
     * @return array ['inDialout' => bool, 'groups' => string]
     */
    public static function checkDialoutGroup()
    {
        $groups = shell_exec('groups www-data 2>&1');
        $inDialout = strpos($groups, 'dialout') !== false;

        return array(
            'inDialout' => $inDialout,
            'groups' => trim($groups)
        );
    }

    /**
     * Check if Node.js is installed
     *
     * @return array ['installed' => bool, 'version' => string]
     */
    public static function checkNodeJs()
    {
        $nodeVersion = shell_exec('node -v 2>&1');
        $installed = !empty($nodeVersion) && strpos($nodeVersion, 'v') === 0;

        return array(
            'installed' => $installed,
            'version' => trim($nodeVersion)
        );
    }

    /**
     * Generate diagnostic array for system requirements
     *
     * @return array Complete diagnostic information
     */
    public static function getSystemDiagnostics()
    {
        $diagnostics = array();

        // Node.js
        $nodejs = self::checkNodeJs();
        $diagnostics['nodejs'] = array(
            'installed' => $nodejs['installed'],
            'version' => $nodejs['version'],
            'label' => 'Node.js'
        );

        // Dialout group
        $dialout = self::checkDialoutGroup();
        $diagnostics['dialout'] = array(
            'ok' => $dialout['inDialout'],
            'groups' => $dialout['groups'],
            'label' => 'Permissions (www-data dans groupe dialout)'
        );

        // NPM dependencies
        $nodeModulesPath = dirname(__FILE__) . '/../../3rdparty/Fidelix/FxLib/node_modules';
        $diagnostics['npm'] = array(
            'installed' => file_exists($nodeModulesPath) && is_dir($nodeModulesPath),
            'path' => $nodeModulesPath,
            'label' => 'Dépendances Node.js (npm)'
        );

        // Serial ports
        $serialPorts = array();
        $usbMapping = jeedom::getUsbMapping('', true);
        if (is_array($usbMapping)) {
            foreach ($usbMapping as $description => $port) {
                $perms = self::checkPortPermissions($port);
                $serialPorts[$port] = array(
                    'description' => $description,
                    'readable' => $perms['readable'],
                    'writable' => $perms['writable'],
                    'ok' => $perms['readable'] && $perms['writable']
                );
            }
        }

        $diagnostics['serial'] = array(
            'ports' => $serialPorts,
            'count' => count($serialPorts),
            'label' => 'Ports série détectés'
        );

        return $diagnostics;
    }
}
