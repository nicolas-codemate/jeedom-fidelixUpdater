# Fidelix Updater

Plugin Jeedom pour mettre à jour le firmware et le software des modules **Fidelix Multi24** via Modbus RTU.

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
- [Dépannage](#-dépannage)
- [Support](#-support)
- [Licence](#-licence)

---

## 🎯 Présentation

**Fidelix Updater** permet de mettre à jour à distance les automates Fidelix Multi24 directement depuis l'interface Jeedom.

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

1. **Télécharger le plugin** depuis le Market Jeedom ou installer manuellement
2. **Activer le plugin** depuis la page des plugins
3. **Accéder à la configuration** : Plugins → Programming → Fidelix Updater → Configuration

### 2. Tests de diagnostic (OBLIGATOIRE avant toute mise à jour)

Avant de procéder à une mise à jour de module, il est **impératif** de vérifier que tous les prérequis sont satisfaits.

**Accès au diagnostic :**
```
Jeedom → Plugins → Programming → Fidelix Updater → Configuration
```

Le plugin affiche automatiquement un **diagnostic système complet** avec 4 vérifications :

#### ✅ Node.js installé
- **Requis** : Version 12 ou supérieure
- **Vérification** : Affiche la version installée
- ❌ **Si absent** : Installer Node.js sur le système

```bash
# Installer Node.js sur Debian/Ubuntu
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### ✅ Groupe dialout (permissions port série)
- **Requis** : L'utilisateur `www-data` doit être dans le groupe `dialout`
- **Vérification** : Affiche les groupes de l'utilisateur `www-data`
- ⚠️ **Si absent** : Utiliser le bouton "Reconfigurer les permissions" (voir ci-dessous)

#### ✅ Dépendances npm installées
- **Requis** : Package `serialport` et dépendances
- **Vérification** : Affiche le chemin d'installation des modules npm
- ⚠️ **Si absent** : Utiliser le bouton "Reconfigurer les permissions" (voir ci-dessous)

#### ✅ Ports série détectés
- **Optionnel** : Affiche tous les ports série disponibles et leurs permissions
- **État** :
  - 🟢 **Accessible** : Le port peut être utilisé pour la mise à jour
  - 🟠 **Permissions insuffisantes** : Utiliser le bouton "Reconfigurer les permissions"
- ℹ️ **Note** : Si aucun port série n'est détecté, c'est normal si aucun adaptateur USB-RS485 n'est connecté

### 3. Bouton "Reconfigurer les permissions"

Le bouton **"Reconfigurer les permissions"** corrige automatiquement **tous les problèmes de configuration** détectés.

#### Ce que fait ce bouton :

1. **Ajoute www-data au groupe dialout**
   ```bash
   sudo usermod -a -G dialout www-data
   ```
   → Permet l'accès aux ports série

2. **Installe les dépendances npm**
   ```bash
   cd /var/www/html/plugins/fidelixUpdater/3rdparty/Fidelix/FxLib
   sudo npm install
   ```
   → Installe `serialport`, `q`, `fs-extra` et autres dépendances

3. **Corrige les permissions des ports série**
   ```bash
   sudo chmod 666 /dev/ttyUSB* /dev/ttyACM*
   ```
   → Rend les ports série accessibles immédiatement

4. **Configure les permissions des dossiers**
   ```bash
   sudo chown -R www-data:www-data /var/www/html/plugins/fidelixUpdater
   ```
   → Assure que le plugin peut écrire les fichiers temporaires

#### Quand utiliser ce bouton ?

✅ **Première installation du plugin**
✅ Après une mise à jour de Jeedom ou du système d'exploitation
✅ Si le diagnostic affiche des erreurs ou avertissements
✅ Si les mises à jour échouent avec "Permission denied"
✅ Après connexion d'un nouvel adaptateur USB-RS485

#### Utilisation

1. **Cliquer sur le bouton** "Reconfigurer les permissions"
2. **Attendre** 10-30 secondes (installation des dépendances npm)
3. **Vérifier** que le message "Configuration réussie !" apparaît
4. **Recharger** la page (automatique après 2 secondes)
5. **Confirmer** que tous les voyants sont verts ✅

**Exemple de diagnostic après correction :**

```
✅ Node.js installé
   Version: v16.20.0

✅ Groupe dialout (permissions port série)
   Groupes: www-data dialout

✅ Dépendances npm installées
   Installées dans: /var/www/html/plugins/fidelixUpdater/3rdparty/Fidelix/FxLib/node_modules

✅ Ports série détectés
   /dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A9D5YQVH-if00-port0
   ✅ Accessible
   FTDI FT232R USB UART
```

### 4. Tests de fonctionnement recommandés

Avant de mettre à jour un module critique, il est recommandé de :

#### Test 1 : Vérifier la communication Modbus

Utiliser le bouton **"Tester la connexion"** sur la page principale pour vérifier que Jeedom peut communiquer avec le module.

**Paramètres de test :**
- Adresse : Adresse Modbus du module (1-247)
- Port série : Sélectionner le port RS485

**Résultat attendu :**
```
✅ Connexion établie avec le module à l'adresse 1
   Modèle: Multi24
   Version: 2.80
```

#### Test 2 : Test de mise à jour sur module non-critique

Pour une première utilisation, **tester d'abord sur un module non-critique** :

1. Préparer un fichier de mise à jour de test
2. Lancer la mise à jour sur un module de développement
3. Vérifier que la progression s'affiche correctement
4. Attendre la fin complète de la mise à jour
5. Vérifier que le module redémarre correctement

#### Test 3 : Vérifier les logs

Consulter les logs pour s'assurer qu'il n'y a pas d'erreurs :

```bash
# Logs Jeedom
tail -f /var/www/html/log/fidelixUpdater

# Logs Node.js
tail -f /var/www/html/plugins/fidelixUpdater/3rdparty/Fidelix/FxLib/logsJeedom.txt
```

### 5. Checklist de validation

Avant de mettre à jour un module en production :

- [ ] Tous les voyants du diagnostic sont verts ✅
- [ ] Le bouton "Reconfigurer les permissions" a été exécuté avec succès
- [ ] Au moins un port série est détecté et accessible
- [ ] La communication Modbus fonctionne (test de connexion réussi)
- [ ] Un test de mise à jour a été effectué sur un module non-critique
- [ ] Les logs ne montrent aucune erreur critique

**Si tous ces points sont validés, le plugin est prêt pour une mise à jour en production. ✅**

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

### Interface de mise à jour

```
┌─────────────────────────────────────────────┐
│  Type de mise à jour : [Firmware ▼]        │
│  Fichier : [Parcourir...] Multi24-v2.81.hex│
│  Adresse : [1        ]                      │
│  Sous-adresse : [    ] (Optionnel)          │
│  Port série : [/dev/ttyUSB0 ▼]             │
│  [Démarrer la mise à jour]                  │
└─────────────────────────────────────────────┘
```

---

## 🔗 Mode Pass-Through

Le **mode pass-through** permet de mettre à jour un module **esclave** en passant **à travers** un module **maître**.

### Architecture réseau typique

```
JEEDOM (Maître Modbus)
    │
    ├── Multi24 Maître #1 (Adresse 1)
    │       └── Modbus esclave
    │           ├── Multi24 Esclave (Adresse 10)
    │           ├── Multi24 Esclave (Adresse 11)
    │           └── Multi24 Esclave (Adresse 12)
    │
    └── Multi24 Maître #2 (Adresse 2)
            └── Modbus esclave
                └── Multi24 Esclave (Adresse 20)
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

### Cas d'usage

✅ Mettre à jour tous les modules d'une zone sans recâblage
✅ Accéder à des modules non directement connectés au bus Modbus principal
✅ Déploiement de mises à jour sur une architecture hiérarchisée

---

## 🐛 Dépannage

### Le plugin ne s'affiche pas dans Jeedom

```bash
# Vérifier les permissions
sudo chown -R www-data:www-data /var/www/html/plugins/fidelixUpdater

# Vider le cache Jeedom
sudo rm -rf /tmp/jeedom/cache/*
```

### Erreur "Permission denied" sur le port série

```bash
# Vérifier l'appartenance au groupe dialout
groups www-data

# Si dialout n'apparaît pas :
sudo usermod -a -G dialout www-data
sudo systemctl restart apache2
```

### La mise à jour échoue systématiquement

**Vérifications :**

1. **Adresse Modbus** : Vérifier que l'adresse correspond au module
2. **Port série** : Utiliser `/dev/serial/by-id/...` pour éviter les changements
3. **Connexion physique** : Vérifier le câblage RS485 (A, B, GND)
4. **Alimentation** : Le module doit être alimenté pendant toute la mise à jour

**Logs :**

```bash
# Consulter les logs Jeedom
tail -f /var/www/html/log/fidelixUpdater

# Consulter les logs Node.js
tail -f /var/www/html/plugins/fidelixUpdater/3rdparty/Fidelix/FxLib/logsJeedom.txt
```

### Le module ne répond plus après une mise à jour échouée

**Le plugin intègre un mécanisme de récupération automatique.**

Si le module reste bloqué :

1. Couper l'alimentation du module
2. Attendre 10 secondes
3. Rallumer le module
4. Relancer la mise à jour

---

## 💡 Conseils et bonnes pratiques

### Avant une mise à jour

✅ **Sauvegarder** la configuration actuelle du module
✅ **Vérifier** la compatibilité du firmware avec le matériel
✅ **Tester** d'abord sur un module non-critique
✅ **Planifier** la mise à jour en dehors des heures de production

### Pendant une mise à jour

⚠️ **Ne pas déconnecter** le module
⚠️ **Ne pas couper** l'alimentation
⚠️ **Attendre** la fin complète (5-15 minutes)

### Après une mise à jour

✅ **Vérifier** que le module redémarre correctement
✅ **Tester** les fonctionnalités critiques
✅ **Consulter** les logs en cas d'anomalie

---

## 🔧 Caractéristiques techniques

| Paramètre | Valeur |
|-----------|--------|
| **Protocol** | Modbus RTU |
| **Vitesse** | 57600 bauds |
| **Bits de données** | 8 |
| **Parité** | Aucune |
| **Bits d'arrêt** | 1 |
| **Timeout** | 3000 ms |
| **Retries** | 10 tentatives |
| **Délai sécurité** | 500 ms entre opérations critiques |

### Durée des mises à jour

- **Firmware** (.hex) : 5-15 minutes (selon taille du fichier)
- **Software** (.M24IEC) : 3-8 minutes (selon taille du fichier)

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
