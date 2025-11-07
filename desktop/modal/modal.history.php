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
                    <th style="width:150px">{{Port}}</th>
                    <th style="width:100px">{{Type}}</th>
                    <th style="width:100px">{{Adresse}}</th>
                    <th style="width:100px">{{Statut}}</th>
                    <th style="width:80px">{{Progression}}</th>
                    <th style="width:150px">{{Début}}</th>
                    <th style="width:150px">{{Fin}}</th>
                    <th style="width:100px">{{Durée}}</th>
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
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>
