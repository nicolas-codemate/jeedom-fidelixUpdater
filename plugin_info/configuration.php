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
?>

<form class="form-horizontal">
    <fieldset>
        <div class="form-group">
            <label class="col-md-4 control-label">{{Configuration globale}}
                <sup><i class="fas fa-question-circle tooltips" title="{{Configuration du plugin Fidelix Updater}}"></i></sup>
            </label>
            <div class="col-md-4">
                <p>{{Aucune configuration globale nécessaire pour le moment.}}</p>
                <p>{{Le plugin utilise Node.js pour communiquer avec les modules Fidelix via Modbus RTU.}}</p>
            </div>
        </div>
    </fieldset>
</form>
