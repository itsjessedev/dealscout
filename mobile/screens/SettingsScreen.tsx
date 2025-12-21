import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { api } from '../services/api';
import { scheduleDemoNotification } from '../services/notifications';

export default function SettingsScreen() {
  const [profitThreshold, setProfitThreshold] = useState('30');
  const [ebayFee, setEbayFee] = useState('13');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await api.getSettings();
      setProfitThreshold(settings.profit_threshold.toString());
      setEbayFee(settings.ebay_fee_percentage.toString());
      setNotificationsEnabled(settings.notifications_enabled);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      await api.updateSettings({
        profit_threshold: parseFloat(profitThreshold) || 30,
        ebay_fee_percentage: parseFloat(ebayFee) || 13,
        notifications_enabled: notificationsEnabled,
      });
      Alert.alert('Success', 'Settings saved');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const testNotification = async () => {
    await scheduleDemoNotification();
    Alert.alert('Test Sent', 'You should receive a notification in 2 seconds');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Deal Alerts</Text>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Profit Threshold</Text>
            <Text style={styles.settingDescription}>
              Minimum profit to trigger a notification
            </Text>
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.inputPrefix}>$</Text>
            <TextInput
              style={styles.input}
              value={profitThreshold}
              onChangeText={setProfitThreshold}
              keyboardType="numeric"
              placeholder="30"
              placeholderTextColor="#666"
            />
          </View>
        </View>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Text style={styles.settingDescription}>
              Receive push notifications for deals
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#333', true: '#4ecca3' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profit Calculation</Text>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Default eBay Fee</Text>
            <Text style={styles.settingDescription}>
              Percentage deducted from eBay sales
            </Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={ebayFee}
              onChangeText={setEbayFee}
              keyboardType="numeric"
              placeholder="13"
              placeholderTextColor="#666"
            />
            <Text style={styles.inputSuffix}>%</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Testing</Text>

        <TouchableOpacity style={styles.testButton} onPress={testNotification}>
          <Text style={styles.testButtonText}>Send Test Notification</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
        <Text style={styles.saveButtonText}>Save Settings</Text>
      </TouchableOpacity>

      <View style={styles.about}>
        <Text style={styles.aboutTitle}>DealScout</Text>
        <Text style={styles.aboutVersion}>Version 1.0.0</Text>
        <Text style={styles.aboutDescription}>
          Find profitable deals, track your flips, and maximize your reselling
          profits.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    color: '#4ecca3',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  settingDescription: {
    color: '#888',
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  inputPrefix: {
    color: '#888',
    fontSize: 16,
    marginRight: 4,
  },
  inputSuffix: {
    color: '#888',
    fontSize: 16,
    marginLeft: 4,
  },
  input: {
    color: '#fff',
    fontSize: 16,
    paddingVertical: 10,
    minWidth: 60,
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: '#1a1a2e',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#4ecca3',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  about: {
    padding: 24,
    alignItems: 'center',
  },
  aboutTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  aboutVersion: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  aboutDescription: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
