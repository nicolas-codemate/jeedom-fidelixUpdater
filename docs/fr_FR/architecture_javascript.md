# Architecture des fichiers JavaScript

Ce document décrit l'architecture des fichiers JavaScript de la librairie Fidelix utilisée pour la communication avec les modules Multi24.

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Structure des dossiers](#structure-des-dossiers)
- [Couche Transport (FxUtils)](#couche-transport-fxutils)
- [Couche Protocole Modbus (FxModbus)](#couche-protocole-modbus-fxmodbus)
- [Couche Application Fidelix (FxMulti24)](#couche-application-fidelix-fxmulti24)
- [Scripts de test et point d'entrée](#scripts-de-test-et-point-dentrée)
- [Diagrammes de flux](#diagrammes-de-flux)
- [Matrice des capacités](#matrice-des-capacités)

---

## Vue d'ensemble

L'architecture suit un modèle en couches :

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICATION (PHP/Jeedom)                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     POINT D'ENTRÉE (FxM24Update.js)                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              COUCHE APPLICATION FIDELIX (FxMulti24/)                 │
│  FxDevice.js | FxDeviceTCP.js | FxFwUpdate.js | FxSwUpdate.js  ...  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  COUCHE PROTOCOLE MODBUS (FxModbus/)                 │
│            FxModbusRTUMaster.js  |  FxModbusTCPMaster.js             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    COUCHE TRANSPORT (FxUtils/)                       │
│         FxSerialPort.js  |  FxTcpSocket.js  |  FxSerial.js          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MATÉRIEL / RÉSEAU                            │
│                    RS485 (série)  |  TCP/IP (Ethernet)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Structure des dossiers

```
3rdparty/Fidelix/FxLib/
│
├── FxUtils/                              # COUCHE TRANSPORT
│   ├── index.js                          # Export des modules
│   ├── FxSerialPort.js                   # Gestion port série RS485
│   ├── FxTcpSocket.js                    # Gestion socket TCP
│   ├── FxSerial.js                       # Abstraction série
│   └── FxLog.js                          # Système de logging
│
├── FxModbus/                             # COUCHE PROTOCOLE MODBUS
│   ├── index.js                          # Export des modules
│   ├── FxModbusRTUMaster.js              # Maître Modbus RTU (série)
│   └── FxModbusTCPMaster.js              # Maître Modbus TCP (+transparent)
│
├── FxMulti24/                            # COUCHE APPLICATION FIDELIX
│   ├── index.js                          # Export des modules
│   ├── FxModuleInfo.js                   # Informations module Multi24
│   │
│   ├── FxDevice.js                       # Device série (RTU)
│   ├── FxDeviceTCP.js                    # Device TCP (+transparent)
│   │
│   ├── FxFwUpdate.js                     # Firmware update série
│   ├── FxFwUpdateTCP.js                  # Firmware update TCP
│   │
│   ├── FxSwUpdate.js                     # Software update série
│   └── FxSwUpdateTCP.js                  # Software update TCP
│
├── FxM24Update.js                        # Point d'entrée principal
├── testConnection.js                     # Test connexion série
└── testConnectionTCP.js                  # Test connexion TCP
```

---

## Couche Transport (FxUtils)

Cette couche gère la communication bas niveau avec le matériel.

### FxSerialPort.js

Gestion du port série RS485.

```
┌─────────────────────────────────────────┐
│            FxSerialPort.js              │
├─────────────────────────────────────────┤
│ Responsabilités :                       │
│ - Ouverture/fermeture port série        │
│ - Configuration (baudRate, parity...)   │
│ - Lecture/écriture octets               │
│ - Événements (data, error, close)       │
├─────────────────────────────────────────┤
│ Dépendances :                           │
│ - serialport (npm)                      │
└─────────────────────────────────────────┘
```

### FxTcpSocket.js

Gestion du socket TCP pour les convertisseurs RS485-Ethernet.

```
┌─────────────────────────────────────────┐
│             FxTcpSocket.js              │
├─────────────────────────────────────────┤
│ Responsabilités :                       │
│ - Connexion TCP (host, port)            │
│ - Lecture/écriture octets               │
│ - Gestion timeouts                      │
│ - Événements (receive, error, close)    │
├─────────────────────────────────────────┤
│ Dépendances :                           │
│ - net (Node.js built-in)                │
└─────────────────────────────────────────┘
```

### FxLog.js

Système de logging configurable.

---

## Couche Protocole Modbus (FxModbus)

Cette couche implémente le protocole Modbus dans ses variantes RTU et TCP.

### FxModbusRTUMaster.js

Implémentation du maître Modbus RTU pour communication série.

```
┌─────────────────────────────────────────┐
│          FxModbusRTUMaster.js           │
├─────────────────────────────────────────┤
│ Format trame RTU :                      │
│ [Address][Function][Data...][CRC-16]    │
│    1 byte   1 byte   N bytes   2 bytes  │
├─────────────────────────────────────────┤
│ Fonctions Modbus :                      │
│ - 0x03 : Read Holding Registers         │
│ - 0x06 : Write Single Register          │
│ - 0x10 : Write Multiple Registers       │
├─────────────────────────────────────────┤
│ Méthodes principales :                  │
│ - readHoldingRegisters()                │
│ - writeSingleRegister()                 │
│ - writeMultipleRegisters()              │
│ - getCRC()                              │
├─────────────────────────────────────────┤
│ Hérite de : FxSerialPort                │
└─────────────────────────────────────────┘
```

### FxModbusTCPMaster.js

Implémentation du maître Modbus TCP avec support du mode transparent.

```
┌─────────────────────────────────────────┐
│          FxModbusTCPMaster.js           │
├─────────────────────────────────────────┤
│ DEUX MODES DE FONCTIONNEMENT :          │
│                                         │
│ 1. Mode TCP (transparentMode = false)   │
│    Format : [MBAP Header][PDU]          │
│    - Transaction ID (2 bytes)           │
│    - Protocol ID (2 bytes)              │
│    - Length (2 bytes)                   │
│    - Unit ID (1 byte)                   │
│    - PDU (Function + Data)              │
│                                         │
│ 2. Mode Transparent (transparentMode =  │
│    true)                                │
│    Format : [Address][PDU][CRC-16]      │
│    Identique au RTU, envoyé via TCP     │
├─────────────────────────────────────────┤
│ Méthodes principales :                  │
│ - setTransparentMode(enabled)           │
│ - isTransparentMode()                   │
│ - readHoldingRegisters()                │
│ - writeSingleRegister()                 │
│ - writeMultipleRegisters()              │
│ - getCRC()                              │
├─────────────────────────────────────────┤
│ Hérite de : FxTcpSocket                 │
└─────────────────────────────────────────┘
```

---

## Couche Application Fidelix (FxMulti24)

Cette couche implémente les fonctionnalités spécifiques aux modules Fidelix Multi24.

### FxDevice.js (Série)

Device Fidelix pour communication série RS485.

```
┌─────────────────────────────────────────┐
│              FxDevice.js                │
├─────────────────────────────────────────┤
│ Commandes propriétaires Fidelix :       │
│                                         │
│ - askBootVersion()                      │
│   Envoi : "Versio\0" + CRC              │
│   Réponse : Version bootloader          │
│                                         │
│ - sendPassThroughCommand()              │
│   Envoi : "Passth\0" + CRC              │
│   Active le mode pass-through           │
│                                         │
│ - setupFwProgramMode()                  │
│   Envoi : "Progrb\0\0" + CRC            │
│   Entre en mode programmation firmware  │
│                                         │
│ - programFwPage(pageData, pageAddress)  │
│   Envoi : [Addr][PageData][CRC]         │
│   Programme une page de 256 bytes       │
│                                         │
│ - getFwPageAddress()                    │
│   Lecture de l'adresse page suivante    │
├─────────────────────────────────────────┤
│ Hérite de : FxModbusRTUMaster           │
└─────────────────────────────────────────┘
```

### FxDeviceTCP.js (TCP)

Device Fidelix pour communication TCP avec support des deux modes.

```
┌─────────────────────────────────────────┐
│            FxDeviceTCP.js               │
├─────────────────────────────────────────┤
│ MODE TCP STANDARD :                     │
│ - Commandes Modbus uniquement           │
│ - readHoldingRegisters()                │
│ - writeSingleRegister()                 │
│ - writeMultipleRegisters()              │
│                                         │
│ MODE TRANSPARENT :                      │
│ - Toutes les commandes Modbus           │
│ - + Commandes propriétaires Fidelix :   │
│   - askBootVersion()                    │
│   - sendPassThroughCommand()            │
│   - setupFwProgramMode()                │
│   - programFwPage()                     │
│   - getFwPageAddress()                  │
├─────────────────────────────────────────┤
│ Activation mode transparent :           │
│   device.setTransparentMode(true)       │
├─────────────────────────────────────────┤
│ Hérite de : FxModbusTCPMaster           │
└─────────────────────────────────────────┘
```

### FxFwUpdate.js / FxFwUpdateTCP.js

Mise à jour firmware (.hex).

```
┌─────────────────────────────────────────┐
│    FxFwUpdate.js / FxFwUpdateTCP.js     │
├─────────────────────────────────────────┤
│ Processus de mise à jour firmware :     │
│                                         │
│ 1. setupBootMode()                      │
│    - Active le mode bootloader          │
│    - Vérifie version boot (Versio)      │
│                                         │
│ 2. setupFwProgramMode()                 │
│    - Envoi commande "Progrb"            │
│    - Device retourne page 0             │
│                                         │
│ 3. transferData() [boucle]              │
│    - Envoi page par page (256 bytes)    │
│    - Attente confirmation device        │
│    - Retry si erreur                    │
│                                         │
│ 4. Fin : device retourne 0xFFFF         │
├─────────────────────────────────────────┤
│ FxFwUpdate.js     → utilise FxDevice    │
│ FxFwUpdateTCP.js  → utilise FxDeviceTCP │
│                    (mode transparent    │
│                     obligatoire)        │
└─────────────────────────────────────────┘
```

### FxSwUpdate.js / FxSwUpdateTCP.js

Mise à jour software (.M24IEC).

```
┌─────────────────────────────────────────┐
│    FxSwUpdate.js / FxSwUpdateTCP.js     │
├─────────────────────────────────────────┤
│ Processus de mise à jour software :     │
│                                         │
│ 1. Lecture fichier .M24IEC              │
│                                         │
│ 2. Transfert par blocs                  │
│    - Utilise writeMultipleRegisters()   │
│    - Commandes Modbus standard          │
│                                         │
│ 3. Vérification                         │
├─────────────────────────────────────────┤
│ FxSwUpdate.js     → utilise FxDevice    │
│ FxSwUpdateTCP.js  → utilise FxDeviceTCP │
│                    (les 2 modes OK)     │
└─────────────────────────────────────────┘
```

### FxModuleInfo.js

Informations sur les modules Multi24.

```
┌─────────────────────────────────────────┐
│            FxModuleInfo.js              │
├─────────────────────────────────────────┤
│ Propriétés module :                     │
│ - programPageCount (1024 pour Multi24)  │
│ - bootloaderStartRegister (127)         │
│ - pageSize (256 bytes)                  │
└─────────────────────────────────────────┘
```

---

## Scripts de test et point d'entrée

### FxM24Update.js

Point d'entrée principal appelé par le PHP.

```
┌─────────────────────────────────────────┐
│            FxM24Update.js               │
├─────────────────────────────────────────┤
│ Arguments :                             │
│ - connectionType (serial/tcp/tcp-trans) │
│ - updateType (firmware/software)        │
│ - port ou host:tcpPort                  │
│ - address, subAddress                   │
│ - filePath, logFile                     │
├─────────────────────────────────────────┤
│ Dispatch vers :                         │
│ - FxFwUpdate / FxFwUpdateTCP            │
│ - FxSwUpdate / FxSwUpdateTCP            │
└─────────────────────────────────────────┘
```

### testConnection.js

Test de connexion série.

### testConnectionTCP.js

Test de connexion TCP (mode standard uniquement).

---

## Diagrammes de flux

### Mode Série (RS485 direct)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│  FxFwUpdate  │    │   FxDevice   │    │ FxModbus     │    │ FxSerial │
│  FxSwUpdate  │───►│  (commandes  │───►│ RTUMaster    │───►│ Port     │──► RS485
│              │    │   proprio.)  │    │ (+CRC)       │    │          │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────┘
```

### Mode TCP (Modbus TCP to RTU)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│ FxSwUpdateTCP│    │ FxDeviceTCP  │    │ FxModbus     │    │ FxTcp    │
│              │───►│ (Modbus      │───►│ TCPMaster    │───►│ Socket   │──► TCP
│              │    │  standard)   │    │ (+MBAP)      │    │          │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────┘

Note : FxFwUpdateTCP ne fonctionne PAS dans ce mode
       (commandes propriétaires non supportées)
```

### Mode TCP Transparent (Raw/None)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│ FxFwUpdateTCP│    │ FxDeviceTCP  │    │ FxModbus     │    │ FxTcp    │
│ FxSwUpdateTCP│───►│ (transparent │───►│ TCPMaster    │───►│ Socket   │──► TCP
│              │    │  = true)     │    │ (+CRC, RTU)  │    │          │    (raw)
└──────────────┘    │ + commandes  │    └──────────────┘    └──────────┘
                    │   proprio.   │
                    └──────────────┘

Note : Toutes les fonctionnalités disponibles
```

---

## Matrice des capacités

### Par type de connexion

| Fonctionnalité | Série | TCP | TCP Transparent |
|----------------|:-----:|:---:|:---------------:|
| Test connexion | ✅ | ✅ | ✅ |
| Lecture registres | ✅ | ✅ | ✅ |
| Écriture registres | ✅ | ✅ | ✅ |
| Software update (.M24IEC) | ✅ | ✅ | ✅ |
| Firmware update (.hex) | ✅ | ❌ | ✅ |
| Commandes propriétaires | ✅ | ❌ | ✅ |
| Mode pass-through | ✅ | ❌ | ✅ |

### Flux de données pour Software Update TCP Transparent

```
┌──────────┐   connectionType='tcp'   ┌──────────────┐   transparentMode   ┌───────────────┐
│  Modal   │ ───────────────────────► │   PHP AJAX   │ ─────────────────► │ FxM24Update   │
│  (UI)    │   transparentMode=true   │              │   options.trans..  │               │
└──────────┘                          └──────────────┘                     └───────┬───────┘
                                                                                   │
                                                           setTransparentMode(true)│
                                                                                   ▼
                                      ┌──────────────┐                     ┌───────────────┐
                                      │  FxModbus    │ ◄─────────────────  │ FxSwUpdateTCP │
                                      │  TCPMaster   │   CRC + RTU format  │               │
                                      └──────────────┘                     └───────────────┘
```

### Par fichier JavaScript

| Fichier | Série | TCP Standard | TCP Transparent |
|---------|:-----:|:------------:|:---------------:|
| FxDevice.js | ✅ | - | - |
| FxDeviceTCP.js | - | ✅ | ✅ |
| FxFwUpdate.js | ✅ | - | - |
| FxFwUpdateTCP.js | - | ❌ | ✅ |
| FxSwUpdate.js | ✅ | - | - |
| FxSwUpdateTCP.js | - | ✅ | ✅ |
| testConnection.js | ✅ | - | - |
| testConnectionTCP.js | - | ✅ | ✅ |

---

## Héritage des classes

```
                    EventEmitter (Node.js)
                           │
           ┌───────────────┴───────────────┐
           │                               │
    FxSerialPort                      FxTcpSocket
           │                               │
    FxModbusRTUMaster               FxModbusTCPMaster
           │                               │
       FxDevice                       FxDeviceTCP
           │                               │
    ┌──────┴──────┐                ┌───────┴───────┐
    │             │                │               │
FxFwUpdate   FxSwUpdate      FxFwUpdateTCP   FxSwUpdateTCP
```

---

## Configuration du mode transparent

Pour activer le mode transparent dans le code :

```javascript
// Création du device
const device = new FxDeviceTCP();

// Connexion
await device.openConnection(host, { tcpPort: 502 });

// Activation du mode transparent
device.setTransparentMode(true);

// Maintenant les commandes propriétaires fonctionnent
await device.askBootVersion([0, 1]);
```

Pour les mises à jour, passer l'option `transparentMode: true` :

```javascript
const options = {
    host: '192.168.1.100',
    tcpPort: 502,
    address: 1,
    transparentMode: true,  // Active le mode transparent
    data: firmwareBuffer
};

fxFwUpdateTCP.program(options);
```
