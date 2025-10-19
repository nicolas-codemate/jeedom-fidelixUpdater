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
        </div>

        <legend><i class="fas fa-info-circle"></i> {{Informations}}</legend>

        <!-- Précautions importantes -->
        <div class="alert alert-danger" style="margin-bottom: 20px;">
            <h4><i class="fas fa-exclamation-triangle"></i> {{Précautions importantes}}</h4>
            <ul style="margin-bottom: 0;">
                <li><strong>{{La mise à jour peut prendre de 5 à 15 minutes}}</strong></li>
                <li><strong>{{Ne pas déconnecter le module pendant la mise à jour}}</strong></li>
                <li>{{Assurez-vous que l'adresse Modbus du module est correcte (1-247)}}</li>
                <li>{{Le module redémarrera automatiquement après la mise à jour}}</li>
            </ul>
        </div>

        <!-- Informations générales -->
        <div class="alert alert-info">
            <h4>{{Plugin Fidelix Updater}}</h4>
            <p>{{Ce plugin permet de mettre à jour le firmware et le software des modules Fidelix Multi24 via Modbus RTU.}}</p>

            <h5><i class="fas fa-cog"></i> {{Fonctionnalités}}</h5>
            <ul>
                <li>{{Mise à jour firmware (fichier .hex)}}</li>
                <li>{{Mise à jour software (fichier .M24IEC)}}</li>
                <li>{{Suivi de progression en temps réel}}</li>
                <li>{{Mécanisme de récupération automatique en cas d'échec}}</li>
                <li>{{Support Modbus RTU sur RS485 (57600 bauds)}}</li>
            </ul>

            <h5><i class="fas fa-wrench"></i> {{Configuration requise}}</h5>
            <ul>
                <li>{{Node.js installé sur le système (version 12+)}}</li>
                <li>{{Accès au port série USB (permissions dialout pour www-data)}}</li>
                <li>{{Connexion RS485 au module Fidelix Multi24}}</li>
            </ul>
        </div>
    </div>
</div>

<script>
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
</script>
