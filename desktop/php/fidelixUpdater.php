<?php
if (!isConnect('admin')) {
    throw new Exception('{{401 - Accès non autorisé}}');
}

$plugin = plugin::byId('fidelixUpdater');
sendVarToJS('eqType', $plugin->getId());
$eqLogics = eqLogic::byType($plugin->getId());
?>

<div class="row row-overflow">
    <!-- Left Panel : Plugin Info -->
    <div class="col-xs-12 eqLogicThumbnailDisplay">
        <legend><i class="fas fa-microchip"></i> {{Gestion}}</legend>

        <div class="eqLogicThumbnailContainer">
            <div class="cursor logoPrimary" id="bt_openUpdateModal">
                <i class="fas fa-upload"></i>
                <br />
                <span>{{Mettre à jour}}</span>
            </div>
            <div class="cursor logoSecondary" id="bt_openTestModal">
                <i class="fas fa-plug"></i>
                <br />
                <span>{{Tester la connexion}}</span>
            </div>
            <div class="cursor" id="bt_openHistoryModal" style="background-color:#4d4d4d;">
                <i class="fas fa-history"></i>
                <br />
                <span>{{Historique}}</span>
            </div>
            <div class="cursor expertModeVisible" id="bt_pluginConfiguration" style="background-color:#767676;">
                <i class="fas fa-cogs"></i>
                <br />
                <span>{{Configuration}}</span>
            </div>
        </div>

        <legend><i class="fas fa-tasks"></i> {{Processus en cours}}</legend>

        <div id="activeProcessesContainer">
            <div id="noActiveProcesses" class="alert alert-info" style="display:none;">
                {{Aucun processus en cours}}
            </div>
            <div id="activeProcessesTableContainer" style="display:none;">
                <table class="table table-condensed table-striped">
                    <thead>
                        <tr>
                            <th style="width:150px">{{Connexion}}</th>
                            <th style="width:100px">{{Type}}</th>
                            <th style="width:100px">{{Utilisateur}}</th>
                            <th style="width:80px">{{Adresse}}</th>
                            <th style="width:150px">{{Phase}}</th>
                            <th style="width:120px">{{Progression}}</th>
                            <th style="width:150px">{{Démarré}}</th>
                            <th style="width:80px">{{Actions}}</th>
                        </tr>
                    </thead>
                    <tbody id="activeProcessesTable"></tbody>
                </table>
            </div>
        </div>

        <legend><i class="fas fa-info-circle"></i> {{Informations}}</legend>

        <div class="alert alert-info" style="padding: 20px;">
            <h4>{{Plugin Fidelix Updater}}</h4>
            <p>{{Ce plugin permet de mettre à jour le firmware et le software des modules Fidelix Multi24 ainsi que les écrans tactiles Display via Modbus RTU ou TCP.}}</p>

            <h5><i class="fas fa-cog"></i> {{Fonctionnalités}}</h5>
            <ul>
                <li>{{Mise à jour firmware Multi24 (fichier .hex*)}}</li>
                <li>{{Mise à jour software Multi24 (fichier .M24IEC)}}</li>
                <li>{{Mise à jour firmware Display (fichier .hex*)}}</li>
                <li>{{Mise à jour graphics Display (fichier .dat*)}}</li>
                <li>{{Suivi de progression en temps réel}}</li>
                <li>{{Mécanisme de récupération automatique en cas d'échec}}</li>
                <li>{{Support Modbus RTU sur RS485 (vitesse configurable : 9600-115200 bauds)}}</li>
                <li>{{Support Modbus TCP via convertisseur Ethernet}}</li>
            </ul>
        </div>
    </div>
</div>

<script>
// Process monitoring and management
var refreshInterval = null;

$(function() {
    console.log('fidelixUpdater plugin loaded');

    // Initial load
    refreshProcesses();

    // Auto-refresh every 20 seconds
    refreshInterval = setInterval(refreshProcesses, 20000);
});

function refreshProcesses() {
    $.ajax({
        type: 'POST',
        url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
        data: {
            action: 'getProcesses'
        },
        dataType: 'json',
        success: function(data) {
            if (data.state === 'ok') {
                updateActiveProcessesTable(data.result.active);
            }
        },
        error: function(xhr, status, error) {
            console.error('Failed to refresh processes:', error);
        }
    });
}

function updateActiveProcessesTable(processes) {
    var $table = $('#activeProcessesTable');
    var $noActive = $('#noActiveProcesses');
    var $container = $('#activeProcessesTableContainer');

    if (!processes || processes.length === 0) {
        $container.hide();
        $noActive.show();
        $table.empty();
        return;
    }

    $noActive.hide();
    $container.show();

    // Track existing rows
    var existingRows = {};
    $table.find('tr').each(function() {
        var updateId = $(this).data('updateId');
        if (updateId) {
            existingRows[updateId] = $(this);
        }
    });

    // Track which processes we've seen
    var currentProcessIds = {};

    processes.forEach(function(process) {
        currentProcessIds[process.updateId] = true;

        var progressClass = 'info';
        if (process.isZombie) {
            progressClass = 'warning';
        }
        if (!process.pidExists) {
            progressClass = 'danger';
        }

        // Display connection info based on type
        var connectionInfo = '';
        if (process.connectionType === 'tcp') {
            connectionInfo = '<i class="fas fa-network-wired" title="TCP"></i> ' + process.tcpHost + ':' + process.tcpPort;
        } else {
            var portShort = process.port ? process.port.split('/').pop() : '-';
            connectionInfo = '<i class="fas fa-usb" title="RTU"></i> ' + portShort;
        }
        var typeLabel = 'Software';
        if (process.type === 'm24firmware') {
            typeLabel = 'FW Multi24';
        } else if (process.type === 'm24software') {
            typeLabel = 'SW Multi24';
        } else if (process.type === 'displayfirmware') {
            typeLabel = 'FW Display';
        } else if (process.type === 'displaygraphics') {
            typeLabel = 'GFX Display';
        }
        var addressLabel = process.address;
        if (process.subaddress) {
            addressLabel += ' → ' + process.subaddress;
        }

        var startTime = formatDate(process.startTime);
        var progressBar = '<div class="progress" style="margin-bottom:0;">' +
            '<div class="progress-bar progress-bar-' + progressClass + '" style="width:' + process.progress + '%">' +
            process.progress + '%' +
            '</div>' +
            '</div>';

        var statusBadge = '';
        if (process.isZombie) {
            statusBadge = '<span class="label label-warning" style="margin-left:5px;" title="Aucune mise à jour depuis 5+ minutes">Zombie</span>';
        }
        if (!process.pidExists) {
            statusBadge = '<span class="label label-danger" style="margin-left:5px;" title="Le PID n\'existe plus">PID mort</span>';
        }

        var killBtn = '<button class="btn btn-danger btn-xs" onclick="killProcess(\'' + process.updateId + '\')" title="Arrêter le processus">' +
            '<i class="fas fa-stop"></i>' +
            '</button>';

        // Check if row exists
        if (existingRows[process.updateId]) {
            // Update existing row
            var $row = existingRows[process.updateId];
            $row.find('td:eq(0)').html(connectionInfo);
            $row.find('td:eq(4)').html(process.phase + statusBadge);
            $row.find('td:eq(5)').html(progressBar);
            $row.find('td:eq(6)').html(startTime);
        } else {
            // Create new row
            var row = '<tr data-update-id="' + process.updateId + '">' +
                '<td>' + connectionInfo + '</td>' +
                '<td>' + typeLabel + '</td>' +
                '<td>' + (process.username || '-') + '</td>' +
                '<td>' + addressLabel + '</td>' +
                '<td>' + process.phase + statusBadge + '</td>' +
                '<td>' + progressBar + '</td>' +
                '<td>' + startTime + '</td>' +
                '<td>' + killBtn + '</td>' +
                '</tr>';
            $table.append(row);
        }
    });

    // Remove rows for processes that no longer exist
    for (var updateId in existingRows) {
        if (!currentProcessIds[updateId]) {
            existingRows[updateId].remove();
        }
    }
}

function killProcess(updateId) {
    if (!confirm('Voulez-vous vraiment arrêter ce processus ?\n\nAttention : cela peut laisser le module dans un état instable.')) {
        return;
    }

    $.ajax({
        type: 'POST',
        url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
        data: {
            action: 'killProcess',
            updateId: updateId
        },
        dataType: 'json',
        success: function(data) {
            if (data.state === 'ok') {
                $('#div_alert').showAlert({
                    message: 'Processus arrêté avec succès',
                    level: 'success'
                });
                refreshProcesses();
            } else {
                $('#div_alert').showAlert({
                    message: data.result,
                    level: 'danger'
                });
            }
        },
        error: function(xhr, status, error) {
            $('#div_alert').showAlert({
                message: 'Erreur lors de l\'arrêt du processus : ' + error,
                level: 'danger'
            });
        }
    });
}

function formatDate(dateString) {
    if (!dateString) return '-';

    var date = new Date(dateString);
    var now = new Date();

    var diff = Math.floor((now - date) / 1000);

    if (diff < 60) {
        return 'Il y a ' + diff + 's';
    } else if (diff < 3600) {
        return 'Il y a ' + Math.floor(diff / 60) + 'min';
    } else if (diff < 86400) {
        return 'Il y a ' + Math.floor(diff / 3600) + 'h';
    } else {
        var day = ('0' + date.getDate()).slice(-2);
        var month = ('0' + (date.getMonth() + 1)).slice(-2);
        var hours = ('0' + date.getHours()).slice(-2);
        var minutes = ('0' + date.getMinutes()).slice(-2);
        return day + '/' + month + ' ' + hours + ':' + minutes;
    }
}

function formatDuration(startString, endString) {
    if (!startString || !endString) return '-';

    var start = new Date(startString);
    var end = new Date(endString);
    var diff = Math.floor((end - start) / 1000);

    if (diff < 60) {
        return diff + 's';
    } else if (diff < 3600) {
        var minutes = Math.floor(diff / 60);
        var seconds = diff % 60;
        return minutes + 'min ' + seconds + 's';
    } else {
        var hours = Math.floor(diff / 3600);
        var minutes = Math.floor((diff % 3600) / 60);
        return hours + 'h ' + minutes + 'min';
    }
}

function escapeHtml(text) {
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Modal openers
$('#bt_openUpdateModal').on('click', function() {
    $('#md_modal').dialog({
        title: "{{Mise à jour Fidelix Multi24}}",
        width: 900,
        height: 600
    });
    $('#md_modal').load('index.php?v=d&plugin=fidelixUpdater&modal=modal.update').dialog('open');
});

$('#bt_openTestModal').on('click', function() {
    $('#md_modal').dialog({
        title: "{{Test de connexion}}",
        width: 900,
        height: 700
    });
    $('#md_modal').load('index.php?v=d&plugin=fidelixUpdater&modal=modal.test').dialog('open');
});

$('#bt_openHistoryModal').on('click', function() {
    $('#md_modal').dialog({
        title: "{{Historique des mises à jour}}",
        width: 1000,
        height: 600
    });
    $('#md_modal').load('index.php?v=d&plugin=fidelixUpdater&modal=modal.history').dialog('open');
});

$('#bt_pluginConfiguration').on('click', function() {
    window.location.href = 'index.php?v=d&p=plugin&id=fidelixUpdater';
});
</script>
