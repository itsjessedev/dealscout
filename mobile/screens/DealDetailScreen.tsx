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
import { api, Deal, RepairOption } from '../services/api';
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
  // Track which repair options are selected (for profit calculations)
  const [selectedRepairs, setSelectedRepairs] = useState<Set<string>>(new Set());
  // Track custom part costs for repairs without pricing
  const [customPartCosts, setCustomPartCosts] = useState<Record<string, number>>({});
  const [editingRepairCost, setEditingRepairCost] = useState<string | null>(null);
  const [tempRepairCost, setTempRepairCost] = useState('');

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

  // Check if market value needs to be set manually
  const needsMarketValue = ['no_data', 'mock_data'].includes(deal.price_status || '');
  const isRepairItem = deal.condition === 'needs_repair' || deal.repair_needed === true;
  const canPurchase = deal.condition !== 'unknown' && deal.market_value != null && !needsMarketValue;

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
      // Build planned repairs from selected options
      const plannedRepairs = deal.repair_options
        ?.filter(opt => selectedRepairs.has(opt.id))
        || undefined;

      await api.purchaseDeal(deal.id, {
        buy_price: parseFloat(purchasePrice),
        buy_date: new Date().toISOString().split('T')[0],
        planned_repairs: plannedRepairs && plannedRepairs.length > 0 ? plannedRepairs : undefined,
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

        {/* Condition Toggle - Not shown for repair items (always used after repair) */}
        {!isRepairItem && (
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
        )}

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

        {/* Repair Info (if needs repair) */}
        {(deal.condition === 'needs_repair' || deal.repair_needed) && (() => {
          const asIsValue = Number(deal.as_is_value) || 0;
          const repairedValue = marketValue; // market_value is the repaired value

          // Calculate selected repair cost - parts only, no labor estimate
          const repairOptions = deal.repair_options || [];
          const selectedRepairCost = repairOptions
            .filter(opt => selectedRepairs.has(opt.id))
            .reduce((sum, opt) => {
              const partCost = customPartCosts[opt.id] ?? opt.part_cost;
              return sum + partCost;
            }, 0);

          // Calculate dynamic difficulty based on selected repairs
          const getRepairDifficulty = () => {
            if (selectedRepairs.size === 0) return deal.repair_feasibility || 'unknown';
            const selectedOptions = repairOptions.filter(opt => selectedRepairs.has(opt.id));
            const totalHours = selectedOptions.reduce((sum, opt) => sum + opt.labor_hours, 0);
            if (totalHours <= 1) return 'easy';
            if (totalHours <= 3) return 'moderate';
            if (totalHours <= 6) return 'difficult';
            return 'professional';
          };

          // Calculate dynamic risk based on selected repairs
          const getRepairRisk = () => {
            if (selectedRepairs.size === 0) return 'low';
            const selectedOptions = repairOptions.filter(opt => selectedRepairs.has(opt.id));
            // Higher cost repairs = higher risk
            const totalCost = selectedOptions.reduce((sum, opt) => {
              const partCost = customPartCosts[opt.id] ?? opt.part_cost;
              return sum + partCost;
            }, 0);
            // Check for missing prices
            const hasMissingPrices = selectedOptions.some(opt =>
              (opt.price_status === 'not_found' || opt.price_status === 'labor_only') &&
              customPartCosts[opt.id] === undefined
            );
            if (hasMissingPrices) return 'high';
            if (totalCost > 150) return 'high';
            if (totalCost > 75) return 'medium';
            return 'low';
          };

          // Calculate dynamic effort based on selected repairs
          const getRepairEffort = () => {
            if (selectedRepairs.size === 0) return 'low';
            const selectedOptions = repairOptions.filter(opt => selectedRepairs.has(opt.id));
            const totalHours = selectedOptions.reduce((sum, opt) => sum + opt.labor_hours, 0);
            if (totalHours <= 1) return 'low';
            if (totalHours <= 3) return 'medium';
            return 'high';
          };

          const dynamicDifficulty = getRepairDifficulty();
          const dynamicRisk = getRepairRisk();
          const dynamicEffort = getRepairEffort();

          // Fallback to legacy single repair if no options
          const totalRepairCost = repairOptions.length > 0
            ? selectedRepairCost
            : Number(deal.repair_total_estimate) || 0;

          // As-Is profits (sell broken)
          const asIsEbayProfit = asIsValue - askingPrice - (asIsValue * ebayFeeRate);
          const asIsFbProfit = asIsValue - askingPrice;

          // Repaired profits (fix then sell) - based on SELECTED repairs
          const repairedEbayProfit = repairedValue - askingPrice - totalRepairCost - (repairedValue * ebayFeeRate);
          const repairedFbProfit = repairedValue - askingPrice - totalRepairCost;

          const toggleRepair = (optId: string) => {
            setSelectedRepairs(prev => {
              const next = new Set(prev);
              if (next.has(optId)) {
                next.delete(optId);
              } else {
                next.add(optId);
              }
              return next;
            });
          };

          return (
            <View style={[styles.repairSection, { borderColor: '#ff9800' }]}>
              <Text style={[styles.sectionTitle, { color: '#ff9800' }]}>
                Repair Item - Your Options
              </Text>

              {deal.repair_notes && (
                <Text style={styles.repairNotes}>{deal.repair_notes}</Text>
              )}

              {/* Option 1: Sell As-Is */}
              {asIsValue > 0 && (
                <View style={styles.repairOptionCard}>
                  <Text style={styles.repairOptionTitle}>Sell As-Is (For Parts)</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>As-Is Value</Text>
                    <Text style={styles.detailValue}>${asIsValue.toFixed(2)}</Text>
                  </View>
                  <View style={styles.repairProfitRow}>
                    <View style={styles.repairProfitItem}>
                      <Text style={styles.repairProfitLabel}>eBay</Text>
                      <Text style={[
                        styles.repairProfitValue,
                        { color: asIsEbayProfit > 0 ? '#4ecca3' : '#ff6b6b' }
                      ]}>
                        {asIsEbayProfit >= 0 ? '+' : ''}${asIsEbayProfit.toFixed(0)}
                      </Text>
                    </View>
                    <View style={styles.repairProfitItem}>
                      <Text style={styles.repairProfitLabel}>Facebook</Text>
                      <Text style={[
                        styles.repairProfitValue,
                        { color: asIsFbProfit > 0 ? '#1877F2' : '#ff6b6b' }
                      ]}>
                        {asIsFbProfit >= 0 ? '+' : ''}${asIsFbProfit.toFixed(0)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Repair Options - Toggleable */}
              {repairOptions.length > 0 && (
                <View style={[styles.repairOptionCard, { borderColor: '#4ecca3' }]}>
                  <Text style={[styles.repairOptionTitle, { color: '#4ecca3' }]}>
                    Repair & Sell (select repairs)
                  </Text>

                  {/* Toggleable repair options */}
                  {repairOptions.map((opt) => {
                    const partCost = customPartCosts[opt.id] ?? opt.part_cost;
                    const isSelected = selectedRepairs.has(opt.id);
                    const needsCustomPrice = opt.price_status === 'labor_only' || opt.price_status === 'not_found';
                    const hasCustomPrice = customPartCosts[opt.id] !== undefined;

                    return (
                      <View key={opt.id}>
                        <TouchableOpacity
                          style={[styles.repairToggleRow, isSelected && styles.repairToggleRowSelected]}
                          onPress={() => toggleRepair(opt.id)}
                        >
                          <View style={[styles.repairCheckbox, isSelected && styles.repairCheckboxSelected]}>
                            {isSelected && <Text style={styles.repairCheckmark}>✓</Text>}
                          </View>
                          <View style={styles.repairToggleInfo}>
                            <Text style={styles.repairToggleName}>{opt.name}</Text>
                            {needsCustomPrice && !hasCustomPrice ? (
                              <Text style={styles.repairToggleWarning}>
                                ⚠️ {opt.price_note || 'Part cost unknown'}
                              </Text>
                            ) : (
                              <Text style={styles.repairToggleDetail}>
                                Part cost: ${partCost.toFixed(0)}
                              </Text>
                            )}
                          </View>
                          <View style={styles.repairCostContainer}>
                            {needsCustomPrice && !hasCustomPrice ? (
                              <TouchableOpacity
                                style={styles.setPartCostBtn}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setEditingRepairCost(opt.id);
                                  setTempRepairCost('');
                                }}
                              >
                                <Text style={styles.setPartCostText}>Set Cost</Text>
                              </TouchableOpacity>
                            ) : (
                              <Text style={[styles.repairToggleCost, isSelected && { color: '#ff9800' }]}>
                                ${partCost.toFixed(0)}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                        {hasCustomPrice && (
                          <TouchableOpacity
                            style={styles.editCustomCostLink}
                            onPress={() => {
                              setEditingRepairCost(opt.id);
                              setTempRepairCost(customPartCosts[opt.id]?.toString() || '');
                            }}
                          >
                            <Text style={styles.editCustomCostText}>
                              Custom part cost: ${customPartCosts[opt.id]} (tap to edit)
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}

                  {/* Totals */}
                  <View style={styles.repairTotalsSection}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Repaired Value</Text>
                      <Text style={[styles.detailValue, { color: '#4ecca3' }]}>${repairedValue.toFixed(2)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Selected Repairs</Text>
                      <Text style={[styles.detailValue, { color: '#ff9800' }]}>
                        {selectedRepairs.size > 0 ? `-$${totalRepairCost.toFixed(0)}` : '$0'}
                      </Text>
                    </View>
                    <View style={styles.repairProfitRow}>
                      <View style={styles.repairProfitItem}>
                        <Text style={styles.repairProfitLabel}>eBay</Text>
                        <Text style={[
                          styles.repairProfitValue,
                          { color: repairedEbayProfit > 0 ? '#4ecca3' : '#ff6b6b' }
                        ]}>
                          {repairedEbayProfit >= 0 ? '+' : ''}${repairedEbayProfit.toFixed(0)}
                        </Text>
                      </View>
                      <View style={styles.repairProfitItem}>
                        <Text style={styles.repairProfitLabel}>Facebook</Text>
                        <Text style={[
                          styles.repairProfitValue,
                          { color: repairedFbProfit > 0 ? '#1877F2' : '#ff6b6b' }
                        ]}>
                          {repairedFbProfit >= 0 ? '+' : ''}${repairedFbProfit.toFixed(0)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* Legacy single repair (if no repair_options) */}
              {repairOptions.length === 0 && (deal.repair_part_needed || deal.repair_total_estimate) && (
                <View style={[styles.repairOptionCard, { borderColor: '#4ecca3' }]}>
                  <Text style={[styles.repairOptionTitle, { color: '#4ecca3' }]}>
                    Repair & Sell
                  </Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Repaired Value</Text>
                    <Text style={[styles.detailValue, { color: '#4ecca3' }]}>${repairedValue.toFixed(2)}</Text>
                  </View>
                  {deal.repair_total_estimate && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Repair Cost</Text>
                      <Text style={[styles.detailValue, { color: '#ff9800' }]}>
                        -${Number(deal.repair_total_estimate).toFixed(2)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.repairProfitRow}>
                    <View style={styles.repairProfitItem}>
                      <Text style={styles.repairProfitLabel}>eBay</Text>
                      <Text style={[
                        styles.repairProfitValue,
                        { color: repairedEbayProfit > 0 ? '#4ecca3' : '#ff6b6b' }
                      ]}>
                        {repairedEbayProfit >= 0 ? '+' : ''}${repairedEbayProfit.toFixed(0)}
                      </Text>
                    </View>
                    <View style={styles.repairProfitItem}>
                      <Text style={styles.repairProfitLabel}>Facebook</Text>
                      <Text style={[
                        styles.repairProfitValue,
                        { color: repairedFbProfit > 0 ? '#1877F2' : '#ff6b6b' }
                      ]}>
                        {repairedFbProfit >= 0 ? '+' : ''}${repairedFbProfit.toFixed(0)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Dynamic Indicators based on selected repairs */}
              {repairOptions.length > 0 && (
                <View style={styles.repairIndicators}>
                  <View style={styles.repairIndicator}>
                    <Text style={styles.repairIndicatorLabel}>Difficulty</Text>
                    <Text style={[
                      styles.repairIndicatorValue,
                      {
                        color: dynamicDifficulty === 'easy' ? '#4ecca3' :
                               dynamicDifficulty === 'moderate' ? '#ffc107' :
                               dynamicDifficulty === 'difficult' ? '#ff9800' : '#ff6b6b'
                      }
                    ]}>
                      {dynamicDifficulty.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.repairIndicator}>
                    <Text style={styles.repairIndicatorLabel}>Risk</Text>
                    <Text style={[
                      styles.repairIndicatorValue,
                      {
                        color: dynamicRisk === 'low' ? '#4ecca3' :
                               dynamicRisk === 'medium' ? '#ffc107' : '#ff6b6b'
                      }
                    ]}>
                      {dynamicRisk.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.repairIndicator}>
                    <Text style={styles.repairIndicatorLabel}>Effort</Text>
                    <Text style={[
                      styles.repairIndicatorValue,
                      {
                        color: dynamicEffort === 'low' ? '#4ecca3' :
                               dynamicEffort === 'medium' ? '#ffc107' : '#ff6b6b'
                      }
                    ]}>
                      {dynamicEffort.toUpperCase()}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })()}

        {/* Deal Intelligence */}
        {deal.deal_score !== null && (
          <View style={styles.intelligenceSection}>
            <Text style={styles.sectionTitle}>Deal Intelligence</Text>
            <View style={styles.scoreRow}>
              <View style={[
                styles.scoreCircle,
                { backgroundColor: deal.deal_score >= 70 ? '#4ecca3' : deal.deal_score >= 50 ? '#ffc107' : '#ff6b6b' }
              ]}>
                <Text style={styles.scoreText}>{deal.deal_score}</Text>
              </View>
              <View style={styles.scoreDetails}>
                <Text style={styles.scoreLabel}>Deal Score</Text>
                <Text style={styles.scoreDescription}>
                  {deal.deal_score >= 70 ? 'Excellent deal' : deal.deal_score >= 50 ? 'Good deal' : 'Risky deal'}
                </Text>
              </View>
            </View>
            <View style={styles.indicatorsRow}>
              {deal.risk_level && (
                <View style={styles.indicator}>
                  <Text style={styles.indicatorLabel}>Risk</Text>
                  <Text style={[
                    styles.indicatorValue,
                    { color: deal.risk_level === 'low' ? '#4ecca3' : deal.risk_level === 'medium' ? '#ffc107' : '#ff6b6b' }
                  ]}>
                    {deal.risk_level.toUpperCase()}
                  </Text>
                </View>
              )}
              {deal.effort_level && (
                <View style={styles.indicator}>
                  <Text style={styles.indicatorLabel}>Effort</Text>
                  <Text style={[
                    styles.indicatorValue,
                    { color: deal.effort_level === 'low' ? '#4ecca3' : deal.effort_level === 'medium' ? '#ffc107' : '#ff6b6b' }
                  ]}>
                    {deal.effort_level.toUpperCase()}
                  </Text>
                </View>
              )}
              {deal.demand_indicator && (
                <View style={styles.indicator}>
                  <Text style={styles.indicatorLabel}>Demand</Text>
                  <Text style={[
                    styles.indicatorValue,
                    { color: deal.demand_indicator === 'high' ? '#4ecca3' : deal.demand_indicator === 'medium' ? '#ffc107' : '#ff6b6b' }
                  ]}>
                    {deal.demand_indicator.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            {deal.flip_speed_prediction && (
              <View style={styles.flipSpeedRow}>
                <Text style={styles.flipSpeedLabel}>Est. Sell Time:</Text>
                <Text style={styles.flipSpeedValue}>
                  {deal.flip_speed_prediction === 'fast' ? '1-7 days' :
                   deal.flip_speed_prediction === 'medium' ? '1-3 weeks' : '3+ weeks'}
                </Text>
              </View>
            )}
            {deal.price_trend && (
              <View style={styles.trendRow}>
                <Text style={styles.trendLabel}>Price Trend:</Text>
                <Text style={styles.trendValue}>
                  {deal.price_trend === 'up' ? '📈' : deal.price_trend === 'down' ? '📉' : '➡️'}
                  {' '}{deal.price_trend_note || deal.price_trend}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Bundle Info */}
        {deal.is_bundle && deal.bundle_items && deal.bundle_items.length > 0 && (
          <View style={styles.bundleSection}>
            <Text style={styles.sectionTitle}>Bundle Contents</Text>
            {deal.bundle_items.map((item, index) => (
              <Text key={index} style={styles.bundleItem}>• {item}</Text>
            ))}
            {deal.bundle_value_per_item !== null && (
              <Text style={styles.bundleValueNote}>
                ~${Number(deal.bundle_value_per_item).toFixed(2)} per item
              </Text>
            )}
          </View>
        )}

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
            {canPurchase
              ? 'I Bought This'
              : needsMarketValue
                ? 'Set Market Value First'
                : 'Set Condition First'}
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
            {/* Show planned repairs for repair items */}
            {(deal.repair_needed || deal.condition === 'needs_repair') && selectedRepairs.size > 0 && (
              <View style={styles.plannedRepairsBox}>
                <Text style={styles.plannedRepairsTitle}>Planned Repairs:</Text>
                {deal.repair_options?.filter(opt => selectedRepairs.has(opt.id)).map(opt => (
                  <Text key={opt.id} style={styles.plannedRepairItem}>• {opt.name}</Text>
                ))}
              </View>
            )}
            {(deal.repair_needed || deal.condition === 'needs_repair') && selectedRepairs.size === 0 && (
              <Text style={styles.noRepairsNote}>Selling as-is (no repairs selected)</Text>
            )}
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

      {/* Custom Part Cost Modal */}
      <Modal
        visible={editingRepairCost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingRepairCost(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Part Cost</Text>
            <Text style={styles.modalSubtitle}>
              {deal.repair_options?.find(opt => opt.id === editingRepairCost)?.name || 'Repair'}
              {'\n'}
              <Text style={{ color: '#ff9800', fontSize: 12 }}>
                {deal.repair_options?.find(opt => opt.id === editingRepairCost)?.price_note || 'Part price not found automatically'}
              </Text>
            </Text>
            <TextInput
              style={styles.modalInput}
              value={tempRepairCost}
              onChangeText={setTempRepairCost}
              keyboardType="decimal-pad"
              placeholder="Enter part cost"
              placeholderTextColor="#666"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditingRepairCost(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#ff9800' }]}
                onPress={() => {
                  if (editingRepairCost && tempRepairCost) {
                    setCustomPartCosts(prev => ({
                      ...prev,
                      [editingRepairCost]: parseFloat(tempRepairCost),
                    }));
                  }
                  setEditingRepairCost(null);
                  setTempRepairCost('');
                }}
              >
                <Text style={[styles.modalConfirmText, { color: '#000' }]}>Save</Text>
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
  plannedRepairsBox: {
    backgroundColor: 'rgba(78,204,163,0.1)',
    borderWidth: 1,
    borderColor: '#4ecca3',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  plannedRepairsTitle: {
    color: '#4ecca3',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  plannedRepairItem: {
    color: '#fff',
    fontSize: 13,
    marginTop: 2,
  },
  noRepairsNote: {
    color: '#ff9800',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
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
  // Repair section styles
  repairSection: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
  },
  repairNotes: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  repairCostBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  repairOptionCard: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#555',
  },
  repairOptionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  repairProfitRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  repairProfitItem: {
    alignItems: 'center',
  },
  repairProfitLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  repairProfitValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  repairDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  repairToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  repairToggleRowSelected: {
    borderColor: '#4ecca3',
    backgroundColor: 'rgba(78,204,163,0.1)',
  },
  repairCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repairCheckboxSelected: {
    borderColor: '#4ecca3',
    backgroundColor: '#4ecca3',
  },
  repairCheckmark: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  repairToggleInfo: {
    flex: 1,
  },
  repairToggleName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  repairToggleDetail: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  repairToggleCost: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
  },
  repairTotalsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  repairDifficulty: {
    color: '#888',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  partLinkBtn: {
    backgroundColor: '#ff9800',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  partLinkText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  trueProfitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  trueProfitLabel: {
    color: '#888',
    fontSize: 14,
  },
  trueProfitValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Intelligence section styles
  intelligenceSection: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  scoreText: {
    color: '#000',
    fontSize: 24,
    fontWeight: 'bold',
  },
  scoreDetails: {
    flex: 1,
  },
  scoreLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scoreDescription: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  indicatorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  indicator: {
    flex: 1,
    alignItems: 'center',
  },
  indicatorLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  indicatorValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  flipSpeedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  flipSpeedLabel: {
    color: '#888',
    fontSize: 14,
  },
  flipSpeedValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  trendRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  trendLabel: {
    color: '#888',
    fontSize: 14,
    marginRight: 8,
  },
  trendValue: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    flexWrap: 'wrap',
  },
  // Bundle section styles
  bundleSection: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
  },
  bundleItem: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  bundleValueNote: {
    color: '#4ecca3',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  // Repair toggle additional styles
  repairToggleWarning: {
    color: '#ff9800',
    fontSize: 12,
    marginTop: 2,
  },
  repairCostContainer: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  setPartCostBtn: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  setPartCostText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  editCustomCostLink: {
    paddingLeft: 36,
    paddingBottom: 8,
    marginTop: -4,
  },
  editCustomCostText: {
    color: '#ff9800',
    fontSize: 11,
    fontStyle: 'italic',
  },
  // Repair dynamic indicators
  repairIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  repairIndicator: {
    alignItems: 'center',
    flex: 1,
  },
  repairIndicatorLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
  },
  repairIndicatorValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
});
