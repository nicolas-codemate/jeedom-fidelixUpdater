# Fidelix Updater

Plugin Jeedom pour mettre à jour le firmware et le software des modules **Fidelix Multi24** via Modbus RTU.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Jeedom](https://img.shields.io/badge/Jeedom-4.2%2B-green)](https://www.jeedom.com)

---

## 📋 Table des matières

- [Présentation](#-présentation)
- [Fonctionnalités](#-fonctionnalités)
- [Prérequis](#-prérequis)
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
