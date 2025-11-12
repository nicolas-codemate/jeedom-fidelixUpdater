<?php
if (!isConnect('admin')) {
    throw new Exception('{{401 - Accès non autorisé}}');
}

require_once dirname(__FILE__) . '/../../core/class/fidelixUpdater.class.php';

// Load history directly from processes.json (no AJAX needed)
$history = fidelixUpdater::getProcessHistory(50);
?>

<div id="div_historyContent">
    <?php if (empty($history)): ?>
        <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> {{Aucun historique de mise à jour disponible}}
        </div>
    <?php else: ?>
        <table class="table table-condensed table-striped">
            <thead>
                <tr>
                    <th style="width:130px">{{Port}}</th>
                    <th style="width:90px">{{Type}}</th>
                    <th style="width:90px">{{Adresse}}</th>
                    <th style="width:90px">{{Statut}}</th>
                    <th style="width:70px">{{Progression}}</th>
                    <th style="width:120px">{{Début}}</th>
                    <th style="width:120px">{{Fin}}</th>
                    <th style="width:80px">{{Durée}}</th>
                    <th style="width:100px">{{Actions}}</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($history as $process): ?>
                    <?php
                    $statusClass = 'default';
                    $statusLabel = $process['status'];

                    if ($process['status'] === 'completed') {
                        $statusClass = 'success';
                        $statusLabel = 'Terminé';
                    } elseif ($process['status'] === 'failed') {
                        $statusClass = 'danger';
                        $statusLabel = 'Échoué';
                    } elseif ($process['status'] === 'killed') {
                        $statusClass = 'warning';
                        $statusLabel = 'Arrêté';
                    }

                    $portShort = basename($process['port']);
                    $typeLabel = $process['type'] === 'm24firmware' ? 'Firmware' : 'Software';
                    $addressLabel = $process['address'];
                    if (!empty($process['subaddress'])) {
                        $addressLabel .= ' → ' . $process['subaddress'];
                    }

                    // Format dates
                    $startTime = date('d/m H:i', strtotime($process['startTime']));
                    $endTime = !empty($process['endTime']) ? date('d/m H:i', strtotime($process['endTime'])) : '-';

                    // Calculate duration
                    $duration = '-';
                    if (!empty($process['endTime'])) {
                        $start = strtotime($process['startTime']);
                        $end = strtotime($process['endTime']);
                        $diff = $end - $start;

                        if ($diff < 60) {
                            $duration = $diff . 's';
                        } elseif ($diff < 3600) {
                            $minutes = floor($diff / 60);
                            $seconds = $diff % 60;
                            $duration = $minutes . 'min ' . $seconds . 's';
                        } else {
                            $hours = floor($diff / 3600);
                            $minutes = floor(($diff % 3600) / 60);
                            $duration = $hours . 'h ' . $minutes . 'min';
                        }
                    }

                    $errorIcon = '';
                    if (!empty($process['error'])) {
                        $errorIcon = ' <i class="fas fa-exclamation-circle text-danger" title="' . htmlspecialchars($process['error']) . '"></i>';
                    }
                    ?>
                    <tr>
                        <td><?php echo $portShort; ?></td>
                        <td><?php echo $typeLabel; ?></td>
                        <td><?php echo $addressLabel; ?></td>
                        <td><span class="label label-<?php echo $statusClass; ?>"><?php echo $statusLabel; ?></span></td>
                        <td><?php echo $process['progress']; ?>%<?php echo $errorIcon; ?></td>
                        <td><?php echo $startTime; ?></td>
                        <td><?php echo $endTime; ?></td>
                        <td><?php echo $duration; ?></td>
                        <td>
                            <button class="btn btn-sm btn-default btn-view-logs" data-updateid="<?php echo $process['updateId']; ?>" title="{{Voir les logs techniques}}">
                                <i class="fas fa-file-alt"></i> {{Logs}}
                            </button>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<!-- Modal for displaying logs -->
<div id="md_viewLogs" style="display:none;">
    <div class="alert alert-info">
        <i class="fas fa-info-circle"></i> {{Logs techniques du processus}}
        <span id="viewLogsUpdateId" class="pull-right"></span>
    </div>

    <ul class="nav nav-tabs" role="tablist">
        <li role="presentation" class="active"><a href="#logsTab_stderr" role="tab" data-toggle="tab">{{Erreurs (stderr)}}</a></li>
        <li role="presentation"><a href="#logsTab_nodejs" role="tab" data-toggle="tab">{{Node.js (console)}}</a></li>
        <li role="presentation"><a href="#logsTab_jeedom" role="tab" data-toggle="tab">{{Jeedom}}</a></li>
    </ul>

    <div class="tab-content" style="margin-top: 10px;">
        <div role="tabpanel" class="tab-pane active" id="logsTab_stderr">
            <pre id="logContent_stderr" style="max-height:400px; overflow:auto; font-size:11px; background:#f5f5f5; padding:10px; border:1px solid #ddd;"></pre>
        </div>
        <div role="tabpanel" class="tab-pane" id="logsTab_nodejs">
            <pre id="logContent_nodejs" style="max-height:400px; overflow:auto; font-size:11px; background:#f5f5f5; padding:10px; border:1px solid #ddd;"></pre>
        </div>
        <div role="tabpanel" class="tab-pane" id="logsTab_jeedom">
            <pre id="logContent_jeedom" style="max-height:400px; overflow:auto; font-size:11px; background:#f5f5f5; padding:10px; border:1px solid #ddd;"></pre>
        </div>
    </div>
</div>

<script>
$(document).ready(function() {
    // Handle "View Logs" button click
    $('.btn-view-logs').on('click', function() {
        var updateId = $(this).data('updateid');

        // Load logs via AJAX
        $.ajax({
            type: 'POST',
            url: 'plugins/fidelixUpdater/core/ajax/fidelixUpdater.ajax.php',
            data: {
                action: 'getLogs',
                updateId: updateId
            },
            dataType: 'json',
            success: function(data) {
                if (data.state === 'ok') {
                    var logs = data.result.logs;
                    var process = data.result.process;

                    // Update modal title
                    $('#viewLogsUpdateId').text('Update ID: ' + process.updateId);

                    // Fill log tabs
                    $('#logContent_stderr').text(logs.stderr || '{{Aucun log stderr disponible}}');
                    $('#logContent_nodejs').text(logs.nodejs || '{{Aucun log Node.js disponible}}');
                    $('#logContent_jeedom').text(logs.jeedom || '{{Aucun log Jeedom disponible}}');

                    // Show modal
                    $('#md_viewLogs').dialog({
                        title: '{{Logs techniques}} - ' + (process.type === 'm24firmware' ? 'Firmware' : 'Software'),
                        width: 900,
                        height: 600,
                        modal: true,
                        closeText: ''  // Remove "Close" text, keep only X icon
                    }).dialog('open');
                } else {
                    $.fn.showAlert({message: '{{Erreur:}} ' + data.result, level: 'danger'});
                }
            },
            error: function(xhr, status, error) {
                $.fn.showAlert({message: '{{Erreur lors du chargement des logs:}} ' + error, level: 'danger'});
            }
        });
    });
});
</script>
