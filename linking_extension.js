function(ext) {
  var ready = false;
  var requesting = false;
  var device;
  var server;
  var services;
  var characteristics;
  var writeCharacteristic;
  var writeCharacteristic2;

  var button_state;
  var clicked = false;
  console.log('test2');]
  
  anyNamedDevice = function() {
    console.log('test3');
    // This is the closest we can get for now to get all devices.
    // https://github.com/WebBluetoothCG/web-bluetooth/issues/234
    return Array.from('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
        .map(c => ({namePrefix: c}))
        .concat({name: ''});
  }

  getSupportedProperties = function(characteristic) {
    console.log('test4');
    let supportedProperties = [];
    for (const p in characteristic.properties) {
      if (characteristic.properties[p] === true) {
        supportedProperties.push(p.toUpperCase());
      }
    }
    return '[' + supportedProperties.join(', ') + ']';
  }

  ext._shutdown = function() {};

  ext._getStatus = async function() {
    console.log('status function called...');
    if (ready) {
      console.log('ready');
      return {status: 2, msg: 'Ready'};
    }
    if (requesting) {
      console.log('requesting');
      return {status: 1, msg: 'Not Ready'};
    }
    console.log('Requesting any Bluetooth Device...');

    try {
      let optionalServices = ["b3b36901-50d3-4044-808d-50835b13a6cd"];
      device = await navigator.bluetooth.requestDevice({
          filters: anyNamedDevice(), optionalServices: optionalServices});
      device.addEventListener('gattserverdisconnected', onDisconnected);
      requesting = true;
      console.log('Connecting to GATT Server...');
      connect();
      ready = true;
      requesting = false;
    } catch(error) {
      console.log('Argh! ' + error);
    }

    return {status: 2, msg: 'Ready'};
  };

  connect = async function() {
    exponentialBackoff(3 /* max retries */, 2 /* seconds delay */,
      async function toTry() {
        time('Connecting to Bluetooth Device... ');
        server = await device.gatt.connect();
        services = await server.getPrimaryServices();
        startNotify(services);
      },
      function success() {
        console.log('> Bluetooth Device connected.');
      },
      function fail() {
        time('Failed to reconnect.');
      });
  }

  startNotify = async function(services) {
    for (const service of services) {
      console.log('> Service: ' + service.uuid);
      characteristics = await service.getCharacteristics();
      characteristics.forEach(characteristic => {
        console.log('>> Characteristic: ' + characteristic.uuid + ' ' +
            getSupportedProperties(characteristic));
        if (characteristic.uuid == 'b3b39101-50d3-4044-808d-50835b13a6cd') {
          console.log('>> addEventListener: write');
          characteristic.startNotifications().then(_ => {
            console.log('> Notifications started');
            characteristic.addEventListener('characteristicvaluechanged',
                function(event) {
                  console.log("write:"+event.target.value);
                });
          });
          writeCharacteristic = characteristic;

        } else {
          console.log('>> addEventListener: indicate');
          writeCharacteristic2 = characteristic;
          characteristic.startNotifications().then(_ => {
            console.log('> Notifications started');
            characteristic.addEventListener('characteristicvaluechanged',
                function(event) {
                    let value = event.target.value;
                    let a = [];
                    for (let i = 0; i < value.byteLength; i++) {
                        a.push('0x' + ('00' + value.getUint8(i).toString(16)).slice(-2));
                    }
                    console.log('indicate> ' + a.join(' '));
                    if (button_state == null) {
                        clicked = true;
                    } else {
                      if (button_state == 'クリックされた' && value.getUint8(9) == 2) {
                        clicked = true;
                      } else if (button_state == 'ダブルクリックされた' && value.getUint8(9) == 4) {
                        clicked = true;
                      } else if (button_state == '長押しされた' && value.getUint8(9) == 7) {
                        clicked = true;
                      } else if (button_state == '長押しが離された' && value.getUint8(9) == 9) {
                        clicked = true;
                      }
                    }
                });
          });
        }
      });
    }
  }

  onDisconnected = function() {
//    ready = false;
    console.log('> Bluetooth Device disconnected');
    connect();
  }

  async function exponentialBackoff(max, delay, toTry, success, fail) {
    try {
      const result = await toTry();
      success(result);
    } catch(error) {
      console.log(error);
      if (max === 0) {
        return fail();
      }
      time('Retrying in ' + delay + 's... (' + max + ' tries left)');
      setTimeout(function() {
        exponentialBackoff(--max, delay * 2, toTry, success, fail);
      }, delay * 1000);
    }
  }

  function time(text) {
    console.log('[' + new Date().toJSON().substr(11, 8) + '] ' + text);
  }

  ext.isButtonClicked = function(btn, state) {
    button_state = state;
    if (clicked) {
      console.log('isButtonClicked');
      clicked = false;
      return true;
    }
    return false;
  };

  ext.whenButton = function(btn, state) {
    button_state = state;
    if (clicked) {
      console.log('whenButton clicked:'+state);
      clicked = false;
      return true;
    }
    return false;
  };

  ext.controlLED = function(val) {
    console.log('controlLED:'+val);
    if (val == 'on') {
      //
      let value;
      value = Uint8Array.of(0x01,0x04,0x08,0x00,0x02,0x07,0x01,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x01,0x01,0x07,0x05,0x0a);
      writeCharacteristic.writeValue(value);
      //LED ON
      setTimeout(function() {
        value = Uint8Array.of(0x00,0x01,0x02,0x00,0x05,0x03,0x02,0x00,0x00,0x80,0x00,0x08,0x02,0x00,0x00,0x01,0x00,0x07,0x02);
        writeCharacteristic.writeValue(value);
        setTimeout(function() {
          value = Uint8Array.of(0x01,0x00,0x00,0x08,0x00,0x10,0x01,0x00,0x00,0x01,0x12,0x05,0x00,0x00,0x01,0x01,0x01,0x01,0x01);
          writeCharacteristic.writeValue(value);
        }, 500);
      }, 500);
    }

  };

  ext.controlACL = function(val) {
    console.log('controlACL:'+val);
    let value;
    if (val == 'on') {
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x01,0x03,0x01,0x00,0x00,0x01);
      writeCharacteristic.writeValue(value);
    } else {
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x01,0x03,0x01,0x00,0x00,0x00);
      writeCharacteristic.writeValue(value);
    }    
  };

  var descriptor = {
    menus: {
      buttons: ['Pochiru'],
      btnStates: ['クリックされた', 'ダブルクリックされた', '長押しされた', '長押しが離された'],
      outputs: ['on', 'off'],
    },
    blocks: [
      ['h', '%m.buttons が %m.btnStates とき', 'whenButton', 'Pochiru', 'クリックされた'],
      ['b', '%m.buttons が %m.btnStates', 'isButtonClicked', 'Pochiru'],
      [' ', 'LED を %m.outputs にする', 'controlLED'],
      [' ', '加速度センサーを %m.outputs にする', 'controlACL', 'on'],
    ]
  };

  //ブロックを登録
  ScratchExtensions.register('Linking Extension', descriptor, ext);
})({});
