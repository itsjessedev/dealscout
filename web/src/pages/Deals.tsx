import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import type { Deal } from '../services/api'
import { useToast } from '../components/Toast'
import './Deals.css'

type FilterTab = 'good' | 'review' | 'all'

const POLL_INTERVAL = 30000 // 30 seconds

export default function Deals() {
  const navigate = useNavigate()
  const { showDealNotification } = useToast()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('good')
  const knownDealIds = useRef<Set<number>>(new Set())

  const loadDeals = useCallback(async (isPolling = false) => {
    try {
      if (!isPolling) setLoading(true)
      let params: any = {}

      if (activeTab === 'good') {
        params.status = 'new'
      } else if (activeTab === 'review') {
        params.needs_review = true
      }

      const data = await api.getDeals(params)

      // Check for new deals (only on polling, not initial load)
      if (isPolling && knownDealIds.current.size > 0) {
        const newDeals = data.filter(deal => !knownDealIds.current.has(deal.id))
        newDeals.forEach(deal => {
          showDealNotification(deal.title, deal.estimated_profit ?? undefined)
        })
      }

      // Update known deal IDs
      knownDealIds.current = new Set(data.map(d => d.id))
      setDeals(data)
    } catch (err) {
      if (!isPolling) setError('Failed to load deals')
      console.error(err)
    } finally {
      if (!isPolling) setLoading(false)
    }
  }, [activeTab, showDealNotification])

  // Initial load and tab change
  useEffect(() => {
    knownDealIds.current.clear() // Reset known IDs on tab change
    loadDeals()
  }, [loadDeals])

  // Polling for new deals
  useEffect(() => {
    const interval = setInterval(() => {
      loadDeals(true)
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [loadDeals])

  const formatPrice = (price: number | null) => {
    if (price === null) return '—'
    return `$${price.toFixed(0)}`
  }

  const getProfitClass = (profit: number | null) => {
    if (profit === null) return ''
    if (profit >= 50) return 'profit-high'
    if (profit >= 20) return 'profit-medium'
    return 'profit-low'
  }

  const getConditionBadge = (condition: string | null) => {
    if (!condition) return null
    const badges: Record<string, { text: string; className: string }> = {
      'new': { text: 'New', className: 'badge-new' },
      'used': { text: 'Used', className: 'badge-used' },
      'needs_repair': { text: 'Needs Repair', className: 'badge-repair' },
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
      <header className="page-header">
        <h1>Deals</h1>
      </header>

      <div className="filter-tabs">
        <button
          className={`tab ${activeTab === 'good' ? 'active' : ''}`}
          onClick={() => setActiveTab('good')}
        >
          Good Deals
        </button>
        <button
          className={`tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          Needs Review
        </button>
        <button
          className={`tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="deals-grid">
        {deals.length === 0 ? (
          <div className="empty-state">
            <p>No deals found</p>
          </div>
        ) : (
          deals.map(deal => {
            const conditionBadge = getConditionBadge(deal.condition)
            const isRepair = deal.condition === 'needs_repair'

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
                      Local Pickup {deal.distance_miles && `(${deal.distance_miles.toFixed(1)} mi)`}
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
