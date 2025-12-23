import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  Alert,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { api, Deal } from '../services/api';
import { useEbay } from '../contexts/EbayContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type RootStackParamList = {
  DealDetail: { deal: Deal };
};

export default function DealDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'DealDetail'>>();
  const [deal, setDeal] = useState<Deal>(route.params.deal);
  const [processing, setProcessing] = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [fadeAnim] = useState(new Animated.Value(1));
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [customValueModal, setCustomValueModal] = useState(false);
  const [customValue, setCustomValue] = useState('');

  // Get images array (support multiple images in future, fallback to single)
  const images: string[] = deal.image_urls?.length
    ? deal.image_urls
    : deal.image_url
      ? [deal.image_url]
      : [];

  // Get eBay fee from context (loaded on app launch)
  const { feePercentage } = useEbay();
  const ebayFeeRate = feePercentage / 100; // Convert to decimal

  // Calculate profits for different platforms
  const marketValue = Number(deal.market_value) || 0;
  const askingPrice = Number(deal.asking_price) || 0;

  const ebayProfit = marketValue - askingPrice - (marketValue * ebayFeeRate);
  const facebookProfit = marketValue - askingPrice; // No fees

  const bestProfit = Math.max(ebayProfit, facebookProfit);
  const isFacebookOnly = ebayProfit <= 0 && facebookProfit > 0;
  const canPurchase = deal.condition !== 'unknown' && deal.market_value != null;

  // Blue only for FB-only deals, otherwise graded green/yellow
  const profitColor = isFacebookOnly
    ? '#1877F2' // Facebook blue
    : bestProfit >= 50
      ? '#4ecca3'
      : bestProfit >= 30
        ? '#ffc107'
        : '#888';

  const openListing = () => {
    if (deal.listing_url) {
      Linking.openURL(deal.listing_url);
    }
  };

  const handleConditionChange = async (newCondition: 'new' | 'used') => {
    if (newCondition === deal.condition || processing) return;

    setProcessing(true);
    try {
      const updatedDeal = await api.updateCondition(deal.id, newCondition);
      const newMarketValue = Number(updatedDeal.market_value) || 0;
      const newAskingPrice = Number(updatedDeal.asking_price) || 0;

      // Calculate platform-specific profits
      const newEbayProfit = newMarketValue - newAskingPrice - (newMarketValue * ebayFeeRate);
      const newFacebookProfit = newMarketValue - newAskingPrice;

      if (newFacebookProfit <= 0) {
        // Not profitable on any platform - show predictions and let user decide
        Alert.alert(
          'Low Profit Margins',
          `Based on ${newCondition} market prices:\n\n` +
          `eBay: ${newEbayProfit >= 0 ? '+' : ''}$${newEbayProfit.toFixed(2)}\n` +
          `Facebook: ${newFacebookProfit >= 0 ? '+' : ''}$${newFacebookProfit.toFixed(2)}\n\n` +
          `This deal doesn't look profitable. Delete or keep anyway?`,
          [
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                Animated.timing(fadeAnim, {
                  toValue: 0,
                  duration: 500,
                  useNativeDriver: true,
                }).start(() => {
                  api.dismissDeal(deal.id).then(() => {
                    navigation.goBack();
                  });
                });
              },
            },
            {
              text: 'Keep Anyway',
              onPress: () => {
                setDeal(updatedDeal);
              },
            },
          ]
        );
      } else if (newEbayProfit <= 0 && newFacebookProfit > 0) {
        // Only profitable on Facebook - ask user
        Alert.alert(
          'Facebook Marketplace Only',
          `Based on ${newCondition} market prices:\n\n` +
          `eBay: -$${Math.abs(newEbayProfit).toFixed(2)} (not profitable)\n` +
          `Facebook: +$${newFacebookProfit.toFixed(2)}\n\n` +
          `This deal is only worth it if you sell on Facebook. Keep it?`,
          [
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                Animated.timing(fadeAnim, {
                  toValue: 0,
                  duration: 500,
                  useNativeDriver: true,
                }).start(() => {
                  api.dismissDeal(deal.id).then(() => {
                    navigation.goBack();
                  });
                });
              },
            },
            {
              text: 'Keep for Facebook',
              onPress: () => {
                setDeal(updatedDeal);
              },
            },
          ]
        );
      } else {
        // Profitable on eBay (and Facebook) - update silently
        setDeal(updatedDeal);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update condition');
    } finally {
      setProcessing(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await api.dismissDeal(deal.id);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to dismiss deal');
    }
  };

  const handlePurchase = () => {
    setPurchasePrice(deal.asking_price?.toString() || '');
    setPurchaseModal(true);
  };

  const confirmPurchase = async () => {
    if (!purchasePrice) return;

    try {
      await api.purchaseDeal(deal.id, {
        buy_price: parseFloat(purchasePrice),
        buy_date: new Date().toISOString().split('T')[0],
      });
      Alert.alert('Success', 'Added to Current Flips');
      setPurchaseModal(false);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to record purchase');
    }
  };

  const handleCustomValue = () => {
    setCustomValue(deal.market_value?.toString() || '');
    setCustomValueModal(true);
  };

  const confirmCustomValue = async () => {
    if (!customValue) return;

    setProcessing(true);
    try {
      const updatedDeal = await api.updateMarketValue(deal.id, parseFloat(customValue));
      setDeal(updatedDeal);
      setCustomValueModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update market value');
    } finally {
      setProcessing(false);
    }
  };

  // Price status helpers
  const getPriceStatusColor = (status: string | null) => {
    switch (status) {
      case 'accurate':
        return '#4ecca3'; // green - good data
      case 'user_set':
        return '#4ecca3'; // green - user confirmed
      case 'similar_prices':
      case 'limited_data':
        return '#ffc107'; // yellow - warning
      case 'no_data':
      case 'mock_data':
        return '#ff6b6b'; // red - unreliable
      default:
        return '#888';
    }
  };

  const shouldShowCustomValueOption = () => {
    return ['similar_prices', 'limited_data', 'no_data', 'mock_data'].includes(deal.price_status || '');
  };

  const renderImageItem = ({ item, index }: { item: string; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => setFullscreenImage(item)}
    >
      <Image
        source={{ uri: item }}
        style={styles.carouselImage}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  const onImageScroll = (event: any) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveImageIndex(slideIndex);
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView style={styles.scrollView}>
        {/* Image Carousel */}
        <View style={styles.imageContainer}>
          {images.length > 0 ? (
            <>
              <FlatList
                data={images}
                renderItem={renderImageItem}
                keyExtractor={(item, index) => `img-${index}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onImageScroll}
                scrollEventThrottle={16}
              />
              {images.length > 1 && (
                <View style={styles.pagination}>
                  {images.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.paginationDot,
                        index === activeImageIndex && styles.paginationDotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>📦</Text>
            </View>
          )}
        </View>

        {/* Title and Best Profit */}
        <View style={styles.header}>
          <Text style={styles.title}>{deal.title}</Text>
          <View style={[styles.profitBadge, { backgroundColor: profitColor }]}>
            <Text style={[styles.profitText, isFacebookOnly && { color: '#fff' }]}>
              +${bestProfit.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Price Info */}
        <View style={styles.priceSection}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Asking Price</Text>
            <Text style={styles.priceValue}>
              ${askingPrice.toFixed(2)}
            </Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Market Value</Text>
            <Text style={[styles.priceValue, styles.marketValue, isFacebookOnly && { color: '#1877F2' }]}>
              ${marketValue.toFixed(2)}
            </Text>
          </View>

          {/* Price Status Warning */}
          {deal.price_note && (
            <View style={[styles.priceStatusRow, { borderLeftColor: getPriceStatusColor(deal.price_status) }]}>
              <Text style={[styles.priceStatusText, { color: getPriceStatusColor(deal.price_status) }]}>
                {deal.price_note}
              </Text>
              {shouldShowCustomValueOption() && (
                <TouchableOpacity onPress={handleCustomValue} style={styles.customValueBtn}>
                  <Text style={styles.customValueBtnText}>Set Custom</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Profit by Platform */}
          <View style={styles.profitPlatforms}>
            <View style={styles.profitPlatformRow}>
              <Text style={styles.platformLabel}>eBay (13% fees)</Text>
              <Text style={[
                styles.platformProfit,
                { color: ebayProfit > 0 ? '#4ecca3' : '#ff6b6b' }
              ]}>
                {ebayProfit >= 0 ? '+' : '-'}${Math.abs(ebayProfit).toFixed(2)}
              </Text>
            </View>
            <View style={styles.profitPlatformRow}>
              <Text style={styles.platformLabel}>Facebook (no fees)</Text>
              <Text style={[
                styles.platformProfit,
                { color: facebookProfit > 0 ? '#1877F2' : '#ff6b6b' }
              ]}>
                {facebookProfit >= 0 ? '+' : '-'}${Math.abs(facebookProfit).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Condition Toggle */}
        <View style={styles.conditionSection}>
          <Text style={styles.sectionTitle}>Condition</Text>
          <Text style={styles.conditionHint}>
            Is this item new or used? Tap to change and recalculate value.
          </Text>
          <View style={styles.conditionButtons}>
            <TouchableOpacity
              style={[
                styles.conditionBtn,
                deal.condition === 'new' && styles.conditionBtnActive,
                deal.condition === 'new' && isFacebookOnly && { backgroundColor: '#1877F2' },
              ]}
              onPress={() => handleConditionChange('new')}
              disabled={processing}
            >
              <Text
                style={[
                  styles.conditionBtnText,
                  deal.condition === 'new' && styles.conditionBtnTextActive,
                  deal.condition === 'new' && isFacebookOnly && { color: '#fff' },
                ]}
              >
                NEW
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.conditionBtn,
                deal.condition === 'used' && styles.conditionBtnActive,
                deal.condition === 'used' && isFacebookOnly && { backgroundColor: '#1877F2' },
              ]}
              onPress={() => handleConditionChange('used')}
              disabled={processing}
            >
              <Text
                style={[
                  styles.conditionBtnText,
                  deal.condition === 'used' && styles.conditionBtnTextActive,
                  deal.condition === 'used' && isFacebookOnly && { color: '#fff' },
                ]}
              >
                USED
              </Text>
            </TouchableOpacity>
          </View>
          {processing && (
            <Text style={styles.processingText}>Recalculating...</Text>
          )}
        </View>

        {/* Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Source</Text>
            <Text style={styles.detailValue}>{deal.source || 'Unknown'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category</Text>
            <Text style={styles.detailValue}>{deal.category || 'Unknown'}</Text>
          </View>
          {deal.brand && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Brand</Text>
              <Text style={styles.detailValue}>{deal.brand}</Text>
            </View>
          )}
          {deal.model && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Model</Text>
              <Text style={styles.detailValue}>{deal.model}</Text>
            </View>
          )}
          {deal.location && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>{deal.location}</Text>
            </View>
          )}
        </View>

        {/* View Original Listing */}
        <TouchableOpacity style={styles.viewListingBtn} onPress={openListing}>
          <Text style={[styles.viewListingText, isFacebookOnly && { color: '#1877F2' }]}>View Original Listing →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss}>
          <Text style={styles.dismissBtnText}>Dismiss</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.purchaseBtn,
            isFacebookOnly && { backgroundColor: '#1877F2' },
            !canPurchase && styles.purchaseBtnDisabled,
          ]}
          onPress={handlePurchase}
          disabled={!canPurchase}
        >
          <Text style={[
            styles.purchaseBtnText,
            isFacebookOnly && { color: '#fff' },
            !canPurchase && styles.purchaseBtnTextDisabled,
          ]}>
            {canPurchase ? 'I Bought This' : 'Set Condition First'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Purchase Modal */}
      <Modal
        visible={purchaseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setPurchaseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Purchase Price</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {deal.title}
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
                onPress={() => setPurchaseModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, isFacebookOnly && { backgroundColor: '#1877F2' }]}
                onPress={confirmPurchase}
              >
                <Text style={[styles.modalConfirmText, isFacebookOnly && { color: '#fff' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Market Value Modal */}
      <Modal
        visible={customValueModal}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomValueModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Market Value</Text>
            <Text style={styles.modalSubtitle}>
              Enter the actual market value based on your research
            </Text>
            <TextInput
              style={styles.modalInput}
              value={customValue}
              onChangeText={setCustomValue}
              keyboardType="decimal-pad"
              placeholder="Enter market value"
              placeholderTextColor="#666"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCustomValueModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, isFacebookOnly && { backgroundColor: '#1877F2' }]}
                onPress={confirmCustomValue}
                disabled={processing}
              >
                <Text style={[styles.modalConfirmText, isFacebookOnly && { color: '#fff' }]}>
                  {processing ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Image Modal with Zoom */}
      <Modal
        visible={fullscreenImage !== null}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={styles.fullscreenContainer}>
          <ImageViewer
            imageUrls={images.map((url) => ({ url }))}
            index={fullscreenImage ? images.indexOf(fullscreenImage) : 0}
            onCancel={() => setFullscreenImage(null)}
            enableSwipeDown
            onSwipeDown={() => setFullscreenImage(null)}
            backgroundColor="#000"
            renderHeader={() => (
              <TouchableOpacity
                style={styles.fullscreenClose}
                onPress={() => setFullscreenImage(null)}
              >
                <Text style={styles.fullscreenCloseText}>✕</Text>
              </TouchableOpacity>
            )}
            saveToLocalByLongPress={false}
          />
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    height: 250,
    backgroundColor: '#1a1a2e',
  },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: 250,
  },
  pagination: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  paginationDotActive: {
    backgroundColor: '#fff',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  imagePlaceholderText: {
    fontSize: 64,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 12,
  },
  profitBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  profitText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  priceSection: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priceLabel: {
    color: '#888',
    fontSize: 14,
  },
  priceValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  marketValue: {
    color: '#4ecca3',
  },
  priceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  priceStatusText: {
    fontSize: 13,
    flex: 1,
  },
  customValueBtn: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 10,
  },
  customValueBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  profitPlatforms: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  profitPlatformRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  platformLabel: {
    color: '#888',
    fontSize: 14,
  },
  platformProfit: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  conditionSection: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  conditionHint: {
    color: '#888',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  conditionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  conditionBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  conditionBtnActive: {
    backgroundColor: '#4ecca3',
  },
  conditionBtnText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
  },
  conditionBtnTextActive: {
    color: '#000',
  },
  processingText: {
    color: '#ffc107',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  detailsSection: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    color: '#888',
    fontSize: 14,
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  viewListingBtn: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  viewListingText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#0f0f1a',
  },
  dismissBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  purchaseBtn: {
    flex: 2,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4ecca3',
    alignItems: 'center',
  },
  purchaseBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  purchaseBtnDisabled: {
    backgroundColor: '#333',
  },
  purchaseBtnTextDisabled: {
    color: '#666',
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
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 10,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  fullscreenCloseText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
