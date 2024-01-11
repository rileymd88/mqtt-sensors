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
import { Client, Message } from 'paho-mqtt';
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
  const [mqttPort, setMqttPort] = useState<string>('9001');
  const [publishInterval, setPublishInterval] = useState<string>('2');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [accelerometerData, setAccelerometerData] = useState<any>({});
  const [gyroscopeData, setGyroscopeData] = useState<any>({});
  const [magnetometerData, setMagnetometerData] = useState<any>({});
  const [barometerData, setBarometerData] = useState<any>({});
  const [deviceMotionData, setDeviceMotionData] = useState<any>({});
  const [pedometerData, setPedometerData] = useState<any>({});
  const [batteryLevel, setBatteryLevel] = useState<number>(0);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);


  let client: Client;
  let pedometer: Pedometer.Subscription;

  const requestPermissions = async () => {
    await Location.requestForegroundPermissionsAsync();
    await Pedometer.requestPermissionsAsync();
  };

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

  const subscribeToPedometer = async () => {
    const isAvailable = await Pedometer.isAvailableAsync();
    if (isAvailable) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 1);

      const pastStepCountResult = await Pedometer.getStepCountAsync(start, end);
      if (pastStepCountResult) {
        setPedometerData(pastStepCountResult.steps);
      }
      return Pedometer.watchStepCount(result => {
        setPedometerData(result.steps);
      });
    }
  };

  const addListeners = () => {
    Accelerometer.setUpdateInterval(1000);
    Gyroscope.setUpdateInterval(1000);
    Magnetometer.setUpdateInterval(1000);
    DeviceMotion.setUpdateInterval(1000);
    Barometer.setUpdateInterval(1000);

    Accelerometer.addListener(data => setAccelerometerData(data));
    Gyroscope.addListener(data => setGyroscopeData(data));
    Magnetometer.addListener(data => setMagnetometerData(data));
    DeviceMotion.addListener(data => setDeviceMotionData(data));
    Barometer.addListener(data => setBarometerData(data));
  };

  const removeListeners = () => {
    Accelerometer.removeAllListeners();
    Gyroscope.removeAllListeners();
    Magnetometer.removeAllListeners();
    DeviceMotion.removeAllListeners();
    Barometer.removeAllListeners();
  };

  const connectClient = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      client.connect({
        onSuccess: () => {
          console.log('MQTT Connected');
          resolve();
        },
        onFailure: (error) => {
          console.log('MQTT Connection Failed:', error.errorMessage);
          reject(error.errorMessage);
        },
      });
    });
  };

  const publishMessage = () => {
    const message = new Message(JSON.stringify({
      accelerometer: accelerometerData,
      gyroscope: gyroscopeData,
      magnetometer: magnetometerData,
      barometer: barometerData,
      deviceMotion: deviceMotionData,
      pedometer: pedometerData,
      batteryLevel: batteryLevel,
      location: location,
    }));
    console.log("message", message);
    message.destinationName = "sensors";
    client.send(message);
  };

  const setupMQTT = async () => {
    client = new Client(mqttServer, Number(mqttPort), '/', 'mqtt-sensors');

    client.onConnectionLost = (responseObject: { errorCode: number; errorMessage: string }) => {
      console.log('MQTT Connection Lost:', responseObject.errorMessage);
    };

    client.onMessageArrived = (message: Message) => {
      console.log('MQTT Message Arrived:', message.payloadString);
    };

    try {
      await connectClient();
      
      console.log('message sent!')
    } catch (error) {
      console.error('MQTT Setup Error:', error);
    }
  };

  const fetchSensorData = async () => {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    const location = await Location.getCurrentPositionAsync({});
    setBatteryLevel(batteryLevel);
    setLocation(location);
  };

  useEffect(() => {
    readData();
    requestPermissions();
  }, []);

  useEffect(() => {
    async function setup() {
      addListeners();
      const p = await subscribeToPedometer();
        if (p) pedometer = p;
    }
    setup();
    return () => {
      removeListeners();
      pedometer?.remove();
    };
  }, []);


  useEffect(() => {
    saveData();
  }, [mqttServer, mqttPort, publishInterval]);

  useEffect(() => {
    async function setup() {
      if (isConnected) {
        await setupMQTT();
      } else {
        client?.disconnect();
      }
    }
    setup();
    return () => {
      client?.disconnect();
    }
  }, [isConnected, mqttServer, mqttPort, publishInterval]);

  useEffect(() => {
    saveData();
  }, [mqttServer, mqttPort, publishInterval]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSensorData();
      if (isConnected) {
        publishMessage();
      }
    }, parseInt(publishInterval) * 1000);
    return () => clearInterval(interval);
  }, [publishInterval, isConnected]);

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
        placeholder="MQTT Port"
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
