# Connexion TCP via Convertisseur RS485-Ethernet

Ce document explique les différents modes de connexion TCP disponibles pour communiquer avec les modules Fidelix Multi24 via un convertisseur RS485-to-Ethernet (ex: Waveshare).

## Table des matières

- [Introduction](#introduction)
- [Architecture matérielle](#architecture-matérielle)
- [Mode TCP (Modbus TCP to RTU)](#mode-tcp-modbus-tcp-to-rtu)
- [Mode TCP Transparent (Raw/None)](#mode-tcp-transparent-rawnone)
- [Comparaison des modes](#comparaison-des-modes)
- [Configuration du convertisseur Waveshare](#configuration-du-convertisseur-waveshare)
- [Cas d'usage](#cas-dusage)

---

## Introduction

Les modules Fidelix Multi24 communiquent nativement en **Modbus RTU** via une liaison série RS485. Pour permettre une communication via le réseau IP (Ethernet/WiFi), un **convertisseur RS485-to-Ethernet** est nécessaire.

Ce convertisseur peut fonctionner selon deux modes principaux, chacun ayant ses avantages et limitations.

---

## Architecture matérielle

```
┌──────────────────┐                      ┌────────────────────┐                    ┌─────────────────┐
│                  │      Réseau IP       │                    │      RS485         │                 │
│     Jeedom       │ ◄──────────────────► │   Convertisseur    │ ◄────────────────► │  Fidelix        │
│     (serveur)    │      TCP/IP          │   RS485-Ethernet   │    Modbus RTU      │  Multi24        │
│                  │                      │   (Waveshare)      │                    │                 │
└──────────────────┘                      └────────────────────┘                    └─────────────────┘
```

**Composants :**
- **Jeedom** : Serveur domotique exécutant le plugin Fidelix Updater
- **Convertisseur** : Passerelle entre le réseau IP et le bus RS485 (ex: Waveshare RS485-to-ETH)
- **Fidelix Multi24** : Automate cible à mettre à jour

---

## Mode TCP (Modbus TCP to RTU)

### Principe

Dans ce mode, le convertisseur agit comme un **traducteur de protocole** entre Modbus TCP et Modbus RTU.

```
┌─────────────────┐                    ┌────────────────────────────┐                    ┌─────────────────┐
│                 │                    │       Convertisseur        │                    │                 │
│     Jeedom      │   Modbus TCP       │  ┌──────────────────────┐  │    Modbus RTU      │    Fidelix      │
│                 │ ─────────────────► │  │  Supprime header     │  │ ─────────────────► │    Multi24      │
│                 │   [MBAP + PDU]     │  │  MBAP, ajoute CRC    │  │   [Addr+PDU+CRC]   │                 │
│                 │                    │  └──────────────────────┘  │                    │                 │
└─────────────────┘                    └────────────────────────────┘                    └─────────────────┘
```

### Format des trames

**Trame Modbus TCP (envoyée par Jeedom) :**
```
┌─────────────────────────────────────────────────────────────┐
│  Header MBAP (7 bytes)              │  PDU (données)        │
├──────────┬──────────┬───────┬───────┼───────────────────────┤
│ Trans ID │ Proto ID │ Length│Unit ID│ Function + Data       │
│ (2 bytes)│ (2 bytes)│(2 b.) │(1 b.) │                       │
└──────────┴──────────┴───────┴───────┴───────────────────────┘
```

**Trame Modbus RTU (transmise sur RS485) :**
```
┌─────────────────────────────────────────────────────────────┐
│ Address  │  PDU (données)                    │  CRC-16     │
│ (1 byte) │  Function + Data                  │  (2 bytes)  │
└──────────┴───────────────────────────────────┴─────────────┘
```

### Avantages

- **Simple** : Aucune gestion du CRC côté application
- **Standard** : Compatible avec tous les clients Modbus TCP
- **Transparent** : Le convertisseur gère la conversion automatiquement

### Limitations

- **Commandes Modbus uniquement** : Ne supporte que les fonctions Modbus standard
- **Pas de commandes propriétaires** : Les commandes Fidelix spécifiques (Versio, Progrb, Passth) ne fonctionnent pas
- **Firmware update impossible** : Le protocole de mise à jour firmware utilise des commandes propriétaires

---

## Mode TCP Transparent (Raw/None)

### Principe

Dans ce mode, le convertisseur agit comme un **simple tunnel** : les octets envoyés via TCP sont transmis tels quels sur le RS485, sans aucune modification.

```
┌─────────────────┐                    ┌────────────────────────────┐                    ┌─────────────────┐
│                 │                    │       Convertisseur        │                    │                 │
│     Jeedom      │   Octets bruts     │  ┌──────────────────────┐  │    Octets bruts    │    Fidelix      │
│                 │ ─────────────────► │  │    Passthrough       │  │ ─────────────────► │    Multi24      │
│                 │   [Addr+PDU+CRC]   │  │    (aucun traitement)│  │   [Addr+PDU+CRC]   │                 │
│                 │                    │  └──────────────────────┘  │                    │                 │
└─────────────────┘                    └────────────────────────────┘                    └─────────────────┘
```

### Format des trames

L'application doit construire elle-même les trames RTU complètes avec le CRC :

```
┌─────────────────────────────────────────────────────────────┐
│ Address  │  Données                          │  CRC-16     │
│ (1 byte) │  (commande Modbus ou propriétaire)│  (2 bytes)  │
└──────────┴───────────────────────────────────┴─────────────┘
```

### Commandes propriétaires Fidelix

Le mode transparent permet d'envoyer les commandes propriétaires utilisées par le bootloader Fidelix :

| Commande | Description | Utilisation |
|----------|-------------|-------------|
| `Versio` | Demande la version du bootloader | Vérifier si le device est en mode boot |
| `Progrb` | Entre en mode programmation firmware | Initialiser le transfert firmware |
| `Passth` | Active le mode pass-through | Accéder aux modules esclaves |

**Exemple de trame "Versio" :**
```
┌────────┬──────────────────────┬─────────┐
│  0x01  │  V e r s i o \0      │  CRC    │
│ (addr) │  (7 bytes ASCII)     │ (2 b.)  │
└────────┴──────────────────────┴─────────┘
```

### Avantages

- **Flexibilité totale** : Permet d'envoyer n'importe quelle séquence d'octets
- **Commandes propriétaires** : Supporte toutes les commandes Fidelix
- **Firmware update** : Seul mode permettant la mise à jour firmware via TCP

### Contraintes

- **Gestion du CRC** : L'application doit calculer et ajouter le CRC-16 Modbus
- **Format RTU** : L'application doit construire les trames au format RTU
- **Configuration requise** : Le convertisseur doit être configuré en mode "None" ou "Raw"

---

## Comparaison des modes

| Caractéristique | Mode TCP | Mode Transparent |
|-----------------|----------|------------------|
| **Configuration convertisseur** | Modbus TCP to RTU | None / Raw |
| **Gestion du CRC** | Automatique (convertisseur) | Manuelle (application) |
| **Format des trames** | Modbus TCP (MBAP) | Modbus RTU (brut) |
| **Commandes Modbus standard** | Oui | Oui |
| **Commandes propriétaires Fidelix** | Non | Oui |
| **Lecture/écriture registres** | Oui | Oui |
| **Mise à jour Software** | Oui | Oui |
| **Mise à jour Firmware** | Non | Oui |
| **Complexité application** | Simple | Plus complexe |

---

## Configuration du convertisseur Waveshare

### Mode TCP (Modbus TCP to RTU)

```
Protocol: Modbus TCP to RTU
Local Port: 502 (ou autre)
Baud Rate: 38400
Data Bits: 8
Parity: None
Stop Bits: 1
```

### Mode Transparent (Raw/None)

```
Protocol: None (ou Raw/Transparent)
Local Port: 502 (ou autre)
Baud Rate: 38400
Data Bits: 8
Parity: None
Stop Bits: 1
```

**Note :** Après changement de mode, un redémarrage du convertisseur peut être nécessaire.

---

## Cas d'usage

### Lecture de registres / Mise à jour Software

Pour les opérations standard (lecture de température, mise à jour software .M24IEC), les deux modes fonctionnent. Le **mode TCP** est recommandé car plus simple.

### Mise à jour Firmware

Pour la mise à jour firmware (.hex), le **mode Transparent** est obligatoire car le protocole utilise des commandes propriétaires non-Modbus.

### Choix dans l'interface plugin

L'interface de mise à jour propose trois types de connexion :

| Option | Mode | Usage |
|--------|------|-------|
| **Série** | Direct RS485 | Connexion directe au port série |
| **TCP** | Modbus TCP to RTU | Convertisseur en mode Modbus TCP |
| **TCP Transparent** | Raw/None | Convertisseur en mode transparent |

**Recommandation :**
- Utilisez **TCP** pour la mise à jour software
- Utilisez **TCP Transparent** pour la mise à jour firmware
- Utilisez **Série** si vous avez une connexion RS485 directe

---

## Références

- [Spécification Modbus TCP](https://modbus.org/docs/Modbus_Messaging_Implementation_Guide_V1_0b.pdf)
- [Spécification Modbus RTU](https://modbus.org/docs/Modbus_over_serial_line_V1_02.pdf)
- [Documentation Waveshare RS485-to-ETH](https://www.waveshare.com/wiki/RS485_TO_ETH)