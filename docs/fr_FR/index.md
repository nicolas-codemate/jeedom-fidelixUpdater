# Documentation Fidelix Updater

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Utilisation détaillée](#utilisation-détaillée)
- [Architecture asynchrone](#architecture-asynchrone)
- [Communication Modbus](#communication-modbus)
- [Historique des mises à jour](#historique-des-mises-à-jour)
- [Gestion des processus](#gestion-des-processus)
- [Lock des ports série](#lock-des-ports-série)
- [Dépannage](#dépannage)

---

## Vue d'ensemble

Fidelix Updater est un plugin Jeedom permettant de mettre à jour le firmware et le software des automates **Fidelix Multi24** via le protocole Modbus RTU.

**Emplacement dans Jeedom :** Le plugin se trouve dans le menu **Plugins → Programmation → Fidelix Updater**

### Architecture générale

```
┌─────────────┐       RS485        ┌──────────────┐
│   Jeedom    │◄──────────────────►│ Multi24 #1   │
│  (Plugin)   │   Modbus RTU       │  (Maître)    │
└─────────────┘   57600 bauds      └──────────────┘
                                            │
                                            │ Modbus esclave
                                            ▼
                                    ┌──────────────┐
                                    │ Multi24 #2   │
                                    │  (Esclave)   │
                                    └──────────────┘
```

### Types de mise à jour

- **Firmware** (`.hex`) : Bootloader et système bas niveau
- **Software** (`.M24IEC`) : Application embarquée

---

## Utilisation détaillée

### Accès au plugin

1. Depuis le menu Jeedom : **Plugins → Programming → Fidelix Updater**
2. Cliquer sur le bouton **"Mettre à jour Firmware/Software"**

![Capture - Page principale du plugin](./images/main_page.png)

### Configuration d'une mise à jour

#### 1. Sélection du type de mise à jour

Choisir entre :
- **Firmware** : Accepte uniquement les fichiers `.hex`
- **Software** : Accepte uniquement les fichiers `.M24IEC`

![Capture - Modal de mise à jour](./images/update_modal.png)

#### 2. Upload du fichier

- Taille maximale : **10 Mo**
- Le fichier est uploadé dans `data/filetransfer/`
- Validation automatique de l'extension

#### 3. Configuration des paramètres

**Adresse Modbus :**
- Valeur entre **1** et **247**
- Correspond à l'adresse du module cible
- Pour une mise à jour directe : laisser "Sous-adresse" vide

**Sous-adresse (optionnel) :**
- Pour le mode **pass-through** uniquement
- Permet d'atteindre un module esclave via un maître
- Exemple : Adresse=1, Sous-adresse=10 → mise à jour du module esclave #10 via le maître #1

**Port série :**
- Sélection dans la liste des ports disponibles
- Préférer `/dev/serial/by-id/...` pour éviter les changements au redémarrage
- Le port doit être accessible (permissions dialout)

#### 4. Lancement de la mise à jour

Cliquer sur **"Démarrer la mise à jour"**

Le plugin :
1. Génère un ID unique pour cette mise à jour
2. Crée un fichier de statut `status_{updateId}.json`
3. Lance le processus Node.js en arrière-plan
4. Retourne immédiatement (mode asynchrone)
5. Démarre le polling automatique de progression

---

## Architecture asynchrone

### Pourquoi l'asynchrone ?

Les mises à jour peuvent durer **5 à 15 minutes** pour le firmware, et **3 à 8 minutes** pour le software. Un processus synchrone causerait :
- ⚠️ Timeout HTTP (serveur web)
- ⚠️ Interface bloquée
- ⚠️ Impossibilité d'annuler
- ⚠️ Aucun feedback en temps réel

### Fonctionnement du mode asynchrone

```
┌─────────────┐                           ┌──────────────┐
│   Browser   │ 1. startUpdate (AJAX)    │  PHP Handler │
│             │─────────────────────────►│              │
└─────────────┘                           └──────────────┘
      │                                          │
      │                                          │ 2. Create status file
      │                                          │    Generate updateId
      │                                          │    Launch Node.js &
      │                                          │    Return immediately
      │                                          ▼
      │ 3. Returns {updateId, statusFile}  ┌──────────────┐
      │◄────────────────────────────────── │              │
      │                                     │  Background  │
      │ 4. Start polling (every 2s)        │   Node.js    │
      │                                     └──────────────┘
      │                                          │
      │                                          │ Writes progress
      │                                          │ every update
      │                                          ▼
      │ 5. getStatus (polling)             ┌──────────────┐
      │◄─────────────────────────────────┐ │ status.json  │
      │  Returns {phase, progress, error} │ │  {          │
      │                                    │ │   phase,    │
      │ 6. Update UI                       │ │   progress, │
      │    Display real progress           │ │   error     │
      │                                    │ │  }          │
      │    Stop when progress=100          │ └──────────────┘
      │    or error != null                │
      └────────────────────────────────────┘
```

### Fichier de statut

Format JSON du fichier `data/status/status_{updateId}.json` :

```json
{
  "phase": "Programming",
  "status": "Programming device... packet 45/128",
  "progress": 35,
  "timestamp": "2025-11-09T18:30:15+00:00",
  "error": null
}
```

**Phases possibles :**
- `"Starting"` : Initialisation
- `"Connecting"` : Connexion au module
- `"Preparing"` : Préparation de la mise à jour
- `"Programming"` : Programmation en cours
- `"Verifying"` : Vérification
- `"Completed"` : Terminé avec succès
- `"ERROR"` : Erreur (avec `error` != null)

### Polling JavaScript

**Fréquence :** Toutes les **2 secondes**

**Arrêt automatique :**
- Quand `progress >= 100`
- Quand `error != null`
- Après timeout (30 minutes max)

**Cleanup :**
- Suppression automatique du fichier de statut
- Suppression du script Node.js temporaire
- Exécuté après succès ou erreur

![Capture - Progression en temps réel](./images/progress_bar.png)

---

## Communication Modbus

### Protocole utilisé

- **Type :** Modbus RTU
- **Interface :** RS485 (2 fils : A et B)
- **Vitesse :** 57600 bauds
- **Bits de données :** 8
- **Parité :** Aucune
- **Bits d'arrêt :** 1

### Configuration série

**Format de configuration :**
```
57600 8N1
```

**Adaptateur RS485 requis :**
- USB vers RS485
- Pilote FTDI recommandé
- Auto-détecté dans `/dev/serial/by-id/`

### Timeouts et retries

**Timeouts :**
- Timeout standard : **3000 ms** (3 secondes)
- Timeout pattern : **3000 ms**

**Retries :**
- Nombre de tentatives : **10**
- Délai entre tentatives critiques : **500 ms**

Ces valeurs ont été optimisées pour assurer une fiabilité maximale des mises à jour.

### Mode pass-through

Le mode pass-through permet d'atteindre un module **esclave** en passant par un module **maître**.

**Fonctionnement :**

1. La trame Modbus est envoyée au **maître** (adresse principale)
2. Le maître **incrémente** l'adresse de +1 et **relaye** sur son bus esclave
3. L'esclave répond au maître
4. Le maître **décrémente** l'adresse de -1 et renvoie à Jeedom

**Exemple :**
```
Adresse : 1 (maître)
Sous-adresse : 10 (esclave cible)

→ Trame envoyée à l'adresse 1
→ Maître relaye à l'adresse 11 (10+1)
→ Esclave à l'adresse réelle 10 répond
→ Maître renvoie avec adresse 10 (11-1)
```

---

## Historique des mises à jour

Le plugin conserve un **historique JSON** de toutes les mises à jour effectuées.

### Fichier d'historique

**Emplacement :** `data/update_history.json`

**Format :**
```json
[
  {
    "id": "update_6730a1b2c4567",
    "timestamp": "2025-11-09T18:45:32+00:00",
    "type": "m24firmware",
    "filename": "Multi24-v2.81.hex",
    "address": 1,
    "subaddress": null,
    "port": "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A9D5YQVH-if00-port0",
    "status": "success",
    "duration": 847,
    "error": null
  },
  {
    "id": "update_6730a3f1d8912",
    "timestamp": "2025-11-09T19:12:15+00:00",
    "type": "m24software",
    "filename": "Program_v1.5.M24IEC",
    "address": 1,
    "subaddress": 10,
    "port": "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A9D5YQVH-if00-port0",
    "status": "error",
    "duration": 124,
    "error": "Timeout waiting for device response"
  }
]
```

### Affichage de l'historique

L'historique est affiché sur la page principale du plugin avec :
- ✅ Icône de succès/erreur
- 📅 Date et heure
- 📦 Type de mise à jour
- 📄 Nom du fichier
- 🎯 Adresse(s) cible(s)
- ⏱️ Durée
- ❌ Message d'erreur si échec

![Capture - Historique des mises à jour](./images/update_history.png)

### Nettoyage automatique

L'historique est automatiquement limité aux **100 dernières entrées** pour éviter une croissance excessive du fichier.

---

## Gestion des processus

### Liste des processus actifs

Le plugin affiche en temps réel tous les **processus de mise à jour en cours**.

**Informations affichées :**
- 🆔 ID du processus
- 📦 Type (firmware/software)
- 🎯 Adresse cible
- 📊 Progression (%)
- ⏱️ Durée écoulée
- 📍 Phase actuelle

![Capture - Processus actifs](./images/active_processes.png)

### Fichier de suivi des processus

**Emplacement :** `data/processes.json`

**Format :**
```json
{
  "update_6730a1b2c4567": {
    "pid": 12345,
    "startTime": "2025-11-09T18:45:32+00:00",
    "type": "m24firmware",
    "address": 1,
    "subaddress": null,
    "port": "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A9D5YQVH-if00-port0",
    "statusFile": "status_6730a1b2c4567.json",
    "phase": "Programming",
    "progress": 35
  }
}
```

### Kill d'un processus

**Quand utiliser :**
- ⚠️ Mise à jour bloquée
- ⚠️ Erreur persistante
- ⚠️ Besoin d'annuler la mise à jour

**Fonctionnement :**

1. Cliquer sur le bouton **"Tuer le processus"** dans la liste des processus actifs
2. Le plugin exécute un **SIGTERM** (arrêt propre)
3. Si le processus ne s'arrête pas après 5 secondes : **SIGKILL** (arrêt forcé)
4. Suppression du fichier de statut
5. Suppression du script temporaire
6. Retrait de la liste des processus actifs

**⚠️ Attention :**
- Le module peut rester en **mode programmation** après un kill
- Il faut alors utiliser le **mécanisme de récupération** (redémarrage du module)

![Capture - Kill d'un processus](./images/kill_process.png)

---

## Lock des ports série

### Pourquoi un système de lock ?

Un port série **ne peut être utilisé que par un seul processus à la fois**. Sans système de lock :
- ❌ Deux mises à jour simultanées sur le même port → conflit
- ❌ Corruption des données
- ❌ Blocage des processus

### Mécanisme de lock

**Fichier de lock :** `data/locks/port_{port_hash}.lock`

**Format :**
```json
{
  "port": "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A9D5YQVH-if00-port0",
  "updateId": "update_6730a1b2c4567",
  "lockedAt": "2025-11-09T18:45:32+00:00",
  "pid": 12345
}
```

### Workflow de lock

**Avant de démarrer une mise à jour :**

1. Calcul du hash du port série
2. Vérification de l'existence du fichier de lock
3. Si lock existe :
   - Vérifier si le PID est toujours actif
   - Si PID mort → supprimer le lock (lock orphelin)
   - Si PID actif → **refuser la mise à jour**
4. Si pas de lock → créer le lock et continuer

**Après la mise à jour :**

1. Suppression automatique du fichier de lock
2. Libération du port pour d'autres processus

### Gestion des locks orphelins

Un **lock orphelin** se produit si :
- Le processus a crashé
- Le serveur a redémarré
- Un kill brutal a été effectué

**Détection automatique :** Le plugin vérifie si le PID associé au lock est toujours actif. Si le PID n'existe plus, le lock orphelin est automatiquement supprimé.

---

## Dépannage

### Le diagnostic affiche des erreurs

**Solution :** Utiliser le bouton **"Reconfigurer les permissions"** sur la page de configuration.

Ce bouton corrige automatiquement :
- Permissions du groupe dialout
- Installation des dépendances npm
- Permissions des ports série
- Permissions des dossiers du plugin

### Erreur "Port série déjà utilisé"

**Cause :** Un lock existe sur le port

**Solution :**
1. Vérifier la liste des processus actifs
2. Si pas de processus actif → lock orphelin
3. Forcer la suppression du lock depuis la page de configuration
4. Relancer la mise à jour

### La mise à jour reste bloquée à X%

**Solutions :**

1. **Attendre** : Certaines phases peuvent prendre plusieurs minutes
2. **Vérifier les logs Node.js** :
   ```bash
   tail -f /var/www/html/plugins/fidelixUpdater/3rdparty/Fidelix/FxLib/logsJeedom.txt
   ```
3. **Si vraiment bloqué** : Utiliser le bouton "Tuer le processus"
4. **Redémarrer le module** (couper/rallumer l'alimentation)
5. **Relancer la mise à jour**

### Le module ne répond plus après une mise à jour

**Cause :** Le module est resté en mode programmation

**Solution :**

1. Couper l'alimentation du module
2. Attendre 10 secondes
3. Rallumer le module
4. Le mécanisme de récupération intégré devrait restaurer le module
5. Si toujours bloqué : Relancer la mise à jour complète

### Logs à consulter

**Logs Jeedom :**
```bash
tail -f /var/www/html/log/fidelixUpdater
```

**Logs Node.js :**
```bash
tail -f /var/www/html/plugins/fidelixUpdater/3rdparty/Fidelix/FxLib/logsJeedom.txt
```

**Logs système (permissions) :**
```bash
tail -f /var/log/apache2/error.log
```

---

## Support technique

Pour toute question ou problème :

**Email :** nicolas@codemate.consulting
**GitHub :** [Issues](https://github.com/nicolas-codemate/jeedom-fidelixUpdater/issues)
