(function(ext) {
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

  var temperatureTimerId = 0;
  var humidityTimerId = 0;
  var airPressureTimerId = 0;

  var temperature = -300;
  var humidity = -1;
  var airPressure = -300;

  var mask_sign =             0b00000000000000000000100000000000; // sign bit of temperature
  var mask_temp_exponent =    0b00000000000000000000011110000000; // exponentData of temperature
  var mask_temp_fixed_point = 0b00000000000000000000000001111111; // fixedPointData of temperature
  var mask_hum_exponent =     0b00000000000000000000111100000000; // exponentData of humidity
  var mask_hum_fixed_point =  0b00000000000000000000000011111111; // fixedPointData of humidity
  var mask_pre_exponent =     0b00000000000000000000111110000000; // exponentData of pressure
  var mask_pre_fixed_point =  0b00000000000000000000000001111111; // fixedPointData of pressure



  anyNamedDevice = function() {
    // This is the closest we can get for now to get all devices.
    // https://github.com/WebBluetoothCG/web-bluetooth/issues/234
    return Array.from('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
        .map(c => ({namePrefix: c}))
        .concat({name: ''});
  }

  getSupportedProperties = function(characteristic) {
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
    return {status: 2, msg: 'Ready'};
  };

  connect = async function() {
    exponentialBackoff(3 /* max retries */, 2 /* seconds delay */,
      async function toTry() {
        time('Connecting to Bluetooth Device... ');
        server = await device.gatt.connect();
        time('Connected...');
        services = await server.getPrimaryServices();
        time('Service Discovered...');
        startNotify(services);
        time('Start Notify');
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
                    sensorType = value.getUint8(9);
                    if (value.byteLength>14) {
                      sensorData = (value.getUint8(15) << 8) + value.getUint8(14);
                      console.log('sensorData> 0x'+sensorData.toString(16));
                      if (sensorType == 4) {
                        signCode = ((sensorData & mask_sign) === 0) ? 1 : -1;
                        exponentData = (sensorData & mask_temp_exponent) >>> 7;
                        fixedPointData = (sensorData & mask_temp_fixed_point) << 1;
                        temperature = signCode*(1 + fixedPointData/256)*Math.pow(2, exponentData - 7);
                      } else if (sensorType == 5) {
                        exponentData = (sensorData & mask_temp_exponent) >>> 8;
                        fixedPointData = (sensorData & mask_temp_fixed_point);
                        humidity = (1 + fixedPointData/256)*Math.pow(2, exponentData - 7);                        
                      } else if (sensorType == 6) {
                        exponentData = (sensorData & mask_pre_exponent) >>> 7;
                        fixedPointData = (sensorData & mask_pre_fixed_point)  << 1;
                        airPressure = (1 + fixedPointData/256)*Math.pow(2, exponentData - 15);
                      }
                    }
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
//    connect();
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

  ext.controlTemperature = function(val) {
    console.log('controlTemperature:'+val);
    let value;
    if (val == 'on') {
      if (temperatureTimerId != 0) {
        clearInterval(temperatureTimerId);
      }
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x04,0x03,0x01,0x00,0x00,0x01);
      writeCharacteristic.writeValue(value);
      Timer = function() {
        value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x04,0x03,0x01,0x00,0x00,0x01);
        writeCharacteristic.writeValue(value);
      };
      temperatureTimerId = setInterval(Timer, 10000);//10秒に1回
    } else {
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x04,0x03,0x01,0x00,0x00,0x00);
      writeCharacteristic.writeValue(value);
      if (temperatureTimerId != 0) {
        clearInterval(temperatureTimerId);
      }
      temperatureTimerId = 0;
    }
  };

  ext.controlHumidity = function(val) {
    console.log('controlHumidity:'+val);
    let value;
    if (val == 'on') {
      if (humidityTimerId != 0) {
        clearInterval(humidityTimerId);
      }
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x05,0x03,0x01,0x00,0x00,0x01);
      writeCharacteristic.writeValue(value);
      Timer = function() {
        value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x05,0x03,0x01,0x00,0x00,0x01);
        writeCharacteristic.writeValue(value);
      };
      humidityTimerId = setInterval(Timer, 1000);//10秒に1回
    } else {
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x05,0x03,0x01,0x00,0x00,0x00);
      writeCharacteristic.writeValue(value);
      if (humidityTimerId != 0) {
        clearInterval(humidityTimerId);
      }
      humidityTimerId = 0;
    }
  };

  ext.controlAirPressure = function(val) {
    console.log('controlAirPressure:'+val);
    let value;
    if (val == 'on') {
      if (airPressureTimerId != 0) {
        clearInterval(airPressureTimerId);
      }
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x06,0x03,0x01,0x00,0x00,0x01);
      writeCharacteristic.writeValue(value);
      Timer = function() {
        value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x06,0x03,0x01,0x00,0x00,0x01);
        writeCharacteristic.writeValue(value);
      };
      airPressureTimerId = setInterval(Timer, 1000);//10秒に1回
    } else {
      value = Uint8Array.of(0x01,0x03,0x02,0x00,0x02,0x02,0x01,0x00,0x00,0x06,0x03,0x01,0x00,0x00,0x00);
      writeCharacteristic.writeValue(value);
      if (airPressureTimerId != 0) {
        clearInterval(airPressureTimerId);
      }
      airPressureTimerId = 0;
    }
  };

  ext.getDeviceStatus = function() {
    if (device != null) {
      if (device.gatt.connected) {
        return "接続済み";
      } else {
        return "接続中";        
      }
    } else {
        return "未接続";
      }  
  }

  ext.getTemperature = function() {
    if (temperature==-300) {
      return false;
    }    
    return temperature;
  }

  ext.getHumidity = function() {
    if (humidity==-1) {
      return false;
    }    
    return humidity;
  }

  ext.getAirPressure = function() {
    if (airPressure==-300) {
      return false;
    }    
    return airPressure;
  }

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

  ext.controlConnect = async function(val) {
    console.log('controlConnect:'+val);
    let value;
    if (val == '接続') {
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
    } else {
      if (!device) {
        return;
      }
      console.log('disconnectting...');
      if (device.gatt.connected) {
        device.gatt.disconnect();
      } else {
        console.log('> Bluetooth Device is already disconnected');
      }
    }
  };

  var descriptor = {
    menus: {
      buttons: ['Pochiru'],
      btnStates: ['クリックされた', 'ダブルクリックされた', '長押しされた', '長押しが離された'],
      outputs: ['on', 'off'],
      connects: ['接続', '切断'],
    },
    blocks: [
      [' ', 'センサーと %m.connects する', 'controlConnect', '接続'],
      ['r', 'デバイス状態', 'getDeviceStatus'],
      ['r', '温度', 'getTemperature'],
      ['r', '湿度', 'getHumidity'],
      ['r', '気圧', 'getAirPressure'],
      ['h', '%m.buttons が %m.btnStates とき', 'whenButton', 'Pochiru', 'クリックされた'],
      ['b', '%m.buttons が %m.btnStates', 'isButtonClicked', 'Pochiru'],
      [' ', 'LED を %m.outputs にする', 'controlLED'],
      [' ', '温度センサーを %m.outputs にする', 'controlTemperature', 'on'],
      [' ', '湿度センサーを %m.outputs にする', 'controlHumidity', 'on'],
      [' ', '気圧センサーを %m.outputs にする', 'controlAirPressure', 'on'],
      [' ', '加速度センサーを %m.outputs にする', 'controlACL', 'on'],
    ]
  };

  //ブロックを登録
  ScratchExtensions.register('Linking Extension', descriptor, ext);
})({});
