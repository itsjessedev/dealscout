import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, Flip } from '../services/api';
import { useEbay } from '../contexts/EbayContext';

export default function CurrentFlipsScreen() {
  const [flips, setFlips] = useState<Flip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sellModal, setSellModal] = useState<{ visible: boolean; flip: Flip | null }>({
    visible: false,
    flip: null,
  });
  const [sellPrice, setSellPrice] = useState('');
  const [sellPlatform, setSellPlatform] = useState<string | null>(null);

  // Get eBay fee from context
  const { feePercentage } = useEbay();
  const ebayFeeRate = feePercentage / 100;

  const loadFlips = useCallback(async () => {
    try {
      const data = await api.getFlips({ status: 'active' });
      setFlips(data);
    } catch (error) {
      console.error('Failed to load flips:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadFlips();
    }, [loadFlips])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadFlips();
  };

  const calculateDaysHeld = (buyDate: string): number => {
    const buy = new Date(buyDate);
    const now = new Date();
    return Math.floor((now.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleSell = (flip: Flip) => {
    setSellPrice('');
    setSellPlatform(null);
    setSellModal({ visible: true, flip });
  };

  const confirmSell = async () => {
    if (!sellModal.flip || !sellPrice || !sellPlatform) return;

    try {
      // Calculate fees (eBay uses actual rate from account, others 0)
      const price = parseFloat(sellPrice);
      const fees = sellPlatform === 'ebay' ? price * ebayFeeRate : 0;

      await api.sellFlip(sellModal.flip.id, {
        sell_price: price,
        sell_date: new Date().toISOString().split('T')[0],
        sell_platform: sellPlatform,
        fees_paid: fees,
        shipping_cost: 0,
      });

      Alert.alert('Success', 'Sale recorded! Check Profits tab.');
      setSellModal({ visible: false, flip: null });
      setSellPrice('');
      setSellPlatform(null);
      loadFlips();
    } catch (error) {
      Alert.alert('Error', 'Failed to record sale');
    }
  };

  const handleDelete = (flip: Flip) => {
    Alert.alert(
      'Delete Flip',
      `Remove "${flip.item_name}" from your inventory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteFlip(flip.id);
              loadFlips();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const totalInventoryValue = flips.reduce(
    (sum, f) => sum + (Number(f.buy_price) || 0),
    0
  );

  const renderFlipItem = ({ item }: { item: Flip }) => {
    const daysHeld = calculateDaysHeld(item.buy_date);

    return (
      <View style={styles.flipCard}>
        <View style={styles.flipHeader}>
          {/* Thumbnail */}
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Text style={styles.thumbnailPlaceholderText}>📦</Text>
            </View>
          )}
          <View style={styles.flipHeaderText}>
            <Text style={styles.flipTitle} numberOfLines={2}>
              {item.item_name}
            </Text>
            <View style={styles.flipDetails}>
              <Text style={styles.buyPrice}>
                Paid: ${Number(item.buy_price).toFixed(2)}
              </Text>
              <Text style={styles.source}>{item.buy_source || 'Unknown'}</Text>
            </View>
          </View>
          <Text style={styles.daysHeld}>{daysHeld}d</Text>
        </View>

        {item.category && (
          <Text style={styles.category}>{item.category}</Text>
        )}

        <View style={styles.flipActions}>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sellBtn}
            onPress={() => handleSell(item)}
          >
            <Text style={styles.sellBtnText}>Mark Sold</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryBar}>
        <Text style={styles.summaryLabel}>Total Inventory Value</Text>
        <Text style={styles.summaryValue}>
          ${totalInventoryValue.toFixed(2)}
        </Text>
        <Text style={styles.summaryCount}>{flips.length} items</Text>
      </View>

      <FlatList
        data={flips}
        renderItem={renderFlipItem}
        keyExtractor={(item) => `flip-${item.id}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No active flips</Text>
            <Text style={styles.emptySubtext}>
              Purchase deals to track them here
            </Text>
          </View>
        }
      />

      {/* Sell Modal */}
      <Modal
        visible={sellModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSellModal({ visible: false, flip: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mark as Sold</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {sellModal.flip?.item_name}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={sellPrice}
              onChangeText={setSellPrice}
              keyboardType="decimal-pad"
              placeholder="Enter sell price"
              placeholderTextColor="#666"
              autoFocus
            />

            <Text style={styles.platformLabel}>Where did you sell it?</Text>
            <View style={styles.platformButtons}>
              {['ebay', 'facebook'].map((platform) => (
                <TouchableOpacity
                  key={platform}
                  style={[
                    styles.platformBtn,
                    sellPlatform === platform && styles.platformBtnActive,
                  ]}
                  onPress={() => setSellPlatform(platform)}
                >
                  <Text
                    style={[
                      styles.platformBtnText,
                      sellPlatform === platform && styles.platformBtnTextActive,
                    ]}
                  >
                    {platform === 'ebay' ? 'eBay' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSellModal({ visible: false, flip: null })}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  (!sellPrice || !sellPlatform) && styles.modalConfirmBtnDisabled,
                ]}
                onPress={confirmSell}
                disabled={!sellPrice || !sellPlatform}
              >
                <Text style={styles.modalConfirmText}>Confirm Sale</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    padding: 20,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 14,
  },
  summaryBar: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#4ecca3',
    fontSize: 28,
    fontWeight: 'bold',
  },
  summaryCount: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  flipCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    margin: 8,
    marginHorizontal: 16,
  },
  flipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbnailPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 20,
  },
  flipHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  flipTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  daysHeld: {
    color: '#888',
    fontSize: 14,
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  flipDetails: {
    flexDirection: 'row',
    gap: 8,
  },
  buyPrice: {
    color: '#fff',
    fontSize: 14,
  },
  source: {
    color: '#888',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  category: {
    color: '#4ecca3',
    fontSize: 12,
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  flipActions: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#333',
  },
  deleteBtnText: {
    color: '#ff6b6b',
    fontWeight: '600',
  },
  sellBtn: {
    flex: 2,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#4ecca3',
  },
  sellBtnText: {
    color: '#000',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 16,
    color: '#fff',
    fontSize: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  platformLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  platformButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  platformBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  platformBtnActive: {
    backgroundColor: '#4ecca3',
  },
  platformBtnText: {
    color: '#888',
    fontWeight: '600',
  },
  platformBtnTextActive: {
    color: '#000',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#4ecca3',
    alignItems: 'center',
  },
  modalConfirmBtnDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  modalConfirmText: {
    color: '#000',
    fontWeight: '600',
  },
});
