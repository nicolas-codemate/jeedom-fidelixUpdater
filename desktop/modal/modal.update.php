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

<div id="md_fidelixUpdater" style="padding: 20px;">
    <div class="row">
        <div class="col-lg-12">
            <legend><i class="fas fa-microchip"></i> {{Mise à jour Fidelix Multi24}}</legend>
        </div>
    </div>

    <!-- Configuration Section -->
    <div class="row" id="configSection">
        <div class="col-lg-6">
            <div class="form-group">
                <label>{{Type de mise à jour}}</label>
                <select class="form-control" id="updateType">
                    <optgroup label="Multi24 Controller">
                        <option value="m24firmware">{{Firmware Multi24}} (.hex)</option>
                        <option value="m24software" selected>{{Software Multi24}} (.M24IEC)</option>
                    </optgroup>
                    <optgroup label="Display Touchscreen">
                        <option value="displayfirmware" disabled>{{Firmware Display}} (.hex) - {{Indisponible}}</option>
                        <option value="displaygraphics">{{Graphics Display}} (.dat)</option>
                    </optgroup>
                </select>
            </div>

            <div class="form-group">
                <label>{{Fichier}}</label>
                <div class="input-group">
                    <span class="input-group-btn">
                        <span class="btn btn-default btn-file">
                            <i class="fas fa-cloud-upload-alt"></i> {{Parcourir}}<input type="file" id="fileUpload" accept="*" style="display: inline-block;">
                        </span>
                    </span>
                    <input type="text" class="form-control" id="fileNameDisplay" readonly placeholder="{{Aucun fichier sélectionné}}">
                </div>
                <small class="text-muted">{{Formats acceptés : .hex* (firmware), .M24IEC (software), .dat* (display). Taille max : 10Mo}}</small>
            </div>

            <div class="form-group">
                <label>{{Adresse du module Modbus}} (1-247)</label>
                <input type="number" class="form-control" id="deviceAddress" min="1" max="247" value="1" placeholder="1">
                <small class="text-muted">{{Adresse du module à mettre à jour (ou du module maître si mode pass-through)}}</small>
            </div>

            <div class="form-group">
                <label>{{Sous-adresse (mode pass-through)}} <span class="text-muted">(Optionnel)</span></label>
                <input type="number" class="form-control" id="deviceSubaddress" min="1" max="247" placeholder="">
                <small class="text-muted">{{Si renseigné, la mise à jour se fera à travers le module maître (adresse principale) vers le module esclave (sous-adresse)}}</small>
            </div>

            <div class="form-group">
                <label>{{Port série}}</label>
                <select class="form-control" id="serialPort">
                    <?php
                    $usbMapping = jeedom::getUsbMapping('', true);
                    if (is_array($usbMapping)) {
                        foreach ($usbMapping as $key => $value) {
                            echo '<option value="' . $value . '">' . $key . ' (' . $value . ')</option>';
                        }
                    }
                    ?>
                </select>
            </div>

            <div class="form-group">
                <label>{{Vitesse de communication (Baud Rate)}}</label>
                <select class="form-control" id="baudRate">
                    <option value="9600">9600</option>
                    <option value="19200">19200</option>
                    <option value="38400" selected>38400</option>
                    <option value="57600">57600</option>
                    <option value="115200">115200</option>
                </select>
                <small class="text-muted">{{Doit correspondre à la configuration de l'automate (généralement 38400 pour Multi24)}}</small>
            </div>

            <div class="alert alert-info" style="margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i>
                <strong>{{Plugin Modbus}}</strong> :
                {{Le daemon du plugin Modbus sera automatiquement arrêté pendant la mise à jour et redémarré ensuite pour éviter les conflits d'accès au port série.}}
            </div>

            <div class="form-group">
                <button class="btn btn-success btn-lg btn-block" id="btnStartUpdate">
                    <i class="fas fa-play"></i> {{Démarrer la mise à jour}}
                </button>
            </div>
        </div>

        <div class="col-lg-6">
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>{{Firmware Display}}</strong> : {{La mise à jour du firmware Display est temporairement indisponible suite à des problèmes de compatibilité identifiés. Cette fonctionnalité sera réactivée dans une prochaine version.}}
            </div>

            <div class="alert alert-info">
                <h4><i class="fas fa-info-circle"></i> {{Informations}}</h4>
                <ul>
                    <li>{{La mise à jour peut prendre 5 à 15 minutes}}</li>
                    <li>{{Ne pas déconnecter le module pendant la mise à jour}}</li>
                    <li>{{Assurez-vous que l'adresse Modbus du module est correcte (1-247)}}</li>
                    <li>{{Le module redémarrera automatiquement après la mise à jour}}</li>
                    <li>{{En cas d'échec, le module tentera de récupérer automatiquement}}</li>
                </ul>

                <h5><i class="fas fa-network-wired"></i> {{Mode Pass-Through}}</h5>
                <p class="small">{{Pour mettre à jour un module esclave à travers un module maître :}}</p>
                <ul class="small">
                    <li><strong>{{Adresse}}</strong> : {{Adresse du module maître (ex: 1)}}</li>
                    <li><strong>{{Sous-adresse}}</strong> : {{Adresse du module esclave (ex: 10)}}</li>
                </ul>
                <p class="small">{{Laissez la sous-adresse vide pour une mise à jour directe (sans pass-through).}}</p>
            </div>
        </div>
    </div>

    <!-- Progress Section -->
    <div class="row" id="progressSection" style="display: none;">
        <div class="col-lg-12">
            <hr>
            <div class="alert alert-info" style="margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i> {{Le processus de mise à jour s'exécute en arrière-plan. Vous pouvez fermer cette fenêtre et suivre la progression depuis la page principale du plugin.}}
            </div>
            <h4 id="phaseText">{{Initialisation...}}</h4>
            <div class="progress" style="height: 30px;">
                <div id="progressBar" class="progress-bar progress-bar-striped active" role="progressbar" style="width: 0%; min-width: 3em;">
                    0%
                </div>
            </div>
            <p id="statusText" class="text-muted" style="margin-top: 10px;"></p>
            <div id="errorAlert" class="alert alert-danger" style="display: none; margin-top: 15px;">
                <strong><i class="fas fa-exclamation-triangle"></i> {{Erreur}} :</strong>
                <span id="errorText"></span>
            </div>
            <div id="successAlert" class="alert alert-success" style="display: none; margin-top: 15px;">
                <strong><i class="fas fa-check-circle"></i> {{Succès}} :</strong>
                {{La mise à jour a été effectuée avec succès !}}
            </div>
        </div>
    </div>
</div>

<script>
$(function() {
    let uploadedFilename = null;
    let updateId = null;
    let statusFile = null;
    let pollingInterval = null;

    // Helper function to show alert
    function showAlert(message, level) {
        // Use div_alert for temporary alerts with progress bar and auto-dismiss
        // Force timeout even for danger/warning levels
        $('#div_alert').showAlert({
            message: message,
            level: level,
            timeout: 5000  // Force auto-dismiss after 5 seconds
        });
    }

    // Helper function to extract error message from AJAX response
    function extractErrorMessage(xhr, defaultMsg) {
        // Try multiple paths to get the error message
        if (xhr.responseJSON) {
            if (xhr.responseJSON.result) {
                return xhr.responseJSON.result;
            }
            if (xhr.responseJSON.message) {
                return xhr.responseJSON.message;
            }
        }
        if (xhr.responseText) {
            try {
                const json = JSON.parse(xhr.responseText);
                if (json.result) return json.result;
                if (json.message) return json.message;
            } catch(e) {
                // Not JSON, return raw text (truncated if too long)
                return xhr.responseText.substring(0, 200);
            }
        }
        return defaultMsg || 'Erreur inconnue';
    }

    // File upload handler
    $('#fileUpload').on('change', function() {
        const file = this.files[0];
        if (!file) {
            return;
        }

        const filename = file.name;
        const updateType = $('#updateType').val();

        // Display filename
        $('#fileNameDisplay').val(filename);

        // Upload file
        const formData = new FormData();
        formData.append('file', file);

        // Determine which upload action to use based on update type
        let action;
        if (updateType === 'm24firmware' || updateType === 'displayfirmware') {
            action = 'uploadFirmware';
        } else if (updateType === 'm24software') {
            action = 'uploadSoftware';
        } else if (updateType === 'displaygraphics') {
            action = 'uploadGraphics';
        }

        $.ajax({
            url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php?action=' + action,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            dataType: 'json',
            success: function(data) {
                if (data.state === 'ok') {
                    const uploadedFile = data.result;

                    // Validate file extension with server
                    $.ajax({
                        type: 'POST',
                        url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
                        data: {
                            action: 'validateFile',
                            filename: uploadedFile,
                            updateType: updateType
                        },
                        dataType: 'json',
                        success: function(validationData) {
                            if (validationData.state === 'ok') {
                                uploadedFilename = uploadedFile;
                                showAlert('{{Fichier uploadé et validé avec succès}} : ' + uploadedFile, 'success');
                            } else {
                                showAlert('{{Erreur validation}} : ' + validationData.result, 'warning');
                                $('#fileUpload').val('');
                                $('#fileNameDisplay').val('');
                                uploadedFilename = null;
                            }
                        },
                        error: function(xhr, status, error) {
                            const errorMsg = extractErrorMessage(xhr, error);
                            showAlert('{{Erreur validation}} : ' + errorMsg, 'warning');
                            $('#fileUpload').val('');
                            $('#fileNameDisplay').val('');
                            uploadedFilename = null;
                        }
                    });
                } else {
                    showAlert('{{Erreur upload}} : ' + data.result, 'warning');
                    $('#fileUpload').val('');
                    $('#fileNameDisplay').val('');
                    uploadedFilename = null;
                }
            },
            error: function(xhr, status, error) {
                const errorMsg = extractErrorMessage(xhr, error);
                showAlert('{{Erreur upload}} : ' + errorMsg, 'warning');
                $('#fileUpload').val('');
                $('#fileNameDisplay').val('');
                uploadedFilename = null;
            }
        });
    });

    // Update type change handler
    $('#updateType').on('change', function() {
        const updateType = $(this).val();
        // Note: Accept attribute is permissive (*) to support variable extensions like .hex-XXXX or .dat-XXXX
        // Validation is done server-side after upload
        if (updateType === 'm24firmware' || updateType === 'displayfirmware') {
            $('#fileUpload').attr('accept', '*');
        } else if (updateType === 'm24software') {
            $('#fileUpload').attr('accept', '*');
        } else if (updateType === 'displaygraphics') {
            $('#fileUpload').attr('accept', '*');
        }
        // Reset upload
        $('#fileUpload').val('');
        $('#fileNameDisplay').val('');
        uploadedFilename = null;
    });

    // Start update button handler
    $('#btnStartUpdate').on('click', function() {
        // Validate inputs
        if (!uploadedFilename) {
            showAlert('{{Veuillez d\'abord uploader un fichier}}', 'warning');
            return;
        }

        const address = parseInt($('#deviceAddress').val());
        if (!address || address < 1 || address > 247) {
            showAlert('{{Adresse invalide (doit être entre 1 et 247)}}', 'warning');
            return;
        }

        const subaddress = $('#deviceSubaddress').val() ? parseInt($('#deviceSubaddress').val()) : null;
        if (subaddress !== null && (subaddress < 1 || subaddress > 247)) {
            showAlert('{{Sous-adresse invalide (doit être entre 1 et 247)}}', 'warning');
            return;
        }

        const port = $('#serialPort').val();
        if (!port) {
            showAlert('{{Veuillez sélectionner un port série}}', 'warning');
            return;
        }

        const baudRate = parseInt($('#baudRate').val());
        const method = $('#updateType').val();

        // Disable start button
        $(this).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> {{Démarrage...}}');

        // Prepare AJAX data
        const ajaxData = {
            action: 'startUpdate',
            address: address,
            port: port,
            baudRate: baudRate,
            filename: uploadedFilename,
            method: method
        };

        // Add subaddress only if provided
        if (subaddress !== null) {
            ajaxData.subaddress = subaddress;
        }

        // Start update
        $.ajax({
            type: 'POST',
            url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
            data: ajaxData,
            dataType: 'json',
            success: function(data) {
                if (data.state === 'ok') {
                    updateId = data.result.updateId;
                    statusFile = data.result.statusFile;

                    // Hide config, show progress
                    $('#configSection').hide();
                    $('#progressSection').show();

                    // Start polling
                    startPolling();
                } else {
                    showAlert('{{Erreur démarrage}} : ' + data.result, 'danger');
                    $('#btnStartUpdate').prop('disabled', false).html('<i class="fas fa-play"></i> {{Démarrer la mise à jour}}');
                }
            },
            error: function(xhr, status, error) {
                const errorMsg = extractErrorMessage(xhr, error);
                showAlert('{{Erreur démarrage}} : ' + errorMsg, 'danger');
                $('#btnStartUpdate').prop('disabled', false).html('<i class="fas fa-play"></i> {{Démarrer la mise à jour}}');
            }
        });
    });

    // Polling function
    function startPolling() {
        pollingInterval = setInterval(pollStatus, 2000);
        pollStatus(); // Poll immediately
    }

    function pollStatus() {
        $.ajax({
            type: 'POST',
            url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
            data: {
                action: 'getStatus',
                statusFile: statusFile,
                updateId: updateId
            },
            dataType: 'json',
            success: function(data) {
                if (data.state === 'ok') {
                    updateUI(data.result);

                    // Stop polling if done
                    if (data.result.progress >= 100 || data.result.error !== null) {
                        clearInterval(pollingInterval);
                        cleanup();
                    }
                }
            },
            error: function() {
                // Status file might not exist yet, continue polling
            }
        });
    }

    function updateUI(status) {
        const progress = Math.round(status.progress || 0);
        const phase = status.phase || 'Unknown';
        const statusText = status.status || '';
        const error = status.error;

        // Update progress bar
        $('#progressBar').css('width', progress + '%').text(progress + '%');

        // Update phase and status text
        $('#phaseText').text(phase);
        $('#statusText').text(statusText);

        // Handle error
        if (error) {
            $('#progressBar').removeClass('progress-bar-striped active').addClass('progress-bar-danger');
            $('#errorText').text(error);
            $('#errorAlert').show();
        } else if (progress >= 100) {
            $('#progressBar').removeClass('progress-bar-striped active').addClass('progress-bar-success');
            $('#successAlert').show();
        }
    }

    function cleanup() {
        if (!updateId) {
            return;
        }

        $.ajax({
            type: 'POST',
            url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
            data: {
                action: 'cleanupUpdate',
                updateId: updateId
            },
            dataType: 'json'
        });
    }
});
</script>
