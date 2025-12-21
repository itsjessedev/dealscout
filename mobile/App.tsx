import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';

import DealsScreen from './screens/DealsScreen';
import CurrentFlipsScreen from './screens/CurrentFlipsScreen';
import ProfitsScreen from './screens/ProfitsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { registerForPushNotifications } from './services/notifications';

const Tab = createBottomTabNavigator();

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications();

    // Handle notification taps
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log('Notification tapped:', data);
        // TODO: Navigate to specific deal/screen based on data
      }
    );

    return () => subscription.remove();
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
          tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#333' },
          tabBarActiveTintColor: '#4ecca3',
          tabBarInactiveTintColor: '#888',
        }}
      >
        <Tab.Screen
          name="Deals"
          component={DealsScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon name="$" color={color} />,
          }}
        />
        <Tab.Screen
          name="Current Flips"
          component={CurrentFlipsScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon name="↻" color={color} />,
          }}
        />
        <Tab.Screen
          name="Profits"
          component={ProfitsScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon name="📊" color={color} />,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon name="⚙" color={color} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// Simple icon component (replace with proper icons later)
function TabIcon({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 20 }}>{name}</Text>
    </View>
  );
}
