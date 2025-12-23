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
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api, Flip } from '../services/api';
import { useEbay } from '../contexts/EbayContext';

interface ListingSuggestion {
  deal_id: number;
  suggested_title: string;
  description: string;
  ebay_category: { category_id: number; category_name: string; category_key: string };
  testing_checklist: string[];
}

export default function CurrentFlipsScreen() {
  const navigation = useNavigation<any>();
  const [flips, setFlips] = useState<Flip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sellModal, setSellModal] = useState<{ visible: boolean; flip: Flip | null }>({
    visible: false,
    flip: null,
  });
  const [sellPrice, setSellPrice] = useState('');
  const [sellPlatform, setSellPlatform] = useState<string | null>(null);
  const [listingModal, setListingModal] = useState<{
    visible: boolean;
    flip: Flip | null;
    loading: boolean;
    suggestion: ListingSuggestion | null;
  }>({
    visible: false,
    flip: null,
    loading: false,
    suggestion: null,
  });

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

  const handleSyncEbay = async () => {
    setSyncing(true);
    try {
      const result = await api.syncEbayOrders();
      if (result.success && result.synced > 0) {
        Alert.alert(
          'Sales Synced!',
          `${result.synced} item(s) marked as sold from eBay.`,
          [{ text: 'OK', onPress: loadFlips }]
        );
      } else if (result.success) {
        Alert.alert('No New Sales', 'No new eBay sales detected.');
      } else {
        Alert.alert('Sync Failed', result.error || 'Could not sync eBay orders');
      }
    } catch (error) {
      console.error('eBay sync error:', error);
      Alert.alert('Error', 'Failed to sync eBay orders');
    } finally {
      setSyncing(false);
    }
  };

  const calculateDaysHeld = (buyDate: string): number => {
    const buy = new Date(buyDate);
    const now = new Date();
    return Math.floor((now.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const calculateDaysListed = (listedAt: string): number => {
    const listed = new Date(listedAt);
    const now = new Date();
    return Math.floor((now.getTime() - listed.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleListItem = (flip: Flip) => {
    navigation.navigate('ListItem', { flip });
  };

  const handleListOnFacebook = async (flip: Flip) => {
    setListingModal({ visible: true, flip, loading: true, suggestion: null });

    try {
      // Use flip endpoint if available, otherwise fall back to deal endpoint
      let suggestion;
      if (flip.deal_id) {
        suggestion = await api.getFlipListingSuggestion(flip.id);
      } else {
        // For manually added flips, create basic listing text
        suggestion = {
          suggested_title: flip.item_name,
          description: `${flip.item_name}\n\nCondition: Used\nPrice: Negotiable`,
          testing_checklist: [],
        };
      }
      setListingModal(prev => ({ ...prev, loading: false, suggestion }));
    } catch (error) {
      console.error('Failed to generate FB listing:', error);
      // Fallback to basic listing
      setListingModal(prev => ({
        ...prev,
        loading: false,
        suggestion: {
          suggested_title: flip.item_name,
          description: flip.item_name,
          ebay_category: { category_id: 0, category_name: '', category_key: '' },
          testing_checklist: [],
        },
      }));
    }
  };

  const copyForFacebook = async () => {
    if (!listingModal.suggestion || !listingModal.flip) return;
    const { suggested_title, description } = listingModal.suggestion;
    const price = listingModal.flip.buy_price * 1.5; // Suggest 50% markup as starting point

    const fbText = `${suggested_title}

${description}

Price: $${price.toFixed(0)} OBO
Condition: Used - Excellent
Pickup available

Message me with any questions!`;

    await Clipboard.setStringAsync(fbText);
    Alert.alert(
      'Copied for Facebook!',
      'Listing text copied. Open Facebook Marketplace and paste into your new listing.',
      [{ text: 'OK', onPress: () => setListingModal({ visible: false, flip: null, loading: false, suggestion: null }) }]
    );
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

  const handleGenerateListing = async (flip: Flip) => {
    if (!flip.deal_id) {
      Alert.alert('Cannot Generate', 'This item was added manually and has no deal data for listing generation.');
      return;
    }

    setListingModal({ visible: true, flip, loading: true, suggestion: null });

    try {
      const suggestion = await api.getListingSuggestion(flip.deal_id);
      setListingModal(prev => ({ ...prev, loading: false, suggestion }));
    } catch (error) {
      console.error('Failed to generate listing:', error);
      setListingModal(prev => ({ ...prev, loading: false }));
      Alert.alert('Error', 'Failed to generate listing suggestion');
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied!', `${label} copied to clipboard`);
  };

  const copyFullListing = async () => {
    if (!listingModal.suggestion) return;
    const { suggested_title, description, testing_checklist } = listingModal.suggestion;
    const fullText = `${suggested_title}\n\n${description}\n\nTesting Checklist:\n${testing_checklist.map(item => `• ${item}`).join('\n')}`;
    await Clipboard.setStringAsync(fullText);
    Alert.alert('Copied!', 'Full listing copied to clipboard');
  };

  const totalInventoryValue = flips.reduce(
    (sum, f) => sum + (Number(f.buy_price) || 0),
    0
  );

  const renderFlipItem = ({ item }: { item: Flip }) => {
    const isListed = !!item.listed_at;
    const daysCount = isListed
      ? calculateDaysListed(item.listed_at!)
      : calculateDaysHeld(item.buy_date);

    return (
      <View style={[styles.flipCard, isListed && styles.flipCardListed]}>
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
          <View style={styles.statusBadge}>
            {isListed ? (
              <>
                <Text style={styles.listedBadge}>LISTED</Text>
                <Text style={styles.daysListed}>{daysCount}d</Text>
              </>
            ) : (
              <Text style={styles.notListedBadge}>NOT LISTED</Text>
            )}
          </View>
        </View>

        {item.category && (
          <Text style={styles.category}>{item.category}</Text>
        )}

        {/* eBay listing link if listed */}
        {item.ebay_listing_id && (
          <Text style={styles.ebayLink}>
            eBay: {item.ebay_listing_id}
          </Text>
        )}

        {/* Planned repairs if any */}
        {item.planned_repairs && item.planned_repairs.length > 0 && (
          <View style={styles.plannedRepairs}>
            <Text style={styles.plannedRepairsLabel}>Planned Repairs:</Text>
            <Text style={styles.plannedRepairsList}>
              {item.planned_repairs.map((r: any) => r.name).join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.flipActions}>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
          {!isListed && (
            <>
              <TouchableOpacity
                style={styles.listingBtn}
                onPress={() => handleListItem(item)}
              >
                <Text style={styles.listingBtnText}>eBay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fbListingBtn}
                onPress={() => handleListOnFacebook(item)}
              >
                <Text style={styles.fbListingBtnText}>FB</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={styles.sellBtn}
            onPress={() => handleSell(item)}
          >
            <Text style={styles.sellBtnText}>Sold</Text>
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
        <View style={styles.summaryRow}>
          <View style={styles.summaryContent}>
            <Text style={styles.summaryLabel}>Total Inventory Value</Text>
            <Text style={styles.summaryValue}>
              ${totalInventoryValue.toFixed(2)}
            </Text>
            <Text style={styles.summaryCount}>{flips.length} items</Text>
          </View>
          <TouchableOpacity
            style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
            onPress={handleSyncEbay}
            disabled={syncing}
          >
            <Text style={styles.syncBtnText}>{syncing ? 'Syncing...' : 'Sync eBay'}</Text>
          </TouchableOpacity>
        </View>
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

      {/* Facebook Listing Modal */}
      <Modal
        visible={listingModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setListingModal({ visible: false, flip: null, loading: false, suggestion: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.listingModalContent]}>
            <View style={styles.listingHeader}>
              <Text style={styles.modalTitle}>List on Facebook</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setListingModal({ visible: false, flip: null, loading: false, suggestion: null })}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {listingModal.loading ? (
              <View style={styles.listingLoading}>
                <Text style={styles.listingLoadingText}>Generating listing...</Text>
              </View>
            ) : listingModal.suggestion ? (
              <ScrollView style={styles.listingScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.fbInstructions}>
                  Facebook Marketplace doesn't have an API, so we'll copy the listing text for you to paste.
                </Text>

                {/* Preview */}
                <View style={styles.listingSection}>
                  <Text style={styles.listingSectionLabel}>Preview</Text>
                  <View style={styles.fbPreviewBox}>
                    <Text style={styles.fbPreviewTitle}>
                      {listingModal.suggestion.suggested_title}
                    </Text>
                    <Text style={styles.fbPreviewDescription}>
                      {listingModal.suggestion.description}
                    </Text>
                    <Text style={styles.fbPreviewPrice}>
                      Price: ${((listingModal.flip?.buy_price || 0) * 1.5).toFixed(0)} OBO
                    </Text>
                  </View>
                </View>

                {/* Testing Checklist */}
                {listingModal.suggestion.testing_checklist && listingModal.suggestion.testing_checklist.length > 0 && (
                  <View style={styles.listingSection}>
                    <Text style={styles.listingSectionLabel}>Test Before Posting</Text>
                    {listingModal.suggestion.testing_checklist.map((item, index) => (
                      <View key={index} style={styles.checklistItem}>
                        <Text style={styles.checklistBullet}>☐</Text>
                        <Text style={styles.checklistText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Copy Button */}
                <TouchableOpacity style={styles.fbCopyBtn} onPress={copyForFacebook}>
                  <Text style={styles.fbCopyBtnText}>Copy & Open Facebook</Text>
                </TouchableOpacity>

                <Text style={styles.fbNote}>
                  You'll need to add photos manually in Facebook Marketplace
                </Text>
              </ScrollView>
            ) : (
              <View style={styles.listingLoading}>
                <Text style={styles.listingLoadingText}>Failed to load listing</Text>
              </View>
            )}
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
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryContent: {
    flex: 1,
  },
  syncBtn: {
    backgroundColor: '#1877F2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  syncBtnDisabled: {
    backgroundColor: '#333',
  },
  syncBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
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
  flipCardListed: {
    borderWidth: 1,
    borderColor: '#4ecca3',
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
  statusBadge: {
    alignItems: 'flex-end',
  },
  listedBadge: {
    color: '#4ecca3',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: 'rgba(78, 204, 163, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  daysListed: {
    color: '#4ecca3',
    fontSize: 12,
    marginTop: 4,
  },
  notListedBadge: {
    color: '#ff9800',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ebayLink: {
    color: '#1877F2',
    fontSize: 12,
    marginBottom: 8,
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
  // Listing button styles
  listingBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1877F2',
  },
  listingBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Planned repairs styles
  plannedRepairs: {
    backgroundColor: 'rgba(255,152,0,0.1)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  plannedRepairsLabel: {
    color: '#ff9800',
    fontSize: 11,
    fontWeight: '600',
  },
  plannedRepairsList: {
    color: '#fff',
    fontSize: 12,
    marginTop: 2,
  },
  // Listing modal styles
  listingModalContent: {
    maxHeight: '80%',
    width: '90%',
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: '#888',
    fontSize: 24,
  },
  listingLoading: {
    padding: 40,
    alignItems: 'center',
  },
  listingLoadingText: {
    color: '#888',
    fontSize: 16,
  },
  listingScroll: {
    maxHeight: 500,
  },
  listingSection: {
    marginBottom: 20,
  },
  listingSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listingSectionLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  copyBtn: {
    color: '#4ecca3',
    fontSize: 12,
    fontWeight: '600',
  },
  listingCategory: {
    color: '#4ecca3',
    fontSize: 14,
  },
  listingTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  charCount: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  listingDescription: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checklistBullet: {
    color: '#888',
    fontSize: 16,
    marginRight: 8,
  },
  checklistText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  copyAllBtn: {
    backgroundColor: '#4ecca3',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  copyAllBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Facebook listing styles
  fbListingBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1877F2',
  },
  fbListingBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  fbInstructions: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  fbPreviewBox: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  fbPreviewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  fbPreviewDescription: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  fbPreviewPrice: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fbCopyBtn: {
    backgroundColor: '#1877F2',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  fbCopyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  fbNote: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
});
