# Changelog - Fidelix Updater

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
