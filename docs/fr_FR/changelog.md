# Changelog - Fidelix Updater

## Version 1.1.1 - 2025-12-19

### Correction bug affichage des logs

- Correction du bug ou les logs se stackaient lors de la consultation de plusieurs processus dans l'historique
- Chaque processus a maintenant ses propres fichiers de log separes (stdout et stderr)
- Les logs Node.js sont desormais isoles par processus au lieu d'etre partages dans un fichier commun

## Version 1.1.0 - 2025-12-13

### Support Modbus TCP

Ajout du support des convertisseurs RS485 vers Ethernet (ex: Waveshare RS485 to POE ETH) pour la mise a jour des modules Fidelix a distance via le reseau.

**Nouvelles fonctionnalites :**
- Selecteur de type de connexion RTU/TCP dans les modales de mise a jour et test
- Configuration host:port pour connexion TCP
- Memorisation du type de connexion precedent (localStorage)
- Affichage du type de connexion dans l'historique et les processus actifs
- Support du mode TCP Transparent (raw RTU over TCP) pour les gateways configures en mode "None"

**Mise a jour Software (.M24IEC) :**
- ✅ Fonctionne en RTU (serie)
- ✅ Fonctionne en TCP Standard (Modbus TCP to RTU)
- ✅ Fonctionne en TCP Transparent (raw)

**Mise a jour Firmware (.hex) :**
- ✅ Fonctionne en RTU (serie)
- ❌ Non disponible en TCP Standard (protocole proprietaire incompatible avec Modbus TCP to RTU)
- ✅ Fonctionne en TCP Transparent (raw) - gateway configure en mode "None"

**Mode Pass-through :**
- ✅ Fonctionne en RTU (serie)
- ❌ Non disponible en TCP Standard (necessite commandes proprietaires)
- ✅ Fonctionne en TCP Transparent (raw) - gateway configure en mode "None"

**Fichiers crees :**
- FxTcpSocket.js - Wrapper socket TCP avec gestion timeouts
- FxModbusTCPMaster.js - Protocole Modbus TCP avec header MBAP + mode transparent
- FxDeviceTCP.js - Operations device via TCP (commandes proprietaires en mode transparent)
- FxSwUpdateTCP.js - Mise a jour software via TCP
- FxFwUpdateTCP.js - Mise a jour firmware via TCP (mode transparent uniquement)
- testConnectionTCP.js - Script de test connexion TCP

**Notes techniques :**
- Delais specifiques TCP pour compatibilite convertisseurs Waveshare
- Timeouts plus longs qu'en RTU pour compenser la latence reseau
- L'UI desactive automatiquement les options non disponibles selon le type de connexion

## Version 1.0.9 - 2025-12-08

- Affichage de la version du plugin directement dans la page de configuration (lecture depuis info.json)
- Suppression de la synchronisation de version inutile dans install.php

## Version 1.0.8 - 2025-12-05

- Desactivation temporaire de la mise a jour du firmware Display suite a des problemes de compatibilite

## Version 1.0.7 - 2025-12-01

- Synchronisation automatique de la version du plugin avec Jeedom (affichage natif dans l'interface)

## Version 1.0.6 - 2025-11-15

- ✨ Contrôle automatique du daemon Modbus : arrêt/redémarrage pendant les mises à jour pour éviter les conflits série
- 🎨 Configuration : affichage conditionnel selon présence et activation du plugin Modbus

## Version 1.0.5 - 2025-11-15

- ✨ Support des modules Display : firmware (.hex) et graphics (.bin) avec mode pass-through

## Version 1.0.4 - 2025-11-14

- ✨ Vitesse par défaut à 38400 bauds dans modale de test de connexion
- 📝 Traçabilité : affichage de l'utilisateur Jeedom dans historique, logs et processus actifs
- 🔧 Cron passé en mode horaire (`cronHourly`)
- 📚 Documentation : stratégie de rétention complète et précise (7 jours, 50 entrées max)

## Version 1.0.3 - 2025-11-13

- 🐛 Correction sélection port série (inversion key/value dans dropdown)
- 🐛 Ajout callback d'erreur sur flush() pour éviter crash ouverture port
- ✨ Bouton "Copier" dans visualiseur de logs
- 🐛 Correction chemin logs Jeedom
- 🎨 Valeurs par défaut : Software + 38400 bauds

## Version 1.0.2 - 2025-11-13

- ⏱️ Ajout d'un délai de 500ms après ouverture du port série pour tenter de corriger l'erreur "Port is not open"

## Version 1.0.1 - 2025-11-12

### Améliorations et corrections

**Corrections critiques :**
- 🐛 Correction des chemins de fichiers pour compatibilité multi-environnements (Docker + VM)
- 🐛 Création automatique robuste des répertoires data/filetransfer/, data/status/, data/logs/
- 🐛 Support des chemins absolus dans le traitement des fichiers uploadés
- 🐛 Résolution des problèmes d'upload sur environnements de production

**Debugging et diagnostics :**
- 🔧 Ajout de la capture stderr des processus Node.js dans des fichiers de logs dédiés
- 🔧 Handlers d'exceptions Node.js pour capturer les crashs silencieux (uncaughtException, unhandledRejection)
- 🔧 Logs techniques détaillés à chaque étape de la communication Modbus
- 🔧 Conservation des logs stderr pendant 7 jours pour analyse a posteriori
- 🔧 Nouveau endpoint AJAX `getLogs` pour récupération des logs d'un processus

**Interface utilisateur :**
- ✨ Bouton "Logs" dans l'historique des processus pour visualiser les logs techniques
- ✨ Modale de visualisation des logs avec 3 onglets (stderr, Node.js console, Jeedom)
- ✨ Messages d'erreur simplifiés pour l'utilisateur final (détails techniques masqués de l'UI)
- 🎨 Amélioration de la table d'historique avec colonne Actions

**Technique :**
- 📝 Stockage des chemins de fichiers de logs dans le registre des processus
- 📝 Méthodes helper pour gestion des chemins : `getPluginPath()`, `getDataPath()`, `ensureDirectory()`
- 📝 Cleanup intelligent des logs : conservation 7 jours pour historique, suppression automatique après
- 📝 Logs Jeedom filtrés par updateId pour isolement par processus

## Version 1.0.0 - 2025-11-09

### Première version

**Fonctionnalités :**
- ✨ Mise à jour firmware (.hex) des modules Fidelix Multi24
- ✨ Mise à jour software (.M24IEC) des modules Fidelix Multi24
- ✨ Architecture asynchrone avec progression en temps réel
- ✨ Mode pass-through pour mise à jour en chaîne (maître → esclave)
- ✨ Mécanisme de récupération automatique en cas d'échec
- ✨ Gestion des processus actifs avec kill manuel
- ✨ Historique complet des mises à jour
- ✨ Lock des ports série pour éviter les conflits
- ✨ Diagnostic système avec correction automatique des permissions
- ✨ Support Modbus RTU à 57600 bauds

**Interface :**
- 🎨 Modal de mise à jour avec sélection fichier + configuration
- 🎨 Barre de progression en temps réel avec polling toutes les 2 secondes
- 🎨 Liste des processus actifs avec bouton kill
- 🎨 Historique avec statut succès/erreur
- 🎨 Page de configuration avec diagnostic système

**Documentation :**
- 📚 README complet avec architecture et exemples
- 📚 Documentation détaillée (architecture asynchrone, communication Modbus, gestion processus)
- 📚 Captures d'écran illustrées
