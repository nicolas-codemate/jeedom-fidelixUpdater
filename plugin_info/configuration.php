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

// Load helper class
require_once dirname(__FILE__) . '/../core/class/fidelixUpdaterHelper.class.php';

// Gather system diagnostics using helper
$diagnostics = fidelixUpdaterHelper::getSystemDiagnostics();
$serialPorts = $diagnostics['serial']['ports'];

// Read plugin version from info.json
$infoJsonPath = dirname(__FILE__) . '/info.json';
$pluginInfo = json_decode(file_get_contents($infoJsonPath), true);
$pluginVersion = $pluginInfo['pluginVersion'] ?? 'Inconnue';

// Check if Modbus plugin is installed and enabled
$modbusInstalled = false;
try {
    $modbusPlugin = plugin::byId('modbus');
    $modbusInstalled = is_object($modbusPlugin) && $modbusPlugin->isActive() == 1;
} catch (Exception $e) {
    $modbusInstalled = false;
}

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
    border-left-color: #d6e9c6;
    background-color: #dff0d8;
    color: #3c763d;
}
.diagnostic-item.success strong {
    color: #2b542c;
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
        <!-- Plugin Version Info -->
        <div class="row">
            <div class="col-md-12" style="margin-bottom: 15px;">
                <div class="diagnostic-item success">
                    <span class="diagnostic-icon">
                        <i class="fas fa-code-branch" style="color: #3c763d;"></i>
                    </span>
                    <strong>{{Version du plugin}} :</strong> <code style="font-size: 14px;"><?php echo htmlspecialchars($pluginVersion); ?></code>
                </div>
            </div>
        </div>

        <div class="row">
            <?php if ($modbusInstalled): ?>
            <!-- Configuration Column -->
            <div class="col-lg-6">
                <div class="form-group">
                    <label class="col-md-12">
                        <legend><i class="fas fa-sliders-h"></i> {{Configuration}}</legend>
                    </label>
                </div>

                <div class="col-md-12">
                    <div style="border: 1px solid #ddd; border-radius: 4px; padding: 20px; background-color: #fafafa; margin-bottom: 15px;">
                        <div style="margin-bottom: 12px;">
                            <label style="font-weight: normal; cursor: pointer; font-size: 15px; display: flex; align-items: center;">
                                <input type="checkbox" class="configKey" data-l1key="auto_stop_modbus" checked style="margin-right: 10px; cursor: pointer; transform: scale(1.3);"/>
                                <span style="font-weight: 600; color: #333;">{{Arrêt automatique du daemon Modbus}}</span>
                            </label>
                        </div>
                        <div style="padding-left: 28px; font-size: 13px; color: #777; line-height: 1.6;">
                            {{Arrête temporairement le daemon du plugin Modbus pendant les mises à jour pour éviter les conflits d'accès au port série RS485. Le daemon sera automatiquement redémarré après.}}
                        </div>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <!-- Diagnostic Column -->
            <div class="<?php echo $modbusInstalled ? 'col-lg-6' : 'col-lg-12'; ?>">
                <div class="form-group">
                    <label class="col-md-12">
                        <legend><i class="fas fa-stethoscope"></i> {{Diagnostic}}</legend>
                    </label>
                </div>

                <div class="col-md-12">
                    <?php if ($allOk): ?>
                        <div class="alert alert-success" style="padding: 10px 15px; margin-bottom: 15px;">
                            <i class="fas fa-check-circle"></i> {{Tous les prérequis sont satisfaits}}
                        </div>
                    <?php else: ?>
                        <div class="alert alert-warning" style="padding: 10px 15px; margin-bottom: 15px;">
                            <i class="fas fa-exclamation-triangle"></i> {{Certains prérequis ne sont pas satisfaits}}
                        </div>
                    <?php endif; ?>

                    <!-- Fix button -->
                    <div style="margin-bottom: 15px;">
                        <button type="button" class="btn btn-warning" id="btnFixPermissions">
                            <i class="fas fa-wrench"></i> {{Reconfigurer les permissions}}
                        </button>
                        <span id="fixStatus" style="margin-left: 10px;"></span>
                    </div>
                </div>
            </div>
        </div>

        <div class="col-md-12">
            <hr>

            <!-- Diagnostics Details -->
            <div class="diagnostic-panel">
                <!-- Node.js -->
                <div class="diagnostic-item <?php echo $diagnostics['nodejs']['installed'] ? 'success' : 'error'; ?>">
                    <span class="diagnostic-icon">
                        <?php if ($diagnostics['nodejs']['installed']): ?>
                            <i class="fas fa-check-circle" style="color: #3c763d;"></i>
                        <?php else: ?>
                            <i class="fas fa-times-circle" style="color: #d9534f;"></i>
                        <?php endif; ?>
                    </span>
                    <strong style="color:black;"><?php echo $diagnostics['nodejs']['label']; ?></strong>
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
                            <i class="fas fa-check-circle" style="color: #3c763d;"></i>
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
                            <i class="fas fa-check-circle" style="color: #3c763d;"></i>
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
                            <i class="fas fa-check-circle" style="color: #3c763d;"></i>
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

            <!-- Display Firmware Warning -->
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>{{Firmware Display}}</strong> : {{La mise à jour du firmware Display est temporairement indisponible suite à des problèmes de compatibilité identifiés. Cette fonctionnalité sera réactivée dans une prochaine version.}}
            </div>

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
                <p class="small">{{Le bouton "Reconfigurer les permissions" exécute automatiquement toutes les étapes nécessaires.}}</p>
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
