const fxM24Update = require('./FxM24Update.js');

// const SerialPortest = require('../FxLib/FxUtils/FxSerial.js');


// var port = new SerialPortest('/dev/ttyUSB-EXTERNAL-A9D5YQVH', {
//   baudRate:57600
// });

// SerialPortest.list().then((ports) => {
//   console.log('Ports:', ports);
// });

console.log('start')

const multi24Update = new fxM24Update();


const filename = '1-Multi24-0281.hex';

const filenameSoftware = '1-Fidelixmulti24UnversalOsoftware.M24IEC'

// const options = {
//   'address': 1,
//   //'subaddress': 1,
//   'type': 'm24firmware' ,
//   'port': '/dev/ttyUSB-EXTERNAL-A9D5YQVH',
//   'baudRate': 57600,
// };

const options = {
    'address': 1,
    //'subaddress': 1,
    'type': 'm24software' ,
    'port': '/dev/ttyUSB-EXTERNAL-A9D5YQVH',
    'baudRate': 57600,
  };


multi24Update.update(filenameSoftware, options)
  .then(() => {
    console.log('Mise à jour terminée avec succès');
  })
  .catch((err) => {
    console.error('Erreur lors de la mise à jour :', err);
  });

