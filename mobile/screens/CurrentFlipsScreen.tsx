import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { api, Flip } from '../services/api';

export default function CurrentFlipsScreen() {
  const [flips, setFlips] = useState<Flip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    loadFlips();
  }, [loadFlips]);

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
    Alert.prompt(
      'Sell Price',
      'Enter the price you sold it for:',
      async (price) => {
        if (price) {
          Alert.alert(
            'Sell Platform',
            'Where did you sell it?',
            [
              {
                text: 'eBay',
                onPress: () => completeSale(flip, parseFloat(price), 'ebay'),
              },
              {
                text: 'Local',
                onPress: () => completeSale(flip, parseFloat(price), 'local'),
              },
              {
                text: 'Facebook',
                onPress: () => completeSale(flip, parseFloat(price), 'facebook'),
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        }
      },
      'plain-text'
    );
  };

  const completeSale = async (
    flip: Flip,
    sellPrice: number,
    platform: string
  ) => {
    try {
      // Calculate fees (eBay ~13%, others 0)
      const fees = platform === 'ebay' ? sellPrice * 0.13 : 0;

      await api.sellFlip(flip.id, {
        sell_price: sellPrice,
        sell_date: new Date().toISOString().split('T')[0],
        sell_platform: platform,
        fees_paid: fees,
        shipping_cost: 0,
      });

      Alert.alert('Success', 'Sale recorded! Check Profits tab.');
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
    (sum, f) => sum + f.buy_price,
    0
  );

  const renderFlipItem = ({ item }: { item: Flip }) => {
    const daysHeld = calculateDaysHeld(item.buy_date);

    return (
      <View style={styles.flipCard}>
        <View style={styles.flipHeader}>
          <Text style={styles.flipTitle} numberOfLines={2}>
            {item.item_name}
          </Text>
          <Text style={styles.daysHeld}>{daysHeld}d</Text>
        </View>

        <View style={styles.flipDetails}>
          <Text style={styles.buyPrice}>
            Paid: ${item.buy_price.toFixed(2)}
          </Text>
          <Text style={styles.source}>{item.buy_source || 'Unknown'}</Text>
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
  flipTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
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
    justifyContent: 'space-between',
    marginBottom: 8,
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
});
