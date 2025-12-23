import React, { useState, useCallback, useRef } from 'react';
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
  Animated,
  Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api, Deal } from '../services/api';
import { useEbay } from '../contexts/EbayContext';

// Rickman, TN coordinates
const HOME_LAT = 36.2667;
const HOME_LNG = -85.4167;
const LOCAL_RADIUS_MILES = 100;

// Known city coordinates for distance calculation
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'rickman': { lat: 36.2667, lng: -85.4167 },
  'cookeville': { lat: 36.1628, lng: -85.5016 },
  'nashville': { lat: 36.1627, lng: -86.7816 },
  'knoxville': { lat: 35.9606, lng: -83.9207 },
  'chattanooga': { lat: 35.0456, lng: -85.3097 },
  'memphis': { lat: 35.1495, lng: -90.0490 },
  'lexington': { lat: 38.0406, lng: -84.5037 },
  'louisville': { lat: 38.2527, lng: -85.7585 },
  'bowling green': { lat: 36.9685, lng: -86.4808 },
  'austin': { lat: 30.2672, lng: -97.7431 },
  'dallas': { lat: 32.7767, lng: -96.7970 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'san antonio': { lat: 29.4241, lng: -98.4936 },
  'atlanta': { lat: 33.7490, lng: -84.3880 },
  'birmingham': { lat: 33.5207, lng: -86.8025 },
  'huntsville': { lat: 34.7304, lng: -86.5861 },
};

// Haversine formula for distance between two points
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get distance from home for a deal's location
function getDistanceFromHome(location: string | null): number | null {
  if (!location) return null;
  const cityName = location.toLowerCase().split(',')[0].trim();
  const coords = CITY_COORDS[cityName];
  if (!coords) return null;
  return getDistanceMiles(HOME_LAT, HOME_LNG, coords.lat, coords.lng);
}

type LocationFilter = 'all' | 'local' | 'shipping';

export default function DealsScreen() {
  const navigation = useNavigation<any>();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [needsReview, setNeedsReview] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');

  // Get eBay fee from context (loaded on app launch)
  const { feePercentage } = useEbay();
  const ebayFeeRate = feePercentage / 100; // Convert to decimal (e.g., 13.25 -> 0.1325)
  const [purchaseModal, setPurchaseModal] = useState<{ visible: boolean; deal: Deal | null }>({
    visible: false,
    deal: null,
  });
  const [purchasePrice, setPurchasePrice] = useState('');
  const [fadingDeals, setFadingDeals] = useState<Set<number>>(new Set());
  const fadeAnims = useRef<Map<number, Animated.Value>>(new Map());

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

  // Determine if a deal qualifies for local pickup
  const isLocalPickup = (deal: Deal): boolean => {
    // Priority 1: Backend says local pickup is available (for eBay, etc.)
    if (deal.local_pickup_available === true) {
      return true;
    }

    // Priority 2: Backend calculated distance
    if (deal.distance_miles !== null && deal.distance_miles <= LOCAL_RADIUS_MILES) {
      return true;
    }

    // Priority 3: Calculate from location string (Facebook, Craigslist, etc.)
    const distance = getDistanceFromHome(deal.location);
    return distance !== null && distance <= LOCAL_RADIUS_MILES;
  };

  // Filter deals by location
  const filteredDeals = deals.filter((deal) => {
    if (locationFilter === 'all') return true;
    const isLocal = isLocalPickup(deal);
    if (locationFilter === 'local') {
      return isLocal;
    }
    return !isLocal; // shipping
  });

  // Count deals in each category
  const localCount = deals.filter(isLocalPickup).length;
  const shippingCount = deals.length - localCount;

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDeals();
    }, [loadDeals])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDeals();
  };

  const navigateToDetail = (deal: Deal) => {
    navigation.navigate('DealDetail', { deal });
  };

  const handleConditionUpdate = async (deal: Deal, condition: 'new' | 'used') => {
    try {
      const updatedDeal = await api.updateCondition(deal.id, condition);
      const newMarketValue = Number(updatedDeal.market_value) || 0;
      const newAskingPrice = Number(updatedDeal.asking_price) || 0;
      const newEbayProfit = newMarketValue - newAskingPrice - (newMarketValue * ebayFeeRate);
      const newFacebookProfit = newMarketValue - newAskingPrice;

      if (newFacebookProfit <= 0) {
        // Not profitable - show predictions and let user decide
        Alert.alert(
          'Low Profit Margins',
          `Based on ${condition} market prices:\n\n` +
          `eBay: ${newEbayProfit >= 0 ? '+' : ''}$${newEbayProfit.toFixed(2)}\n` +
          `Facebook: ${newFacebookProfit >= 0 ? '+' : ''}$${newFacebookProfit.toFixed(2)}\n\n` +
          `This deal doesn't look profitable. Delete or keep anyway?`,
          [
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => fadeOutAndRemoveDeal(deal.id),
            },
            {
              text: 'Keep Anyway',
              onPress: () => loadDeals(),
            },
          ]
        );
      } else if (newEbayProfit <= 0 && newFacebookProfit > 0) {
        // Only profitable on Facebook - ask user
        Alert.alert(
          'Facebook Marketplace Only',
          `Based on ${condition} market prices:\n\n` +
          `eBay: -$${Math.abs(newEbayProfit).toFixed(2)} (not profitable)\n` +
          `Facebook: +$${newFacebookProfit.toFixed(2)}\n\n` +
          `This deal is only worth it if you sell on Facebook. Keep it?`,
          [
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => fadeOutAndRemoveDeal(deal.id),
            },
            {
              text: 'Keep for Facebook',
              onPress: () => loadDeals(),
            },
          ]
        );
      } else {
        // Profitable - just reload silently
        loadDeals();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update condition');
    }
  };

  const fadeOutAndRemoveDeal = (dealId: number) => {
    // Get or create animation value for this deal
    if (!fadeAnims.current.has(dealId)) {
      fadeAnims.current.set(dealId, new Animated.Value(1));
    }
    const fadeAnim = fadeAnims.current.get(dealId)!;

    // Mark deal as fading
    setFadingDeals((prev) => new Set(prev).add(dealId));

    // Animate fadeout
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      // After animation, dismiss the deal and reload
      api.dismissDeal(dealId).then(() => {
        setFadingDeals((prev) => {
          const next = new Set(prev);
          next.delete(dealId);
          return next;
        });
        fadeAnims.current.delete(dealId);
        loadDeals();
      });
    });
  };

  const getFadeAnim = (dealId: number): Animated.Value => {
    if (!fadeAnims.current.has(dealId)) {
      fadeAnims.current.set(dealId, new Animated.Value(1));
    }
    return fadeAnims.current.get(dealId)!;
  };

  const handleDismiss = async (deal: Deal) => {
    try {
      await api.dismissDeal(deal.id);
      loadDeals();
    } catch (error) {
      Alert.alert('Error', 'Failed to dismiss deal');
    }
  };

  const handlePurchase = (deal: Deal) => {
    setPurchasePrice(deal.asking_price?.toString() || '');
    setPurchaseModal({ visible: true, deal });
  };

  const confirmPurchase = async () => {
    if (!purchaseModal.deal || !purchasePrice) return;

    try {
      await api.purchaseDeal(purchaseModal.deal.id, {
        buy_price: parseFloat(purchasePrice),
        buy_date: new Date().toISOString().split('T')[0],
      });
      Alert.alert('Success', 'Added to Current Flips');
      setPurchaseModal({ visible: false, deal: null });
      setPurchasePrice('');
      loadDeals();
    } catch (error) {
      Alert.alert('Error', 'Failed to record purchase');
    }
  };

  const confirmConditionUpdate = (item: Deal, condition: 'new' | 'used') => {
    Alert.alert(
      `Set as ${condition.toUpperCase()}?`,
      `This will calculate market value and profit based on ${condition} item prices.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => handleConditionUpdate(item, condition),
        },
      ]
    );
  };

  const renderNeedsReviewItem = ({ item }: { item: Deal }) => (
    <TouchableOpacity
      style={styles.reviewCard}
      onPress={() => navigateToDetail(item)}
      activeOpacity={0.8}
    >
      {/* Thumbnail */}
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={styles.reviewThumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.reviewThumbnailPlaceholder}>
          <Text style={styles.reviewThumbnailText}>📦</Text>
        </View>
      )}
      <Text style={styles.reviewTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.reviewPrice}>
        ${Number(item.asking_price)?.toFixed(2) || '?'}
      </Text>
      <Text style={styles.reviewQuestion}>New or Used?</Text>
      <View style={styles.conditionButtons}>
        <TouchableOpacity
          style={[styles.conditionBtn, styles.newBtn]}
          onPress={(e) => {
            e.stopPropagation();
            confirmConditionUpdate(item, 'new');
          }}
        >
          <Text style={styles.conditionBtnText}>New</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.conditionBtn, styles.usedBtn]}
          onPress={(e) => {
            e.stopPropagation();
            confirmConditionUpdate(item, 'used');
          }}
        >
          <Text style={styles.conditionBtnText}>Used</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderDealItem = ({ item }: { item: Deal }) => {
    const marketValue = Number(item.market_value) || 0;
    const askingPrice = Number(item.asking_price) || 0;
    const ebayProfit = marketValue - askingPrice - (marketValue * ebayFeeRate);
    const facebookProfit = marketValue - askingPrice;
    const bestProfit = Math.max(ebayProfit, facebookProfit);
    const isFacebookOnly = ebayProfit <= 0 && facebookProfit > 0;
    const canPurchase = item.condition !== 'unknown' && item.market_value != null;

    // Blue only for FB-only deals, green otherwise
    const profitColor = isFacebookOnly
      ? '#1877F2' // Facebook blue
      : bestProfit >= 50
        ? '#4ecca3'
        : bestProfit >= 30
          ? '#ffc107'
          : '#888';

    const isFading = fadingDeals.has(item.id);
    const fadeAnim = getFadeAnim(item.id);

    return (
      <Animated.View style={{ opacity: isFading ? fadeAnim : 1 }}>
        <TouchableOpacity
          style={styles.dealCard}
          onPress={() => navigateToDetail(item)}
        >
          <View style={styles.dealHeader}>
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
            <View style={styles.dealHeaderText}>
              <Text style={styles.dealTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
            <View style={[styles.profitBadge, { backgroundColor: profitColor }]}>
              <Text style={[styles.profitText, isFacebookOnly && { color: '#fff' }]}>
                +${bestProfit.toFixed(0)}
              </Text>
            </View>
          </View>

          <View style={styles.dealDetails}>
            <Text style={styles.dealPrice}>
              Asking: ${Number(item.asking_price)?.toFixed(2) || '?'}
            </Text>
            <Text style={[styles.dealMarket, isFacebookOnly && { color: '#1877F2' }]}>
              Market: ${Number(item.market_value)?.toFixed(2) || '?'}
            </Text>
          </View>

          <View style={styles.dealMeta}>
            <Text style={styles.metaText}>{item.source || 'Unknown'}</Text>
            <Text style={[styles.metaText, styles.conditionBadge]}>
              {item.condition || '?'}
            </Text>
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
              style={[
                styles.actionBtn,
                styles.purchaseBtn,
                isFacebookOnly && { backgroundColor: '#1877F2' },
                !canPurchase && styles.purchaseBtnDisabled,
              ]}
              onPress={() => handlePurchase(item)}
              disabled={!canPurchase}
            >
              <Text style={[
                styles.actionBtnText,
                isFacebookOnly && { color: '#fff' },
                !canPurchase && { color: '#666' },
              ]}>
                {canPurchase ? 'I Bought This' : 'Set Condition'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading deals...</Text>
      </View>
    );
  }

  // Render Needs Review section as list header (scrolls with content)
  const renderListHeader = () => {
    if (needsReview.length === 0) return null;

    return (
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
    );
  };

  return (
    <View style={styles.container}>
      {/* Location Filter Tabs - Sticky at top */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, locationFilter === 'all' && styles.filterTabActive]}
          onPress={() => setLocationFilter('all')}
        >
          <Text style={[styles.filterTabText, locationFilter === 'all' && styles.filterTabTextActive]}>
            All ({deals.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, locationFilter === 'local' && styles.filterTabActive]}
          onPress={() => setLocationFilter('local')}
        >
          <Text style={[styles.filterTabText, locationFilter === 'local' && styles.filterTabTextActive]}>
            Pick-up ({localCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, locationFilter === 'shipping' && styles.filterTabActive]}
          onPress={() => setLocationFilter('shipping')}
        >
          <Text style={[styles.filterTabText, locationFilter === 'shipping' && styles.filterTabTextActive]}>
            Shipping ({shippingCount})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredDeals}
        renderItem={renderDealItem}
        keyExtractor={(item) => `deal-${item.id}`}
        ListHeaderComponent={renderListHeader}
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

      {/* Purchase Modal */}
      <Modal
        visible={purchaseModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPurchaseModal({ visible: false, deal: null })}
      >
        {(() => {
          const modalDeal = purchaseModal.deal;
          const modalMarketValue = Number(modalDeal?.market_value) || 0;
          const modalAskingPrice = Number(modalDeal?.asking_price) || 0;
          const modalEbayProfit = modalMarketValue - modalAskingPrice - (modalMarketValue * ebayFeeRate);
          const modalFacebookProfit = modalMarketValue - modalAskingPrice;
          const modalIsFacebookOnly = modalEbayProfit <= 0 && modalFacebookProfit > 0;

          return (
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Purchase Price</Text>
                <Text style={styles.modalSubtitle} numberOfLines={2}>
                  {modalDeal?.title}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  keyboardType="decimal-pad"
                  placeholder="Enter price paid"
                  placeholderTextColor="#666"
                  autoFocus
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setPurchaseModal({ visible: false, deal: null })}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, modalIsFacebookOnly && { backgroundColor: '#1877F2' }]}
                    onPress={confirmPurchase}
                  >
                    <Text style={[styles.modalConfirmText, modalIsFacebookOnly && { color: '#fff' }]}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })()}
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
    textAlign: 'center',
  },
  reviewSection: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  filterTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#333',
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#4ecca3',
  },
  filterTabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#000',
  },
  sectionTitle: {
    color: '#ffc107',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  reviewCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
    width: 150,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  reviewThumbnail: {
    width: '100%',
    height: 70,
    borderRadius: 6,
    marginBottom: 6,
  },
  reviewThumbnailPlaceholder: {
    width: '100%',
    height: 70,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewThumbnailText: {
    fontSize: 24,
  },
  reviewTitle: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 4,
    height: 30,
  },
  reviewPrice: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  reviewQuestion: {
    color: '#ffc107',
    fontSize: 11,
    marginBottom: 6,
  },
  conditionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  conditionBtn: {
    flex: 1,
    padding: 6,
    borderRadius: 5,
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
    fontSize: 12,
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
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 24,
  },
  dealHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  dealTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  conditionBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
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
  purchaseBtnDisabled: {
    backgroundColor: '#333',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
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
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
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
  modalConfirmText: {
    color: '#000',
    fontWeight: '600',
  },
});
