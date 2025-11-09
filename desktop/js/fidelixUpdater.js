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

// fidelixUpdater desktop JavaScript
// Process monitoring and management

var refreshInterval = null;

$(function() {
    console.log('fidelixUpdater plugin loaded');

    // Initial load
    refreshProcesses();

    // Auto-refresh every 3 seconds
    refreshInterval = setInterval(refreshProcesses, 3000);
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
                updateHistoryTable(data.result.history);
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
        return;
    }

    $noActive.hide();
    $container.show();

    $table.empty();

    processes.forEach(function(process) {
        var progressClass = 'info';
        if (process.isZombie) {
            progressClass = 'warning';
        }
        if (!process.pidExists) {
            progressClass = 'danger';
        }

        var portShort = process.port.split('/').pop();
        var typeLabel = process.type === 'm24firmware' ? 'Firmware' : 'Software';
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

        var row = '<tr>' +
            '<td>' + portShort + '</td>' +
            '<td>' + typeLabel + '</td>' +
            '<td>' + addressLabel + '</td>' +
            '<td>' + process.phase + statusBadge + '</td>' +
            '<td>' + progressBar + '</td>' +
            '<td>' + startTime + '</td>' +
            '<td>' + killBtn + '</td>' +
            '</tr>';

        $table.append(row);
    });
}

function updateHistoryTable(processes) {
    var $table = $('#processHistoryTable');
    var $noHistory = $('#noHistoryProcesses');
    var $container = $('#historyTableContainer');

    if (!processes || processes.length === 0) {
        $container.hide();
        $noHistory.show();
        return;
    }

    $noHistory.hide();
    $container.show();

    $table.empty();

    processes.forEach(function(process) {
        var statusClass = 'default';
        var statusLabel = process.status;

        if (process.status === 'completed') {
            statusClass = 'success';
            statusLabel = 'Terminé';
        } else if (process.status === 'failed') {
            statusClass = 'danger';
            statusLabel = 'Échoué';
        } else if (process.status === 'killed') {
            statusClass = 'warning';
            statusLabel = 'Arrêté';
        }

        var portShort = process.port.split('/').pop();
        var typeLabel = process.type === 'm24firmware' ? 'Firmware' : 'Software';
        var addressLabel = process.address;
        if (process.subaddress) {
            addressLabel += ' → ' + process.subaddress;
        }

        var startTime = formatDate(process.startTime);
        var endTime = process.endTime ? formatDate(process.endTime) : '-';
        var duration = process.endTime ? formatDuration(process.startTime, process.endTime) : '-';

        var statusBadge = '<span class="label label-' + statusClass + '">' + statusLabel + '</span>';

        var progressText = process.progress + '%';
        if (process.error) {
            progressText += ' <i class="fas fa-exclamation-circle text-danger" title="' + escapeHtml(process.error) + '"></i>';
        }

        var row = '<tr>' +
            '<td>' + portShort + '</td>' +
            '<td>' + typeLabel + '</td>' +
            '<td>' + addressLabel + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + progressText + '</td>' +
            '<td>' + startTime + '</td>' +
            '<td>' + endTime + '</td>' +
            '<td>' + duration + '</td>' +
            '</tr>';

        $table.append(row);
    });
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
