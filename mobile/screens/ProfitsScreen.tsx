import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { api, Flip, Stats } from '../services/api';

type FilterPeriod = 'all' | 'week' | 'month';

export default function ProfitsScreen() {
  const [flips, setFlips] = useState<Flip[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterPeriod>('all');

  const loadData = useCallback(async () => {
    try {
      const [flipsData, statsData] = await Promise.all([
        api.getFlips({ status: 'sold' }),
        api.getStats(),
      ]);
      setFlips(flipsData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load profits:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getFilteredFlips = (): Flip[] => {
    if (filter === 'all') return flips;

    const now = new Date();
    const cutoff = new Date();

    if (filter === 'week') {
      cutoff.setDate(now.getDate() - 7);
    } else if (filter === 'month') {
      cutoff.setMonth(now.getMonth() - 1);
    }

    return flips.filter((f) => {
      if (!f.sell_date) return false;
      return new Date(f.sell_date) >= cutoff;
    });
  };

  const filteredFlips = getFilteredFlips();
  const filteredProfit = filteredFlips.reduce(
    (sum, f) => sum + (f.profit || 0),
    0
  );

  const renderFlipItem = ({ item }: { item: Flip }) => {
    const profitColor = (item.profit || 0) >= 0 ? '#4ecca3' : '#ff6b6b';

    return (
      <View style={styles.flipCard}>
        <View style={styles.flipHeader}>
          <Text style={styles.flipTitle} numberOfLines={1}>
            {item.item_name}
          </Text>
          <Text style={[styles.profit, { color: profitColor }]}>
            {(item.profit || 0) >= 0 ? '+' : ''}${item.profit?.toFixed(2) || '0'}
          </Text>
        </View>

        <View style={styles.flipDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bought:</Text>
            <Text style={styles.detailValue}>${item.buy_price.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sold:</Text>
            <Text style={styles.detailValue}>
              ${item.sell_price?.toFixed(2) || '0'}
            </Text>
          </View>
          {item.fees_paid > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fees:</Text>
              <Text style={styles.detailValue}>
                -${item.fees_paid.toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.flipMeta}>
          <Text style={styles.metaText}>{item.sell_platform || 'Unknown'}</Text>
          <Text style={styles.metaText}>{item.sell_date}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading profits...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Profit</Text>
          <Text style={styles.statValue}>
            ${stats?.overall.total_profit.toFixed(2) || '0'}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Flips</Text>
          <Text style={styles.statValue}>
            {stats?.overall.total_flips || 0}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Avg Profit</Text>
          <Text style={styles.statValue}>
            ${stats?.overall.avg_profit_per_flip.toFixed(2) || '0'}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['all', 'month', 'week'] as FilterPeriod[]).map((period) => (
          <TouchableOpacity
            key={period}
            style={[
              styles.filterTab,
              filter === period && styles.filterTabActive,
            ]}
            onPress={() => setFilter(period)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === period && styles.filterTabTextActive,
              ]}
            >
              {period === 'all' ? 'All Time' : period === 'month' ? 'This Month' : 'This Week'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filtered Total */}
      <View style={styles.filteredTotal}>
        <Text style={styles.filteredLabel}>
          {filter === 'all' ? 'All Time' : filter === 'month' ? 'This Month' : 'This Week'}
        </Text>
        <Text style={styles.filteredValue}>
          ${filteredProfit.toFixed(2)} from {filteredFlips.length} flips
        </Text>
      </View>

      {/* Profit List */}
      <FlatList
        data={filteredFlips}
        renderItem={renderFlipItem}
        keyExtractor={(item) => `profit-${item.id}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No sales yet</Text>
            <Text style={styles.emptySubtext}>
              Mark flips as sold to see them here
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
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#4ecca3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterTab: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#4ecca3',
  },
  filterTabText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#000',
  },
  filteredTotal: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  filteredLabel: {
    color: '#888',
    fontSize: 12,
  },
  filteredValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    alignItems: 'center',
    marginBottom: 12,
  },
  flipTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  profit: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  flipDetails: {
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    color: '#888',
    fontSize: 14,
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
  },
  flipMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 8,
  },
  metaText: {
    color: '#888',
    fontSize: 12,
    textTransform: 'capitalize',
  },
});
