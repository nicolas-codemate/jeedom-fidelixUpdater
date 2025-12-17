# Fidelix Updater

Plugin Jeedom pour mettre à jour le firmware et le software des modules **Fidelix Multi24** via Modbus RTU.

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fnicolas-codemate%2Fjeedom-fidelixUpdater%2Fmain%2Fplugin_info%2Finfo.json&query=%24.pluginVersion&label=Version&color=blueviolet)](https://github.com/nicolas-codemate/jeedom-fidelixUpdater/releases)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Jeedom](https://img.shields.io/badge/Jeedom-4.2%2B-green)](https://www.jeedom.com)

---

## 📋 Table des matières

- [Présentation](#-présentation)
- [Fonctionnalités](#-fonctionnalités)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Utilisation](#-utilisation)
- [Mode Pass-Through](#-mode-pass-through)
- [Connexion TCP](#-connexion-tcp)
- [Documentation technique](#-documentation-technique)
- [Support](#-support)
- [Licence](#-licence)

---

## 🎯 Présentation

**Fidelix Updater** permet de mettre à jour à distance les automates Fidelix Multi24 directement depuis l'interface Jeedom.

**📍 Emplacement :** Le plugin se trouve dans le menu **Plugins → Programmation → Fidelix Updater**

### Types de mise à jour supportés

- **Firmware** (`.hex`) : Mise à jour du bootloader et du système bas niveau
- **Software** (`.M24IEC`) : Mise à jour de l'application embarquée

### Architecture technique

- **Communication** : Modbus RTU via RS485 (57600 bauds)
- **Backend** : PHP + Node.js (librairie officielle Fidelix)
- **Interface** : Modale web avec progression en temps réel
- **Mode d'exécution** : Asynchrone avec polling pour feedback instantané

---

## ✨ Fonctionnalités

✅ **Upload sécurisé** de fichiers firmware et software

✅ **Mise à jour asynchrone** sans blocage de l'interface

✅ **Progression en temps réel** avec barre de progression dynamique

✅ **Mécanisme de récupération** automatique en cas d'échec (anti-bricking)

✅ **Mode pass-through** pour mise à jour en chaîne (maître → esclave)

✅ **Fiabilité optimisée** (retries, timeouts, délais de sécurité)

✅ **Logs détaillés** pour diagnostic et débogage

---

## 📋 Prérequis

### Logiciels

- **Jeedom** version 4.2 ou supérieure
- **Node.js** version 12 ou supérieure
- Package Node.js `serialport` (installé automatiquement)

### Matériel

- **Connexion RS485** entre Jeedom et les modules Fidelix Multi24
- **Port série** accessible (`/dev/ttyUSB*` ou `/dev/serial/by-id/...`)

### Permissions système

L'utilisateur `www-data` doit avoir accès au port série :

```bash
sudo usermod -a -G dialout www-data
```

---

## 🔧 Installation

### 1. Installation du plugin

1. **Activer GitHub dans Jeedom**
   - Aller dans **Réglages → Système → Configuration**
   - Onglet **Mise à jour / Market**
   - Sous-onglet **GitHub**
   - Activer GitHub

2. **Ajouter le plugin depuis GitHub**
   - Aller dans **Plugins → Gestion des plugins**
   - Cliquer sur le bouton **"+"** (Ajouter un plugin)
   - Sélectionner **"Type de source : GitHub"**
   - Remplir le formulaire :

| Champ | Valeur |
|-------|--------|
| **ID logique du plugin** | `fidelixUpdater` |
| **Utilisateur ou organisation du dépôt** | `nicolas-codemate` |
| **Nom du dépôt** | `jeedom-fidelixUpdater` |
| **Token (facultatif)** | _(laisser vide)_ |
| **Branche** | `main` |

3. **Activer le plugin**
   - Le plugin apparaîtra dans la liste des plugins
   - Cliquer sur **"Activer"**

4. **Accéder à la configuration**
   - **Plugins → Programmation → Fidelix Updater → Configuration**

### 2. Diagnostic système

Accédez à la page de configuration du plugin pour vérifier que tous les prérequis sont satisfaits :

```
Jeedom → Plugins → Programming → Fidelix Updater → Configuration
```

Le diagnostic vérifie automatiquement :
- ✅ Node.js (version 12+)
- ✅ Groupe dialout (permissions port série)
- ✅ Dépendances npm (serialport, etc.)
- ✅ Ports série disponibles

### 3. Bouton "Reconfigurer les permissions"

Si le diagnostic affiche des erreurs ou avertissements, utilisez le bouton **"Reconfigurer les permissions"** disponible sur la page de configuration.

Ce bouton corrige automatiquement :
- Ajout de www-data au groupe dialout
- Installation des dépendances npm
- Permissions des ports série
- Permissions des dossiers du plugin

**Utilisation :** Cliquez sur le bouton, attendez 10-30 secondes, puis rechargez la page pour vérifier que tous les voyants sont verts.

---

## 📝 Utilisation

### Mise à jour simple (mode direct)

1. **Accéder au plugin**
   Jeedom → Plugins → Programming → **Fidelix Updater**

2. **Ouvrir l'interface de mise à jour**
   Cliquer sur le bouton **"Mettre à jour Firmware/Software"**

3. **Configurer la mise à jour**
   - **Type** : Firmware (.hex) ou Software (.M24IEC)
   - **Fichier** : Sélectionner le fichier de mise à jour
   - **Adresse** : Adresse Modbus du module (1-247)
   - **Port série** : Sélectionner le port RS485

4. **Lancer la mise à jour**
   Cliquer sur **"Démarrer la mise à jour"**

5. **Suivre la progression**
   La barre de progression se met à jour en temps réel (2-15 minutes selon la taille)

---

## 🔗 Mode Pass-Through

Le **mode pass-through** permet de mettre à jour un module **esclave** en passant **à travers** un module **maître**.

### Architecture réseau typique

```
JEEDOM (Maître Modbus ROUGE)
    │
    ├── Multi24 Maître #1 (Addr 1) ──┬── Modbus BLEU ──> Multi24 Esclave (Addr 10)
    │                                 ├── Modbus BLEU ──> Multi24 Esclave (Addr 11)
    │                                 └── Modbus BLEU ──> Multi24 Esclave (Addr 12)
    │
    └── Multi24 Maître #2 (Addr 2) ── Modbus BLEU ──> Multi24 Esclave (Addr 20)
```

**Légende :**
- **Modbus ROUGE** : Bus principal Jeedom ↔ Maîtres
- **Modbus BLEU** : Bus esclave Maître ↔ Esclaves

### Mécanisme d'adressage

Le mode pass-through utilise un système d'**incrémentation/décrémentation** d'adresse pour router les trames Modbus :

**Fonctionnement :**

1. La trame Modbus commence par l'**adresse du maître** (adresse principale)
2. L'adresse esclave est **incrémentée de +1** avant envoi
3. Le maître reçoit, **relaye** sur son bus esclave (Modbus BLEU)
4. L'esclave répond au maître
5. Le maître renvoie la réponse à Jeedom avec l'adresse **décrémentée de -1**

**Exemple concret :**

```
Configuration :
  Adresse : 1 (maître)
  Sous-adresse : 10 (esclave cible)

Étapes :
  1. Jeedom envoie trame → Adresse 1 (maître)
  2. Maître incrémente → Adresse 11 (10 + 1)
  3. Maître relaye sur bus BLEU → Esclave à l'adresse réelle 10 répond
  4. Maître décrémente → Adresse 10 (11 - 1)
  5. Jeedom reçoit la réponse de l'adresse 10
```

### Utilisation

#### Exemple 1 : Mise à jour DIRECTE (sans pass-through)

```
Adresse : 1
Sous-adresse : (vide)
```
→ Met à jour le Multi24 **maître** à l'adresse 1

#### Exemple 2 : Mise à jour EN CHAÎNE (avec pass-through)

```
Adresse : 1
Sous-adresse : 10
```
→ Met à jour le Multi24 **esclave** à l'adresse 10 en passant par le maître à l'adresse 1

#### Exemple 3 : Multiple esclaves

```
Scénario : Mettre à jour tous les esclaves derrière le maître #1

Mise à jour 1 :
  Adresse : 1
  Sous-adresse : 10
  → Esclave #10

Mise à jour 2 :
  Adresse : 1
  Sous-adresse : 11
  → Esclave #11

Mise à jour 3 :
  Adresse : 1
  Sous-adresse : 12
  → Esclave #12
```

### Cas d'usage

✅ Mettre à jour tous les modules d'une zone sans recâblage physique
✅ Accéder à des modules non directement connectés au bus Modbus principal
✅ Déploiement de mises à jour sur une architecture hiérarchisée
✅ Maintenance à distance de modules esclaves inaccessibles physiquement

---

## 🌐 Connexion TCP

Le plugin supporte la connexion via un **convertisseur RS485-to-Ethernet** (ex: Waveshare) selon deux modes :

### Mode TCP (Modbus TCP to RTU)

```
┌─────────┐     TCP/IP      ┌────────────────┐    RS485     ┌─────────┐
│ Jeedom  │ ──────────────► │  Convertisseur │ ───────────► │ Fidelix │
│         │   Modbus TCP    │  (conversion)  │  Modbus RTU  │         │
└─────────┘                 └────────────────┘              └─────────┘
```

- Le convertisseur **traduit** Modbus TCP vers Modbus RTU
- Gestion automatique du CRC par le convertisseur
- ✅ Mise à jour Software | ❌ Mise à jour Firmware

### Mode TCP Transparent (Raw/None)

```
┌─────────┐     TCP/IP      ┌────────────────┐    RS485     ┌─────────┐
│ Jeedom  │ ──────────────► │  Convertisseur │ ───────────► │ Fidelix │
│         │   Octets bruts  │  (passthrough) │  Octets bruts│         │
└─────────┘                 └────────────────┘              └─────────┘
```

- Le convertisseur transmet les octets **sans modification**
- L'application gère le format RTU et le CRC
- ✅ Mise à jour Software | ✅ Mise à jour Firmware

### Comparaison rapide

| Mode | Software Update | Firmware Update | Configuration convertisseur |
|------|-----------------|-----------------|----------------------------|
| **TCP** | ✅ | ❌ | Protocol: Modbus TCP to RTU |
| **TCP Transparent** | ✅ | ✅ | Protocol: None / Raw |

📖 **Documentation complète** : [Connexion TCP via Convertisseur RS485-Ethernet](docs/fr_FR/connexion_tcp.md)

---

## 📖 Documentation technique

Documentation détaillée pour les développeurs :

| Document | Description |
|----------|-------------|
| [Connexion TCP](docs/fr_FR/connexion_tcp.md) | Modes de connexion TCP vs TCP Transparent |
| [Architecture JavaScript](docs/fr_FR/architecture_javascript.md) | Structure des fichiers JS, couches et flux |
| [Changelog](docs/fr_FR/changelog.md) | Historique des versions |

### Architecture en couches

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION (PHP/Jeedom)                  │
├─────────────────────────────────────────────────────────────┤
│              COUCHE APPLICATION (FxMulti24/)                 │
│     FxDevice | FxDeviceTCP | FxFwUpdate | FxSwUpdate        │
├─────────────────────────────────────────────────────────────┤
│                COUCHE PROTOCOLE (FxModbus/)                  │
│          FxModbusRTUMaster  |  FxModbusTCPMaster            │
├─────────────────────────────────────────────────────────────┤
│                 COUCHE TRANSPORT (FxUtils/)                  │
│            FxSerialPort  |  FxTcpSocket                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Support

### Auteur

**Codemate SARL**
Email : nicolas@codemate.consulting

---

## 📄 Licence

Ce projet est sous licence [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html).

### Conditions principales

✅ Utilisation libre (personnelle et commerciale)
✅ Modification autorisée
✅ Distribution autorisée
⚠️ Les modifications doivent être partagées sous la même licence
⚠️ Le code source doit rester accessible
