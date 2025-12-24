import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { Flip, Stats } from '../services/api'
import './Profits.css'

type FilterPeriod = 'all' | 'month' | 'week'

export default function Profits() {
  const [flips, setFlips] = useState<Flip[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterPeriod>('all')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [flipsData, statsData] = await Promise.all([
        api.getFlips({ status: 'sold' }),
        api.getStats(),
      ])
      setFlips(flipsData)
      setStats(statsData)
    } catch (err) {
      setError('Failed to load profits')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getFilteredFlips = (): Flip[] => {
    if (filter === 'all') return flips

    const now = new Date()
    const cutoff = new Date()

    if (filter === 'week') {
      cutoff.setDate(now.getDate() - 7)
    } else if (filter === 'month') {
      cutoff.setMonth(now.getMonth() - 1)
    }

    return flips.filter((f) => {
      if (!f.sell_date) return false
      return new Date(f.sell_date) >= cutoff
    })
  }

  const filteredFlips = getFilteredFlips()
  const filteredProfit = filteredFlips.reduce(
    (sum, f) => sum + (Number(f.profit) || 0),
    0
  )

  const formatPrice = (price: number | string | null) => {
    if (price === null || price === undefined) return '$0.00'
    const num = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(num)) return '$0.00'
    return `$${num.toFixed(2)}`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="profits-page">
        <div className="loading">Loading profits...</div>
      </div>
    )
  }

  return (
    <div className="profits-page">
      {/* Stats Summary */}
      <div className="stats-container">
        <div className="stat-box">
          <div className="stat-label">Total Profit</div>
          <div className="stat-value">
            {formatPrice(stats?.overall.total_profit || 0)}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Flips</div>
          <div className="stat-value">
            {stats?.overall.total_flips || 0}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Avg Profit</div>
          <div className="stat-value">
            {formatPrice(stats?.overall.avg_profit_per_flip || 0)}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Time
        </button>
        <button
          className={`tab ${filter === 'month' ? 'active' : ''}`}
          onClick={() => setFilter('month')}
        >
          This Month
        </button>
        <button
          className={`tab ${filter === 'week' ? 'active' : ''}`}
          onClick={() => setFilter('week')}
        >
          This Week
        </button>
      </div>

      {/* Filtered Total */}
      <div className="filtered-total">
        <div className="filtered-label">
          {filter === 'all' ? 'All Time' : filter === 'month' ? 'This Month' : 'This Week'}
        </div>
        <div className="filtered-value">
          {formatPrice(filteredProfit)} from {filteredFlips.length} flips
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Profit List */}
      <div className="flips-list">
        {filteredFlips.length === 0 ? (
          <div className="empty-state">
            <p>No sales yet</p>
            <p className="empty-subtext">Mark flips as sold to see them here</p>
          </div>
        ) : (
          filteredFlips.map((flip) => {
            const profit = Number(flip.profit) || 0
            const profitColor = profit >= 0 ? '#4ecca3' : '#ff6b6b'

            return (
              <div key={flip.id} className="flip-card">
                <div className="flip-header">
                  {/* Thumbnail */}
                  {flip.image_url ? (
                    <img
                      src={flip.image_url}
                      alt={flip.item_name}
                      className="thumbnail"
                    />
                  ) : (
                    <div className="thumbnail-placeholder">📦</div>
                  )}

                  <div className="flip-header-text">
                    <h3 className="flip-title">{flip.item_name}</h3>
                    <div className="flip-meta">
                      <span className="meta-text">
                        {flip.sell_platform || 'Unknown'}
                      </span>
                      <span className="meta-text">
                        {formatDate(flip.sell_date)}
                      </span>
                    </div>
                  </div>

                  <div
                    className="profit"
                    style={{ color: profitColor }}
                  >
                    {profit >= 0 ? '+' : ''}{formatPrice(profit)}
                  </div>
                </div>

                <div className="flip-details">
                  <div className="detail-row">
                    <span className="detail-label">Bought:</span>
                    <span className="detail-value">
                      {formatPrice(Number(flip.buy_price))}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Sold:</span>
                    <span className="detail-value">
                      {formatPrice(Number(flip.sell_price))}
                    </span>
                  </div>
                  {Number(flip.fees_paid) > 0 && (
                    <div className="detail-row">
                      <span className="detail-label">Fees:</span>
                      <span className="detail-value">
                        -{formatPrice(Number(flip.fees_paid))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
