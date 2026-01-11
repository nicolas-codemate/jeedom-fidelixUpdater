# Plan: Refactorisation Transport Abstraction Layer

## Statut: IMPLÉMENTÉ (2025-01)

Les phases 1-5 ont été implémentées. La phase 6 (nettoyage) est optionnelle et sera
faite après validation client.

### Fichiers créés:
- `FxLib/FxUtils/FxTransport.js` - Classe de base abstraite pour les transports
- `FxLib/FxUtils/FxTcpTransparent.js` - Transport TCP transparent (wrapper de FxTcpSocket)

### Fichiers modifiés:
- `FxLib/FxUtils/index.js` - Export des nouvelles classes
- `FxLib/FxModbus/FxModbusRTUMaster.js` - Support transport externe via setTransport()
- `FxLib/FxMulti24/FxDevice.js` - Méthode setTransportType('serial'|'tcp-transparent')
- `FxLib/FxM24Update.js` - Utilise l'abstraction transport pour tcp-transparent

### Fichiers dépréciés (gardés pour compatibilité MBAP):
- `FxLib/FxMulti24/FxDeviceTCP.js`
- `FxLib/FxMulti24/FxSwUpdateTCP.js`
- `FxLib/FxMulti24/FxFwUpdateTCP.js`

---

## Décisions
- **Mode TCP**: Garder les deux modes (standard MBAP + transparent)
- **Approche**: Incrémentale (garder l'ancien code fonctionnel pendant la transition)

## Contexte

Le mode TCP transparent envoie des trames RTU identiques via TCP au lieu du port série.
Actuellement, le code est dupliqué à ~80-95% entre les versions RTU et TCP.

**Architecture actuelle:**
```
RTU:  FxSerial → FxModbusRTUMaster → FxDevice → FxSwUpdate/FxFwUpdate
TCP:  FxTcpSocket → FxModbusTCPMaster → FxDeviceTCP → FxSwUpdateTCP/FxFwUpdateTCP
```

## Approche Recommandée

**Créer une abstraction transport** pour que les classes RTU existantes puissent fonctionner
avec n'importe quel transport (série ou TCP transparent).

### Nouvelle Architecture (Mode Transparent)

```
ITransport (interface commune)
├── FxSerial (transport série)
└── FxTcpTransparent (transport TCP transparent - nouveau)

FxModbusRTUMaster (accepte ITransport)
    ↓
FxDevice (agnostique transport)
    ↓
FxSwUpdate / FxFwUpdate (agnostique transport)
```

### Mode TCP Standard (inchangé)
```
FxTcpSocket → FxModbusTCPMaster (MBAP header) → usage direct
```

## Fichiers à Modifier

### 1. Créer l'interface transport commune
**Fichier:** `FxLib/FxUtils/FxTransport.js` (nouveau)

```javascript
// Interface commune pour Serial et TCP Transparent
class FxTransport extends EventEmitter {
    open(connectionString, options) → Promise
    close() → Promise
    write(buffer, offset, length) → Promise
    isOpen → boolean
    // Events: 'receive', 'connect', 'disconnect', 'error'
}
```

### 2. Adapter FxSerial
**Fichier:** `FxLib/FxUtils/FxSerial.js`
- Ajouter `extends FxTransport`
- S'assurer que l'interface est compatible

### 3. Créer FxTcpTransparent
**Fichier:** `FxLib/FxUtils/FxTcpTransparent.js` (nouveau)
- Wrapper autour de FxTcpSocket
- Implémente la même interface que FxSerial
- Mode transparent uniquement (pas de MBAP header)

### 4. Modifier FxModbusRTUMaster
**Fichier:** `FxLib/FxModbus/FxModbusRTUMaster.js`
- Accepter un transport injecté au lieu d'hériter de FxSerial
- Ou: permettre de spécifier le type de transport à la construction

### 5. Modifier FxDevice
**Fichier:** `FxLib/FxMulti24/FxDevice.js`
- Accepter une option `transport: 'serial' | 'tcp'`
- Créer le bon transport en fonction de l'option

### 6. Adapter FxM24Update.js
**Fichier:** `FxLib/FxM24Update.js`
- Pour TCP transparent: utiliser FxDevice/FxSwUpdate/FxFwUpdate avec transport TCP
- Éliminer l'utilisation de FxDeviceTCP/FxSwUpdateTCP/FxFwUpdateTCP en mode transparent

## Fichiers à Supprimer (Phase finale)

Une fois la refactorisation validée et testée:
- `FxDeviceTCP.js` - remplacé par FxDevice + transport TCP
- `FxSwUpdateTCP.js` - remplacé par FxSwUpdate + transport TCP
- `FxFwUpdateTCP.js` - remplacé par FxFwUpdate + transport TCP

**Conserver:** `FxModbusTCPMaster.js` pour le mode TCP standard (MBAP header).

## Étapes d'Implémentation (Incrémentale)

### Phase 1: Créer l'abstraction transport (sans casser l'existant)
1. Créer `FxTransport.js` - interface de base EventEmitter
2. Créer `FxTcpTransparent.js` - wrapper TCP avec même interface que FxSerial
3. **Test**: Vérifier que FxTcpTransparent peut ouvrir/fermer une connexion TCP

### Phase 2: Adapter FxModbusRTUMaster (compatible rétro)
1. Ajouter méthode `setTransport(transport)`
2. Si transport externe fourni, l'utiliser au lieu de FxSerial interne
3. **Test**: Mode série fonctionne toujours (régression)
4. **Test**: Mode TCP transparent fonctionne via setTransport()

### Phase 3: Adapter FxDevice (compatible rétro)
1. Ajouter option `transportType: 'serial' | 'tcp-transparent'`
2. Créer le transport approprié selon l'option
3. **Test**: FxDevice fonctionne en série
4. **Test**: FxDevice fonctionne en TCP transparent

### Phase 4: Adapter FxSwUpdate et FxFwUpdate
1. Héritent automatiquement du support transport de FxDevice
2. **Test**: Software update série
3. **Test**: Software update TCP transparent (Display graphics passthrough)

### Phase 5: Intégration FxM24Update
1. Pour `connectionType: 'tcp-transparent'`:
   - Utiliser FxDevice/FxSwUpdate/FxFwUpdate avec transport TCP
   - NE PLUS utiliser FxDeviceTCP/FxSwUpdateTCP/FxFwUpdateTCP
2. Pour `connectionType: 'tcp'` (mode standard):
   - Continuer à utiliser FxModbusTCPMaster directement
3. **Tests complets**:
   - [ ] RTU série direct
   - [ ] RTU série passthrough
   - [ ] TCP transparent direct
   - [ ] TCP transparent passthrough
   - [ ] TCP standard (si utilisé)

### Phase 6: Nettoyage (optionnel, après validation client)
1. Supprimer FxDeviceTCP.js, FxSwUpdateTCP.js, FxFwUpdateTCP.js
2. Supprimer code mort dans FxModbusTCPMaster.js (doTransactionRTU, etc.)
3. Mettre à jour documentation

## Risques et Mitigations

| Risque | Mitigation |
|--------|------------|
| Régression RTU série | Tests avant/après sur hardware |
| Breaking changes API | Garder compatibilité FxM24Update |
| Bugs subtils timing | Comparer logs RTU vs TCP transparent |

## Vérification

### Tests manuels à effectuer (avec ton écran local):
1. **RTU Série** (si disponible): M24 software update
2. **TCP Transparent Direct**: M24 software update (adresse 1)
3. **TCP Transparent Passthrough**: Display graphics (1 → 10)
4. **TCP Standard** (optionnel): Vérifier que le mode MBAP fonctionne encore

### Comment tester:
```bash
# Logs en temps réel
tail -f /srv/plugins/fidelixUpdater/data/logs/nodejs_stdout_*.log

# Vérifier les trames envoyées (doivent être identiques RTU vs TCP transparent)
grep "TX:" /srv/plugins/fidelixUpdater/data/logs/nodejs_stdout_*.log
```

### Critères de succès:
- [ ] RTU série fonctionne (pas de régression)
- [ ] TCP transparent passthrough fonctionne (Display graphics)
- [ ] TCP standard fonctionne (si utilisé)
- [ ] Code dupliqué réduit de >50%
- [ ] Pas de différence dans les trames RTU vs TCP transparent

### Estimation effort:
- Phase 1-2: ~2h (abstraction transport + Modbus)
- Phase 3-4: ~2h (Device + Update classes)
- Phase 5: ~1h (intégration FxM24Update)
- Phase 6: ~30min (nettoyage)
- **Total: ~5-6h**