import React, { useState, useEffect } from 'react';
import { Text, View, TextInput, Button, StyleSheet } from 'react-native';
import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  Barometer,
  DeviceMotion,
  Pedometer,
} from 'expo-sensors';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import mqtt, { MqttClient } from 'mqtt';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SensorData {
  accelerometer?: any;
  gyroscope?: any;
  magnetometer?: any;
  barometer?: any;
  deviceMotion?: any;
  pedometer?: number;
  batteryLevel?: number;
  location?: Location.LocationObject;
}

const App: React.FC = () => {
  const [mqttServer, setMqttServer] = useState<string>('');
  const [mqttPort, setMqttPort] = useState<string>('1883');
  const [publishInterval, setPublishInterval] = useState<string>('1');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [sensorData, setSensorData] = useState<SensorData>({});
  let client: MqttClient;
  let locationSubscription: Location.LocationSubscription;

  const saveData = async () => {
    try {
      await AsyncStorage.setItem('mqttServer', mqttServer);
      await AsyncStorage.setItem('mqttPort', mqttPort);
      await AsyncStorage.setItem('publishInterval', publishInterval);
    } catch (e) {
      console.error(e);
    }
  };

  const readData = async () => {
    try {
      const server = await AsyncStorage.getItem('mqttServer');
      const port = await AsyncStorage.getItem('mqttPort');
      const interval = await AsyncStorage.getItem('publishInterval');
      if (server !== null) setMqttServer(server);
      if (port !== null) setMqttPort(port);
      if (interval !== null) setPublishInterval(interval);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    readData();
    requestPermissions();
  }, []);

  useEffect(() => {
    saveData();
  }, [mqttServer, mqttPort, publishInterval]);

  useEffect(() => {
    if (isConnected) {
      setupMQTT();
    } else {
      client?.end();
    }
  }, [isConnected, mqttServer, mqttPort, publishInterval]);

  useEffect(() => {
    saveData();
  }, [mqttServer, mqttPort, publishInterval]);

  const requestPermissions = async () => {
    await Location.requestForegroundPermissionsAsync();
    await Pedometer.requestPermissionsAsync();
  };

  const setupMQTT = () => {
    client = mqtt.connect(`mqtt://${mqttServer}:${mqttPort}`);

    const updateInterval = parseInt(publishInterval) * 1000;

    Accelerometer.setUpdateInterval(updateInterval);
    Gyroscope.setUpdateInterval(updateInterval);
    Magnetometer.setUpdateInterval(updateInterval);
    DeviceMotion.setUpdateInterval(updateInterval);
    Barometer.setUpdateInterval(updateInterval);

    Accelerometer.addListener(data => {
      setSensorData(prevData => ({ ...prevData, accelerometer: data }));
    });

    Gyroscope.addListener(data => {
      setSensorData(prevData => ({ ...prevData, gyroscope: data }));
    });

    Magnetometer.addListener(data => {
      setSensorData(prevData => ({ ...prevData, magnetometer: data }));
    });

    Barometer.addListener(data => {
      setSensorData(prevData => ({ ...prevData, barometer: data }));
    });

    DeviceMotion.addListener(data => {
      setSensorData(prevData => ({ ...prevData, deviceMotion: data }));
    });

    Pedometer.watchStepCount(result => {
      setSensorData(prevData => ({ ...prevData, pedometer: result.steps }));
    });

    const batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setSensorData(prevData => ({ ...prevData, batteryLevel }));
    });

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: updateInterval,
      },
      location => {
        setSensorData(prevData => ({ ...prevData, location }));
      }
    );

    const interval = setInterval(() => {
      if (client.connected) {
        client.publish('sensor/data', JSON.stringify(sensorData));
      }
    }, updateInterval);

    return () => {
      clearInterval(interval);
      Accelerometer.removeAllListeners();
      Gyroscope.removeAllListeners();
      Magnetometer.removeAllListeners();
      DeviceMotion.removeAllListeners();
      Barometer.removeAllListeners();
      batterySubscription?.remove();
      locationSubscription?.remove();
    };
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="MQTT Server Host"
        value={mqttServer}
        onChangeText={setMqttServer}
      />
      <TextInput
        style={styles.input}
        placeholder="MQTT Port (default 1883)"
        value={mqttPort}
        onChangeText={setMqttPort}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="Publish Interval (seconds)"
        value={publishInterval}
        onChangeText={setPublishInterval}
        keyboardType="numeric"
      />
      <Button
        title={isConnected ? "Disconnect" : "Connect"}
        onPress={() => setIsConnected(!isConnected)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    width: '100%',
    marginBottom: 10,
    padding: 10,
  },
});

export default App;
