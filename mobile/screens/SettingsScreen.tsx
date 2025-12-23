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
  Linking,
} from 'react-native';
import { api } from '../services/api';
import { scheduleDemoNotification } from '../services/notifications';
import { useEbay } from '../contexts/EbayContext';

export default function SettingsScreen() {
  const [profitThreshold, setProfitThreshold] = useState('30');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ebayLoading, setEbayLoading] = useState(false);

  // Use shared eBay context (loaded on app launch)
  const { status: ebayStatus, feePercentage: currentFee, refresh: refreshEbay } = useEbay();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await api.getSettings();
      setProfitThreshold(settings.profit_threshold.toString());
      setNotificationsEnabled(settings.notifications_enabled);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkEbay = async () => {
    try {
      setEbayLoading(true);
      const { auth_url } = await api.getEbayAuthUrl();
      if (auth_url) {
        await Linking.openURL(auth_url);
        // After returning, refresh status
        setTimeout(() => refreshEbay(), 2000);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start eBay authorization');
    } finally {
      setEbayLoading(false);
    }
  };

  const handleRefreshEbay = async () => {
    try {
      setEbayLoading(true);
      await api.refreshEbayInfo();
      await refreshEbay();
      Alert.alert('Success', 'eBay account info refreshed');
    } catch (error) {
      Alert.alert('Error', 'Failed to refresh eBay info');
    } finally {
      setEbayLoading(false);
    }
  };

  const handleUnlinkEbay = async () => {
    Alert.alert(
      'Unlink eBay Account',
      'This will remove your eBay account connection. Fees will default to 13%.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.unlinkEbayAccount();
              await refreshEbay();
              Alert.alert('Success', 'eBay account unlinked');
            } catch (error) {
              Alert.alert('Error', 'Failed to unlink eBay account');
            }
          },
        },
      ]
    );
  };

  const saveSettings = async () => {
    try {
      await api.updateSettings({
        profit_threshold: parseFloat(profitThreshold) || 30,
        ebay_fee_percentage: currentFee,
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
        <Text style={styles.sectionTitle}>eBay Account</Text>

        {ebayStatus?.linked ? (
          <>
            <View style={styles.ebayLinked}>
              <View style={styles.ebayStatus}>
                <Text style={styles.ebayStatusLabel}>Status</Text>
                <View style={styles.linkedBadge}>
                  <Text style={styles.linkedBadgeText}>Linked</Text>
                </View>
              </View>
              {ebayStatus.store_tier && (
                <View style={styles.ebayRow}>
                  <Text style={styles.ebayRowLabel}>Store Tier</Text>
                  <Text style={styles.ebayRowValue}>{ebayStatus.store_tier}</Text>
                </View>
              )}
              <View style={styles.ebayRow}>
                <Text style={styles.ebayRowLabel}>Your Fee Rate</Text>
                <Text style={styles.ebayFeeValue}>{currentFee}%</Text>
              </View>
            </View>
            <View style={styles.ebayActions}>
              <TouchableOpacity
                style={styles.ebayRefreshBtn}
                onPress={handleRefreshEbay}
                disabled={ebayLoading}
              >
                <Text style={styles.ebayRefreshBtnText}>
                  {ebayLoading ? 'Refreshing...' : 'Refresh'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ebayUnlinkBtn}
                onPress={handleUnlinkEbay}
              >
                <Text style={styles.ebayUnlinkBtnText}>Unlink</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.ebayUnlinked}>
            <Text style={styles.ebayUnlinkedText}>
              Link your eBay seller account to automatically use your actual fee rates
            </Text>
            <TouchableOpacity
              style={styles.ebayLinkBtn}
              onPress={handleLinkEbay}
              disabled={ebayLoading}
            >
              <Text style={styles.ebayLinkBtnText}>
                {ebayLoading ? 'Connecting...' : 'Link eBay Account'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.ebayDefaultFee}>
              Default fee: 13% (standard seller rate)
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fee Summary</Text>

        <View style={styles.feeInfo}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>eBay Final Value Fee</Text>
            <Text style={styles.feeValue}>{currentFee}%</Text>
          </View>
          <Text style={styles.feeDescription}>
            {ebayStatus?.linked
              ? `Based on your ${ebayStatus.store_tier || 'account'} subscription`
              : 'Link eBay account above for your actual rate'}
          </Text>
        </View>

        <View style={styles.feeInfo}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Facebook Marketplace</Text>
            <Text style={styles.feeValueFree}>0%</Text>
          </View>
          <Text style={styles.feeDescription}>
            No fees for local pickup transactions
          </Text>
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
  feeInfo: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feeLabel: {
    color: '#fff',
    fontSize: 15,
  },
  feeValue: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: 'bold',
  },
  feeValueFree: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  feeDescription: {
    color: '#888',
    fontSize: 12,
  },
  ebayLinked: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  ebayStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ebayStatusLabel: {
    color: '#888',
    fontSize: 14,
  },
  linkedBadge: {
    backgroundColor: '#4ecca3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  linkedBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  ebayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  ebayRowLabel: {
    color: '#888',
    fontSize: 14,
  },
  ebayRowValue: {
    color: '#fff',
    fontSize: 14,
  },
  ebayFeeValue: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  ebayActions: {
    flexDirection: 'row',
    gap: 12,
  },
  ebayRefreshBtn: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  ebayRefreshBtnText: {
    color: '#4ecca3',
    fontSize: 14,
    fontWeight: '600',
  },
  ebayUnlinkBtn: {
    flex: 1,
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  ebayUnlinkBtnText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },
  ebayUnlinked: {
    alignItems: 'center',
    padding: 16,
  },
  ebayUnlinkedText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  ebayLinkBtn: {
    backgroundColor: '#4ecca3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  ebayLinkBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  ebayDefaultFee: {
    color: '#666',
    fontSize: 12,
  },
});
