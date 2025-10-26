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
include_file('core', 'authentification', 'php');

if (!isConnect()) {
    include_file('desktop', '404', 'php');
    die();
}

// Gather system diagnostics
$diagnostics = array();

// Check Node.js
$nodeVersion = shell_exec('node -v 2>&1');
$diagnostics['nodejs'] = array(
    'installed' => !empty($nodeVersion) && strpos($nodeVersion, 'v') === 0,
    'version' => trim($nodeVersion),
    'label' => 'Node.js'
);

// Check www-data in dialout group
$groups = shell_exec('groups www-data 2>&1');
$diagnostics['dialout'] = array(
    'ok' => strpos($groups, 'dialout') !== false,
    'groups' => trim($groups),
    'label' => 'Permissions (www-data dans groupe dialout)'
);

// Check npm dependencies
$nodeModulesPath = dirname(__FILE__) . '/../3rdparty/Fidelix/FxLib/node_modules';
$diagnostics['npm'] = array(
    'installed' => file_exists($nodeModulesPath) && is_dir($nodeModulesPath),
    'path' => $nodeModulesPath,
    'label' => 'Dépendances Node.js (npm)'
);

// Check serial ports
$serialPorts = array();
$usbMapping = jeedom::getUsbMapping('', true);
if (is_array($usbMapping)) {
    foreach ($usbMapping as $port => $description) {
        $readable = is_readable($port);
        $writable = is_writable($port);
        $serialPorts[$port] = array(
            'description' => $description,
            'readable' => $readable,
            'writable' => $writable,
            'ok' => $readable && $writable
        );
    }
}
$diagnostics['serial'] = array(
    'ports' => $serialPorts,
    'count' => count($serialPorts),
    'label' => 'Ports série détectés'
);

// Overall status
$allOk = $diagnostics['nodejs']['installed'] &&
         $diagnostics['dialout']['ok'] &&
         $diagnostics['npm']['installed'];
?>

<style>
.diagnostic-panel {
    margin-bottom: 20px;
}
.diagnostic-item {
    padding: 10px;
    margin-bottom: 10px;
    border-left: 4px solid #ccc;
    background-color: #f9f9f9;
}
.diagnostic-item.success {
    border-left-color: #5cb85c;
    background-color: #dff0d8;
}
.diagnostic-item.warning {
    border-left-color: #f0ad4e;
    background-color: #fcf8e3;
}
.diagnostic-item.error {
    border-left-color: #d9534f;
    background-color: #f2dede;
}
.diagnostic-icon {
    font-size: 1.5em;
    margin-right: 10px;
}
.port-list {
    margin-left: 20px;
    font-size: 0.9em;
}
</style>

<form class="form-horizontal">
    <fieldset>
        <!-- Overall Status -->
        <div class="form-group">
            <label class="col-md-12">
                <legend><i class="fas fa-cogs"></i> {{Diagnostic système}}</legend>
            </label>
        </div>

        <div class="col-md-12">
            <?php if ($allOk): ?>
                <div class="alert alert-success">
                    <h4><i class="fas fa-check-circle"></i> {{Configuration correcte}}</h4>
                    <p>{{Tous les prérequis sont satisfaits. Le plugin est prêt à fonctionner.}}</p>
                </div>
            <?php else: ?>
                <div class="alert alert-warning">
                    <h4><i class="fas fa-exclamation-triangle"></i> {{Configuration incomplète}}</h4>
                    <p>{{Certains prérequis ne sont pas satisfaits. Utilisez le bouton ci-dessous pour corriger automatiquement.}}</p>
                </div>
            <?php endif; ?>

            <!-- Fix button -->
            <div class="form-group">
                <div class="col-md-12">
                    <button type="button" class="btn btn-warning btn-lg" id="btnFixPermissions">
                        <i class="fas fa-wrench"></i> {{Reconfigurer les permissions}}
                    </button>
                    <span id="fixStatus" style="margin-left: 15px;"></span>
                </div>
            </div>

            <hr>

            <!-- Diagnostics Details -->
            <div class="diagnostic-panel">
                <!-- Node.js -->
                <div class="diagnostic-item <?php echo $diagnostics['nodejs']['installed'] ? 'success' : 'error'; ?>">
                    <span class="diagnostic-icon">
                        <?php if ($diagnostics['nodejs']['installed']): ?>
                            <i class="fas fa-check-circle" style="color: #5cb85c;"></i>
                        <?php else: ?>
                            <i class="fas fa-times-circle" style="color: #d9534f;"></i>
                        <?php endif; ?>
                    </span>
                    <strong><?php echo $diagnostics['nodejs']['label']; ?></strong>
                    <div style="margin-left: 40px;">
                        <?php if ($diagnostics['nodejs']['installed']): ?>
                            Version: <code><?php echo htmlspecialchars($diagnostics['nodejs']['version']); ?></code>
                        <?php else: ?>
                            <span class="text-danger">Non installé</span>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Dialout Group -->
                <div class="diagnostic-item <?php echo $diagnostics['dialout']['ok'] ? 'success' : 'warning'; ?>">
                    <span class="diagnostic-icon">
                        <?php if ($diagnostics['dialout']['ok']): ?>
                            <i class="fas fa-check-circle" style="color: #5cb85c;"></i>
                        <?php else: ?>
                            <i class="fas fa-exclamation-triangle" style="color: #f0ad4e;"></i>
                        <?php endif; ?>
                    </span>
                    <strong><?php echo $diagnostics['dialout']['label']; ?></strong>
                    <div style="margin-left: 40px;">
                        Groupes: <code><?php echo htmlspecialchars($diagnostics['dialout']['groups']); ?></code>
                    </div>
                </div>

                <!-- NPM Dependencies -->
                <div class="diagnostic-item <?php echo $diagnostics['npm']['installed'] ? 'success' : 'warning'; ?>">
                    <span class="diagnostic-icon">
                        <?php if ($diagnostics['npm']['installed']): ?>
                            <i class="fas fa-check-circle" style="color: #5cb85c;"></i>
                        <?php else: ?>
                            <i class="fas fa-exclamation-triangle" style="color: #f0ad4e;"></i>
                        <?php endif; ?>
                    </span>
                    <strong><?php echo $diagnostics['npm']['label']; ?></strong>
                    <div style="margin-left: 40px;">
                        <?php if ($diagnostics['npm']['installed']): ?>
                            Installées dans: <code><?php echo htmlspecialchars($diagnostics['npm']['path']); ?></code>
                        <?php else: ?>
                            <span class="text-warning">Non installées</span>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Serial Ports -->
                <div class="diagnostic-item <?php echo ($diagnostics['serial']['count'] > 0) ? 'success' : 'warning'; ?>">
                    <span class="diagnostic-icon">
                        <?php if ($diagnostics['serial']['count'] > 0): ?>
                            <i class="fas fa-check-circle" style="color: #5cb85c;"></i>
                        <?php else: ?>
                            <i class="fas fa-info-circle" style="color: #5bc0de;"></i>
                        <?php endif; ?>
                    </span>
                    <strong><?php echo $diagnostics['serial']['label']; ?></strong>
                    <div class="port-list">
                        <?php if ($diagnostics['serial']['count'] > 0): ?>
                            <?php foreach ($serialPorts as $port => $info): ?>
                                <div style="margin: 5px 0;">
                                    <code><?php echo htmlspecialchars($port); ?></code>
                                    <?php if ($info['ok']): ?>
                                        <span class="label label-success"><i class="fas fa-check"></i> Accessible</span>
                                    <?php else: ?>
                                        <span class="label label-warning"><i class="fas fa-exclamation-triangle"></i> Permissions insuffisantes</span>
                                    <?php endif; ?>
                                    <br><small class="text-muted"><?php echo htmlspecialchars($info['description']); ?></small>
                                </div>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <em class="text-muted">Aucun port série détecté (normal si aucun périphérique USB connecté)</em>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <hr>

            <!-- Information -->
            <div class="alert alert-info">
                <h4><i class="fas fa-info-circle"></i> {{Informations}}</h4>
                <p>{{Le plugin Fidelix Updater nécessite :}}</p>
                <ul>
                    <li>{{Node.js version 12 ou supérieure}}</li>
                    <li>{{L'utilisateur www-data dans le groupe dialout pour accéder aux ports série}}</li>
                    <li>{{Les dépendances npm installées (serialport, q, fs-extra)}}</li>
                    <li>{{Un adaptateur USB-RS485 pour communiquer avec les modules Fidelix}}</li>
                </ul>
                <p class="small text-muted">{{Le bouton "Reconfigurer les permissions" exécute automatiquement toutes les étapes nécessaires.}}</p>
            </div>
        </div>
    </fieldset>
</form>

<script>
$('#btnFixPermissions').on('click', function() {
    const $btn = $(this);
    const $status = $('#fixStatus');

    // Disable button
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> {{Configuration en cours...}}');
    $status.html('');

    // Call fix permissions AJAX action
    $.ajax({
        type: 'POST',
        url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
        data: {
            action: 'fixPermissions'
        },
        dataType: 'json',
        timeout: 60000, // 60 seconds
        success: function(data) {
            $btn.prop('disabled', false).html('<i class="fas fa-wrench"></i> {{Reconfigurer les permissions}}');

            if (data.state === 'ok' && data.result.success) {
                $status.html('<span class="label label-success"><i class="fas fa-check"></i> Configuration réussie !</span>');
                $('#notify').showAlert({message: '{{Configuration réussie ! Rechargement de la page...}}', level: 'success'});

                // Reload page after 2 seconds to show updated diagnostics
                setTimeout(function() {
                    location.reload();
                }, 2000);
            } else {
                const errorMsg = data.result.error || data.result || 'Erreur inconnue';
                $status.html('<span class="label label-danger"><i class="fas fa-times"></i> Échec</span>');
                $('#notify').showAlert({message: '{{Erreur}} : ' + errorMsg, level: 'danger'});
            }
        },
        error: function(xhr, status, error) {
            $btn.prop('disabled', false).html('<i class="fas fa-wrench"></i> {{Reconfigurer les permissions}}');
            $status.html('<span class="label label-danger"><i class="fas fa-times"></i> Échec</span>');
            $('#notify').showAlert({message: '{{Erreur}} : ' + error, level: 'danger'});
        }
    });
});
</script>
