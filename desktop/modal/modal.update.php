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
                    <option value="m24firmware">{{Firmware}} (.hex)</option>
                    <option value="m24software">{{Software}} (.M24IEC)</option>
                </select>
            </div>

            <div class="form-group">
                <label>{{Fichier}}</label>
                <div class="input-group">
                    <span class="input-group-btn">
                        <span class="btn btn-default btn-file">
                            <i class="fas fa-cloud-upload-alt"></i> {{Parcourir}}<input type="file" id="fileUpload" accept=".hex,.M24IEC" style="display: inline-block;">
                        </span>
                    </span>
                    <input type="text" class="form-control" id="fileNameDisplay" readonly placeholder="{{Aucun fichier sélectionné}}">
                </div>
                <small class="text-muted">{{Formats acceptés : .hex (firmware), .M24IEC (software). Taille max : 10Mo}}</small>
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
                            echo '<option value="' . $key . '">' . $key . ' (' . $value . ')</option>';
                        }
                    }
                    ?>
                </select>
            </div>

            <div class="form-group">
                <button class="btn btn-success btn-lg btn-block" id="btnStartUpdate">
                    <i class="fas fa-play"></i> {{Démarrer la mise à jour}}
                </button>
            </div>
        </div>

        <div class="col-lg-6">
            <div class="alert alert-info">
                <h4><i class="fas fa-info-circle"></i> {{Informations}}</h4>
                <ul>
                    <li>{{La mise à jour peut prendre 5 à 15 minutes}}</li>
                    <li>{{Ne pas déconnecter le module pendant la mise à jour}}</li>
                    <li>{{Le module redémarrera automatiquement après la mise à jour}}</li>
                    <li>{{En cas d'échec, le module tentera de récupérer automatiquement}}</li>
                </ul>

                <h5><i class="fas fa-network-wired"></i> {{Mode Pass-Through}}</h5>
                <p class="small">{{Pour mettre à jour un module esclave à travers un module maître :}}</p>
                <ul class="small">
                    <li><strong>{{Adresse}}</strong> : {{Adresse du module maître (ex: 1)}}</li>
                    <li><strong>{{Sous-adresse}}</strong> : {{Adresse du module esclave (ex: 10)}}</li>
                </ul>
                <p class="small text-muted">{{Laissez la sous-adresse vide pour une mise à jour directe (sans pass-through).}}</p>
            </div>
        </div>
    </div>

    <!-- Progress Section -->
    <div class="row" id="progressSection" style="display: none;">
        <div class="col-lg-12">
            <hr>
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

    // File upload handler
    $('#fileUpload').on('change', function() {
        const file = this.files[0];
        if (!file) {
            return;
        }

        const filename = file.name;
        const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        const updateType = $('#updateType').val();

        // Validate extension based on update type
        if (updateType === 'm24firmware' && extension !== '.hex') {
            $('#notify').showAlert({message: '{{Fichier invalide : sélectionnez un fichier .hex pour firmware}}', level: 'danger'});
            $(this).val('');
            return;
        }

        if (updateType === 'm24software' && extension !== '.m24iec') {
            $('#notify').showAlert({message: '{{Fichier invalide : sélectionnez un fichier .M24IEC pour software}}', level: 'danger'});
            $(this).val('');
            return;
        }

        // Display filename
        $('#fileNameDisplay').val(filename);

        // Upload file
        const formData = new FormData();
        formData.append('file', file);

        const action = (updateType === 'm24firmware') ? 'uploadFirmware' : 'uploadSoftware';

        $.ajax({
            url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php?action=' + action,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            dataType: 'json',
            success: function(data) {
                if (data.state === 'ok') {
                    uploadedFilename = data.result;
                    $('#notify').showAlert({message: '{{Fichier uploadé avec succès}} : ' + uploadedFilename, level: 'success'});
                } else {
                    $('#notify').showAlert({message: '{{Erreur upload}} : ' + data.result, level: 'danger'});
                }
            },
            error: function(xhr, status, error) {
                $('#notify').showAlert({message: '{{Erreur upload}} : ' + error, level: 'danger'});
            }
        });
    });

    // Update type change handler
    $('#updateType').on('change', function() {
        const updateType = $(this).val();
        if (updateType === 'm24firmware') {
            $('#fileUpload').attr('accept', '.hex');
        } else {
            $('#fileUpload').attr('accept', '.M24IEC,.m24iec');
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
            $('#notify').showAlert({message: '{{Veuillez d\'abord uploader un fichier}}', level: 'warning'});
            return;
        }

        const address = parseInt($('#deviceAddress').val());
        if (!address || address < 1 || address > 247) {
            $('#notify').showAlert({message: '{{Adresse invalide (doit être entre 1 et 247)}}', level: 'warning'});
            return;
        }

        const subaddress = $('#deviceSubaddress').val() ? parseInt($('#deviceSubaddress').val()) : null;
        if (subaddress !== null && (subaddress < 1 || subaddress > 247)) {
            $('#notify').showAlert({message: '{{Sous-adresse invalide (doit être entre 1 et 247)}}', level: 'warning'});
            return;
        }

        const port = $('#serialPort').val();
        if (!port) {
            $('#notify').showAlert({message: '{{Veuillez sélectionner un port série}}', level: 'warning'});
            return;
        }

        const method = $('#updateType').val();

        // Disable start button
        $(this).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> {{Démarrage...}}');

        // Prepare AJAX data
        const ajaxData = {
            action: 'startUpdate',
            address: address,
            port: port,
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
                    $('#notify').showAlert({message: '{{Erreur démarrage}} : ' + data.result, level: 'danger'});
                    $('#btnStartUpdate').prop('disabled', false).html('<i class="fas fa-play"></i> {{Démarrer la mise à jour}}');
                }
            },
            error: function(xhr, status, error) {
                $('#notify').showAlert({message: '{{Erreur démarrage}} : ' + error, level: 'danger'});
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
                statusFile: statusFile
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
