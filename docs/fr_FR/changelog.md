# Changelog - Fidelix Updater

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
