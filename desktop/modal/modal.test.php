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

if (!isConnect('admin')) {
    throw new Exception('{{401 - Accès non autorisé}}');
}
?>

<div id="md_testConnection" style="padding: 20px;">
    <div class="row">
        <div class="col-lg-12">
            <legend><i class="fas fa-plug"></i> {{Test de connexion Fidelix Multi24}}</legend>
        </div>
    </div>

    <!-- Configuration Section -->
    <div class="row" id="testConfigSection">
        <div class="col-lg-6">
            <div class="form-group">
                <label>{{Port série}}</label>
                <select class="form-control" id="testSerialPort">
                    <?php
                    // Load helper class
                    require_once dirname(__FILE__) . '/../../core/class/fidelixUpdaterHelper.class.php';

                    // Get serial ports with normalized [port => description] mapping
                    $serialPorts = fidelixUpdaterHelper::getSerialPorts(true);
                    if (is_array($serialPorts)) {
                        foreach ($serialPorts as $port => $description) {
                            // Display: /dev/ttyS0 (Cubiboard)
                            echo '<option value="' . htmlspecialchars($port) . '">' . htmlspecialchars($port) . ' (' . htmlspecialchars($description) . ')</option>';
                        }
                    }
                    ?>
                </select>
            </div>

            <div class="form-group">
                <label>{{Adresse du module Modbus}} (1-247)</label>
                <input type="number" class="form-control" id="testDeviceAddress" min="1" max="247" value="1" placeholder="1">
            </div>

            <div class="form-group">
                <label>{{Vitesse de communication (Baud Rate)}}</label>
                <select class="form-control" id="testBaudRate">
                    <option value="9600">9600</option>
                    <option value="19200">19200</option>
                    <option value="38400" selected>38400</option>
                    <option value="57600">57600</option>
                    <option value="115200">115200</option>
                </select>
                <small class="text-muted">{{Doit correspondre à la configuration de l'automate (généralement 38400 pour Multi24)}}</small>
            </div>

            <div class="form-group">
                <button class="btn btn-success btn-lg btn-block" id="btnRunTest">
                    <i class="fas fa-play"></i> {{Lancer le test}}
                </button>
            </div>
        </div>

        <div class="col-lg-6">
            <div class="alert alert-info">
                <h4><i class="fas fa-info-circle"></i> {{À propos du test}}</h4>
                <p>{{Ce test vérifie :}}</p>
                <ul>
                    <li>{{Installation de Node.js}}</li>
                    <li>{{Permissions du port série (www-data dans groupe dialout)}}</li>
                    <li>{{Connexion Modbus RTU au module}}</li>
                    <li>{{Communication avec le module à l'adresse spécifiée}}</li>
                </ul>
                <p class="small">{{Le test prend environ 5-10 secondes.}}</p>
            </div>
        </div>
    </div>

    <!-- Results Section -->
    <div class="row" id="testResultsSection" style="display: none; margin-top: 20px;">
        <div class="col-lg-12">
            <hr>
            <div id="testResultAlert"></div>

            <!-- System Diagnostics -->
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fas fa-cogs"></i> {{Diagnostics système}}</h3>
                </div>
                <div class="panel-body">
                    <table class="table table-condensed">
                        <tbody>
                            <tr>
                                <td><strong>{{Node.js}}</strong></td>
                                <td id="diag-nodejs"></td>
                            </tr>
                            <tr>
                                <td><strong>{{Port série}}</strong></td>
                                <td id="diag-port"></td>
                            </tr>
                            <tr>
                                <td><strong>{{Permissions}}</strong></td>
                                <td id="diag-permissions"></td>
                            </tr>
                            <tr>
                                <td><strong>{{Port ouvert}}</strong></td>
                                <td id="diag-portOpened"></td>
                            </tr>
                            <tr>
                                <td><strong>{{Réponse Modbus}}</strong></td>
                                <td id="diag-modbusResponse"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Module Information -->
            <div class="panel panel-success" id="moduleInfoPanel" style="display: none;">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fas fa-microchip"></i> {{Informations du module}}</h3>
                </div>
                <div class="panel-body">
                    <table class="table table-condensed">
                        <tbody id="moduleInfoTable">
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Error Details -->
            <div class="panel panel-danger" id="errorDetailsPanel" style="display: none;">
                <div class="panel-heading">
                    <h3 class="panel-title"><i class="fas fa-exclamation-triangle"></i> {{Détails de l'erreur}}</h3>
                </div>
                <div class="panel-body">
                    <p id="errorDetailsText"></p>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
$(function() {
    // Run test button handler
    $('#btnRunTest').on('click', function() {
        const port = $('#testSerialPort').val();
        const address = parseInt($('#testDeviceAddress').val());
        const baudRate = parseInt($('#testBaudRate').val());

        // Validate inputs
        if (!port) {
            $('#notify').showAlert({message: '{{Veuillez sélectionner un port série}}', level: 'warning'});
            return;
        }

        if (!address || address < 1 || address > 247) {
            $('#notify').showAlert({message: '{{Adresse invalide (doit être entre 1 et 247)}}', level: 'warning'});
            return;
        }

        // Disable button and show loading
        $(this).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> {{Test en cours...}}');

        // Hide previous results
        $('#testResultsSection').hide();

        // Run test
        $.ajax({
            type: 'POST',
            url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
            data: {
                action: 'testConnection',
                port: port,
                address: address,
                baudRate: baudRate
            },
            dataType: 'json',
            timeout: 15000, // 15 second timeout
            success: function(data) {
                $('#btnRunTest').prop('disabled', false).html('<i class="fas fa-play"></i> {{Lancer le test}}');

                if (data.state === 'ok') {
                    displayTestResults(data.result);
                } else {
                    $('#notify').showAlert({message: '{{Erreur}} : ' + data.result, level: 'danger'});
                }
            },
            error: function(xhr, status, error) {
                $('#btnRunTest').prop('disabled', false).html('<i class="fas fa-play"></i> {{Lancer le test}}');
                $('#notify').showAlert({message: '{{Erreur}} : ' + error, level: 'danger'});
            }
        });
    });

    function displayTestResults(result) {
        // Show results section
        $('#testResultsSection').show();

        // Display overall status
        const alertClass = result.success ? 'alert-success' : 'alert-danger';
        const alertIcon = result.success ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const alertTitle = result.success ? '{{Test réussi !}}' : '{{Test échoué}}';
        const alertMessage = result.success
            ? '{{La connexion au module Fidelix Multi24 fonctionne correctement.}}'
            : (result.error || '{{Impossible de se connecter au module.}}');

        // Check if permissions fix is needed
        const needsPermissionFix = !result.success && result.diagnostics && (
            !result.diagnostics.permissions?.wwwDataInDialout ||
            !result.diagnostics.port?.readable ||
            !result.diagnostics.port?.writable
        );

        let fixButton = '';
        if (needsPermissionFix) {
            fixButton = `
                <hr>
                <button class="btn btn-warning" id="btnFixNow">
                    <i class="fas fa-wrench"></i> {{Corriger les permissions maintenant}}
                </button>
                <span id="fixNowStatus" style="margin-left: 10px;"></span>
            `;
        }

        $('#testResultAlert').html(`
            <div class="alert ${alertClass}">
                <h4><i class="fas ${alertIcon}"></i> ${alertTitle}</h4>
                <p>${alertMessage}</p>
                ${fixButton}
            </div>
        `);

        // Scroll to result after a short delay to ensure DOM is updated
        setTimeout(function() {
            const resultElement = document.getElementById('testResultAlert');
            if (resultElement) {
                resultElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);

        // Display diagnostics
        const diag = result.diagnostics || {};

        // Node.js
        if (diag.nodejs) {
            const nodejsStatus = diag.nodejs.installed
                ? `<span class="label label-success"><i class="fas fa-check"></i> Installé (${diag.nodejs.version})</span>`
                : `<span class="label label-danger"><i class="fas fa-times"></i> Non installé</span>`;
            $('#diag-nodejs').html(nodejsStatus);
        }

        // Port série
        if (diag.port) {
            let portStatus = '';
            if (!diag.port.exists) {
                portStatus = `<span class="label label-danger"><i class="fas fa-times"></i> N'existe pas</span>`;
            } else if (!diag.port.readable || !diag.port.writable) {
                portStatus = `<span class="label label-warning"><i class="fas fa-exclamation-triangle"></i> Permissions insuffisantes</span>`;
            } else {
                portStatus = `<span class="label label-success"><i class="fas fa-check"></i> Accessible</span>`;
            }
            portStatus += ` <code>${diag.port.path}</code>`;
            $('#diag-port').html(portStatus);
        }

        // Permissions
        if (diag.permissions) {
            const permStatus = diag.permissions.wwwDataInDialout
                ? `<span class="label label-success"><i class="fas fa-check"></i> www-data dans groupe dialout</span>`
                : `<span class="label label-warning"><i class="fas fa-exclamation-triangle"></i> www-data pas dans groupe dialout</span>`;
            $('#diag-permissions').html(permStatus);
        }

        // Port opened
        const portOpenedStatus = diag.portOpened
            ? `<span class="label label-success"><i class="fas fa-check"></i> Oui</span>`
            : `<span class="label label-danger"><i class="fas fa-times"></i> Non</span>`;
        $('#diag-portOpened').html(portOpenedStatus);

        // Modbus response
        const modbusStatus = diag.modbusResponse
            ? `<span class="label label-success"><i class="fas fa-check"></i> Module répond</span>`
            : `<span class="label label-danger"><i class="fas fa-times"></i> Pas de réponse</span>`;
        $('#diag-modbusResponse').html(modbusStatus);

        // Display module information if available
        if (result.success && result.moduleInfo) {
            $('#moduleInfoPanel').show();
            let moduleInfoHtml = '';

            if (result.moduleInfo.bootVersion) {
                moduleInfoHtml += `<tr><td><strong>{{Version Boot}}</strong></td><td>${result.moduleInfo.bootVersion}</td></tr>`;
            }
            if (result.moduleInfo.address) {
                moduleInfoHtml += `<tr><td><strong>{{Adresse Modbus}}</strong></td><td>${result.moduleInfo.address}</td></tr>`;
            }
            if (result.moduleInfo.communicationOk !== undefined) {
                const commStatus = result.moduleInfo.communicationOk
                    ? `<span class="label label-success"><i class="fas fa-check"></i> OK</span>`
                    : `<span class="label label-danger"><i class="fas fa-times"></i> Échec</span>`;
                moduleInfoHtml += `<tr><td><strong>{{Communication}}</strong></td><td>${commStatus}</td></tr>`;
            }

            $('#moduleInfoTable').html(moduleInfoHtml);
        } else {
            $('#moduleInfoPanel').hide();
        }

        // Display error details if test failed
        if (!result.success) {
            $('#errorDetailsPanel').show();
            $('#errorDetailsText').text(result.error || 'Erreur inconnue');
        } else {
            $('#errorDetailsPanel').hide();
        }

        // Attach handler for fix button (if it exists)
        $('#btnFixNow').off('click').on('click', function() {
            const $btn = $(this);
            const $status = $('#fixNowStatus');

            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> {{Correction en cours...}}');
            $status.html('');

            $.ajax({
                type: 'POST',
                url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
                data: {
                    action: 'fixPermissions'
                },
                dataType: 'json',
                timeout: 60000,
                success: function(data) {
                    $btn.prop('disabled', false).html('<i class="fas fa-wrench"></i> {{Corriger les permissions maintenant}}');

                    if (data.state === 'ok' && data.result.success) {
                        $status.html('<span class="label label-success"><i class="fas fa-check"></i> Corrigé !</span>');
                        $('#notify').showAlert({message: '{{Permissions corrigées ! Relancez le test...}}', level: 'success'});

                        // Re-enable and highlight test button
                        $('#btnRunTest').removeClass('btn-default').addClass('btn-success').effect('highlight', {}, 2000);
                    } else {
                        const errorMsg = data.result.error || 'Erreur inconnue';
                        $status.html('<span class="label label-danger"><i class="fas fa-times"></i> Échec</span>');
                        $('#notify').showAlert({message: '{{Erreur}} : ' + errorMsg, level: 'danger'});
                    }
                },
                error: function(xhr, status, error) {
                    $btn.prop('disabled', false).html('<i class="fas fa-wrench"></i> {{Corriger les permissions maintenant}}');
                    $status.html('<span class="label label-danger"><i class="fas fa-times"></i> Échec</span>');
                    $('#notify').showAlert({message: '{{Erreur}} : ' + error, level: 'danger'});
                }
            });
        });
    }
});
</script>
