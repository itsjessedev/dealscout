import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import DealsScreen from './screens/DealsScreen';
import DealDetailScreen from './screens/DealDetailScreen';
import CurrentFlipsScreen from './screens/CurrentFlipsScreen';
import ListItemScreen from './screens/ListItemScreen';
import ProfitsScreen from './screens/ProfitsScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import { registerForPushNotifications } from './services/notifications';
import { EbayProvider } from './contexts/EbayContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Get status bar height for Android
const statusBarHeight = Constants.statusBarHeight || 0;

// Deals stack with detail screen
function DealsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
        headerStatusBarHeight: statusBarHeight,
      }}
    >
      <Stack.Screen
        name="DealsList"
        component={DealsScreen}
        options={{ title: 'Deals' }}
      />
      <Stack.Screen
        name="DealDetail"
        component={DealDetailScreen}
        options={{ title: 'Deal Details' }}
      />
    </Stack.Navigator>
  );
}

// Flips stack with listing screen
function FlipsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
        headerStatusBarHeight: statusBarHeight,
      }}
    >
      <Stack.Screen
        name="FlipsList"
        component={CurrentFlipsScreen}
        options={{ title: 'Current Flips' }}
      />
      <Stack.Screen
        name="ListItem"
        component={ListItemScreen}
        options={{ title: 'List on eBay' }}
      />
    </Stack.Navigator>
  );
}

// Main app navigator component
function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const [skippedLogin, setSkippedLogin] = React.useState(false);

  useEffect(() => {
    // Register for push notifications only when authenticated
    if (isAuthenticated) {
      registerForPushNotifications();
    }

    // Handle notification taps
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log('Notification tapped:', data);
        // TODO: Navigate to specific deal/screen based on data
      }
    );

    return () => subscription.remove();
  }, [isAuthenticated]);

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4ecca3" />
      </View>
    );
  }

  // Show login screen if not authenticated (and hasn't skipped)
  if (!isAuthenticated && !skippedLogin) {
    return <LoginScreen onSkip={() => setSkippedLogin(true)} />;
  }

  // Show main app when authenticated
  return (
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
        component={DealsStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="$" color={color} />,
        }}
      />
      <Tab.Screen
        name="Current Flips"
        component={FlipsStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="↻" color={color} />,
        }}
      />
      <Tab.Screen
        name="Profits"
        component={ProfitsScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon name="↗" color={color} />,
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
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <EbayProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <AppNavigator />
          </NavigationContainer>
        </EbayProvider>
      </AuthProvider>
    </SafeAreaProvider>
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
