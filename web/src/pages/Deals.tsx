import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import type { Deal } from '../services/api'
import { useToast } from '../components/Toast'
import './Deals.css'

type LocationFilter = 'all' | 'pickup' | 'shipping'

const POLL_INTERVAL = 30000 // 30 seconds
const LOCAL_RADIUS_MILES = 100

export default function Deals() {
  const navigate = useNavigate()
  const { showDealNotification } = useToast()
  const [deals, setDeals] = useState<Deal[]>([])
  const [needsReview, setNeedsReview] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<LocationFilter>('all')
  const knownDealIds = useRef<Set<number>>(new Set())
  const toastRef = useRef(showDealNotification)

  // Keep toast ref current
  useEffect(() => {
    toastRef.current = showDealNotification
  }, [showDealNotification])

  // Check if deal qualifies for local pickup
  const isLocalPickup = (deal: Deal): boolean => {
    if (deal.local_pickup_available) return true
    const distance = deal.distance_miles ? parseFloat(String(deal.distance_miles)) : null
    return distance !== null && distance <= LOCAL_RADIUS_MILES
  }

  // Filter deals by location
  const filteredDeals = deals.filter(deal => {
    if (activeFilter === 'all') return true
    const isLocal = isLocalPickup(deal)
    return activeFilter === 'pickup' ? isLocal : !isLocal
  })

  // Count deals in each category
  const localCount = deals.filter(isLocalPickup).length
  const shippingCount = deals.length - localCount

  useEffect(() => {
    let cancelled = false
    knownDealIds.current.clear()

    const loadDeals = async (isPolling = false) => {
      try {
        if (!isPolling) setLoading(true)

        // Load both regular deals and needs review deals
        const [allDeals, reviewDeals] = await Promise.all([
          api.getDeals({ status: 'new' }),
          api.getDeals({ needs_review: true }),
        ])

        if (cancelled) return

        // Filter out unknown condition from regular deals
        const validDeals = allDeals.filter(d => d.condition !== 'unknown')

        // Check for new deals on polling
        if (isPolling && knownDealIds.current.size > 0) {
          const newDeals = validDeals.filter(deal => !knownDealIds.current.has(deal.id))
          newDeals.forEach(deal => {
            const profit = deal.estimated_profit ? parseFloat(String(deal.estimated_profit)) : undefined
            toastRef.current(deal.title, profit)
          })
        }

        knownDealIds.current = new Set(validDeals.map(d => d.id))
        setDeals(validDeals)
        setNeedsReview(reviewDeals)
        setError(null)
      } catch (err) {
        if (!isPolling) setError('Failed to load deals')
        console.error(err)
      } finally {
        if (!isPolling) setLoading(false)
      }
    }

    loadDeals()

    const interval = setInterval(() => loadDeals(true), POLL_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const formatPrice = (price: number | string | null) => {
    if (price === null || price === undefined) return '—'
    const num = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(num)) return '—'
    return `$${num.toFixed(0)}`
  }

  const getProfitClass = (profit: number | string | null) => {
    if (profit === null || profit === undefined) return ''
    const num = typeof profit === 'string' ? parseFloat(profit) : profit
    if (isNaN(num)) return ''
    if (num >= 50) return 'profit-high'
    if (num >= 20) return 'profit-medium'
    return 'profit-low'
  }

  const getConditionBadge = (condition: string | null) => {
    if (!condition) return null
    const badges: Record<string, { text: string; className: string }> = {
      'new': { text: 'New', className: 'badge-new' },
      'used': { text: 'Used', className: 'badge-used' },
      'needs_repair': { text: 'Repair', className: 'badge-repair' },
      'unknown': { text: 'Unknown', className: 'badge-unknown' },
    }
    return badges[condition] || null
  }

  if (loading) {
    return (
      <div className="deals-page">
        <div className="loading">Loading deals...</div>
      </div>
    )
  }

  return (
    <div className="deals-page">
      {/* Needs Review Section */}
      {needsReview.length > 0 && (
        <div className="needs-review-section">
          <h2 className="section-title">Needs Review ({needsReview.length})</h2>
          <div className="review-scroll">
            {needsReview.map(deal => (
              <div
                key={deal.id}
                className="review-card"
                onClick={() => navigate(`/deals/${deal.id}`)}
              >
                {deal.image_url ? (
                  <img src={deal.image_url} alt={deal.title} className="review-thumbnail" />
                ) : (
                  <div className="review-thumbnail-placeholder">📦</div>
                )}
                <div className="review-title">{deal.title}</div>
                <div className="review-price">{formatPrice(deal.asking_price)}</div>
                <div className="review-question">
                  {deal.repair_needed ? 'Confirm repair?' : 'Condition?'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Location Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`tab ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All ({deals.length})
        </button>
        <button
          className={`tab ${activeFilter === 'pickup' ? 'active' : ''}`}
          onClick={() => setActiveFilter('pickup')}
        >
          Pick-up ({localCount})
        </button>
        <button
          className={`tab ${activeFilter === 'shipping' ? 'active' : ''}`}
          onClick={() => setActiveFilter('shipping')}
        >
          Shipping ({shippingCount})
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="deals-grid">
        {filteredDeals.length === 0 ? (
          <div className="empty-state">
            <p>No deals found</p>
          </div>
        ) : (
          filteredDeals.map(deal => {
            const conditionBadge = getConditionBadge(deal.condition)
            const isRepair = deal.condition === 'needs_repair'
            const distance = deal.distance_miles ? parseFloat(String(deal.distance_miles)) : null

            return (
              <div
                key={deal.id}
                className={`deal-card ${isRepair ? 'repair-card' : ''}`}
                onClick={() => navigate(`/deals/${deal.id}`)}
              >
                <div className="deal-image">
                  {deal.image_url ? (
                    <img src={deal.image_url} alt={deal.title} />
                  ) : (
                    <div className="no-image">No Image</div>
                  )}
                  {conditionBadge && (
                    <span className={`condition-badge ${conditionBadge.className}`}>
                      {conditionBadge.text}
                    </span>
                  )}
                </div>

                <div className="deal-info">
                  <h3 className="deal-title">{deal.title}</h3>

                  <div className="deal-meta">
                    {deal.category && <span className="category">{deal.category}</span>}
                    {deal.source && <span className="source">{deal.source}</span>}
                    {distance !== null && distance <= LOCAL_RADIUS_MILES && (
                      <span className="distance">{distance.toFixed(0)} mi</span>
                    )}
                  </div>

                  <div className="deal-prices">
                    <div className="price-row">
                      <span className="label">Asking:</span>
                      <span className="asking-price">{formatPrice(deal.asking_price)}</span>
                    </div>
                    <div className="price-row">
                      <span className="label">Market:</span>
                      <span className="market-price">{formatPrice(deal.market_value)}</span>
                    </div>
                    <div className="price-row profit-row">
                      <span className="label">Profit:</span>
                      <span className={`profit-value ${getProfitClass(deal.estimated_profit)}`}>
                        {formatPrice(deal.estimated_profit)}
                      </span>
                    </div>
                  </div>

                  {deal.local_pickup_available && (
                    <div className="local-pickup">
                      Local Pickup
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
