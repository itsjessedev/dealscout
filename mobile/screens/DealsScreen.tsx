import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { api, Deal } from '../services/api';

export default function DealsScreen() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [needsReview, setNeedsReview] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDeals = useCallback(async () => {
    try {
      const [allDeals, reviewDeals] = await Promise.all([
        api.getDeals({ status: 'new' }),
        api.getDeals({ needs_review: true }),
      ]);
      setDeals(allDeals.filter((d) => d.condition !== 'unknown'));
      setNeedsReview(reviewDeals);
    } catch (error) {
      console.error('Failed to load deals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDeals();
  };

  const openListing = (url: string | null) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  const handleConditionUpdate = async (deal: Deal, condition: 'new' | 'used') => {
    try {
      await api.updateCondition(deal.id, condition);
      loadDeals();
    } catch (error) {
      Alert.alert('Error', 'Failed to update condition');
    }
  };

  const handleDismiss = async (deal: Deal) => {
    try {
      await api.dismissDeal(deal.id);
      loadDeals();
    } catch (error) {
      Alert.alert('Error', 'Failed to dismiss deal');
    }
  };

  const handlePurchase = async (deal: Deal) => {
    Alert.prompt(
      'Purchase Price',
      'Enter the price you paid:',
      async (price) => {
        if (price) {
          try {
            await api.purchaseDeal(deal.id, {
              buy_price: parseFloat(price),
              buy_date: new Date().toISOString().split('T')[0],
            });
            Alert.alert('Success', 'Added to Current Flips');
            loadDeals();
          } catch (error) {
            Alert.alert('Error', 'Failed to record purchase');
          }
        }
      },
      'plain-text',
      deal.asking_price?.toString()
    );
  };

  const renderNeedsReviewItem = ({ item }: { item: Deal }) => (
    <View style={styles.reviewCard}>
      <Text style={styles.reviewTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.reviewPrice}>
        ${item.asking_price?.toFixed(2) || '?'}
      </Text>
      <Text style={styles.reviewQuestion}>New or Used?</Text>
      <View style={styles.conditionButtons}>
        <TouchableOpacity
          style={[styles.conditionBtn, styles.newBtn]}
          onPress={() => handleConditionUpdate(item, 'new')}
        >
          <Text style={styles.conditionBtnText}>New</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.conditionBtn, styles.usedBtn]}
          onPress={() => handleConditionUpdate(item, 'used')}
        >
          <Text style={styles.conditionBtnText}>Used</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDealItem = ({ item }: { item: Deal }) => {
    const profitColor =
      (item.estimated_profit || 0) >= 50
        ? '#4ecca3'
        : (item.estimated_profit || 0) >= 30
        ? '#ffc107'
        : '#888';

    return (
      <TouchableOpacity
        style={styles.dealCard}
        onPress={() => openListing(item.listing_url)}
      >
        <View style={styles.dealHeader}>
          <Text style={styles.dealTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={[styles.profitBadge, { backgroundColor: profitColor }]}>
            <Text style={styles.profitText}>
              +${item.estimated_profit?.toFixed(0) || '?'}
            </Text>
          </View>
        </View>

        <View style={styles.dealDetails}>
          <Text style={styles.dealPrice}>
            Asking: ${item.asking_price?.toFixed(2) || '?'}
          </Text>
          <Text style={styles.dealMarket}>
            Market: ${item.market_value?.toFixed(2) || '?'}
          </Text>
        </View>

        <View style={styles.dealMeta}>
          <Text style={styles.metaText}>{item.source || 'Unknown'}</Text>
          <Text style={styles.metaText}>{item.condition || '?'}</Text>
          <Text style={styles.metaText}>{item.category || ''}</Text>
        </View>

        <View style={styles.dealActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleDismiss(item)}
          >
            <Text style={styles.actionBtnText}>Dismiss</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.purchaseBtn]}
            onPress={() => handlePurchase(item)}
          >
            <Text style={styles.actionBtnText}>I Bought This</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading deals...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {needsReview.length > 0 && (
        <View style={styles.reviewSection}>
          <Text style={styles.sectionTitle}>
            Needs Review ({needsReview.length})
          </Text>
          <FlatList
            horizontal
            data={needsReview}
            renderItem={renderNeedsReviewItem}
            keyExtractor={(item) => `review-${item.id}`}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}

      <FlatList
        data={deals}
        renderItem={renderDealItem}
        keyExtractor={(item) => `deal-${item.id}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No deals yet</Text>
            <Text style={styles.emptySubtext}>
              Deals will appear here when Swoopa sends alerts
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
    textAlign: 'center',
  },
  reviewSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    color: '#ffc107',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    width: 200,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  reviewTitle: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  reviewPrice: {
    color: '#4ecca3',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  reviewQuestion: {
    color: '#ffc107',
    fontSize: 12,
    marginBottom: 8,
  },
  conditionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  conditionBtn: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  newBtn: {
    backgroundColor: '#4ecca3',
  },
  usedBtn: {
    backgroundColor: '#6c757d',
  },
  conditionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dealCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    margin: 8,
    marginHorizontal: 16,
  },
  dealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dealTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  profitBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  profitText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dealDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dealPrice: {
    color: '#fff',
    fontSize: 14,
  },
  dealMarket: {
    color: '#4ecca3',
    fontSize: 14,
  },
  dealMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metaText: {
    color: '#888',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  dealActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#333',
  },
  purchaseBtn: {
    backgroundColor: '#4ecca3',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
