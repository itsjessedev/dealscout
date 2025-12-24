import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import type { Flip } from '../services/api'
import { useToast } from '../components/Toast'
import './CurrentFlips.css'

export default function CurrentFlips() {
  const navigate = useNavigate()
  const { showToast, showSaleNotification } = useToast()
  const [flips, setFlips] = useState<Flip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sell modal state
  const [sellModal, setSellModal] = useState<{ visible: boolean; flip: Flip | null }>({
    visible: false,
    flip: null,
  })
  const [sellPrice, setSellPrice] = useState('')
  const [sellPlatform, setSellPlatform] = useState<string | null>(null)

  // Facebook listing modal state
  const [listingModal, setListingModal] = useState<{
    visible: boolean
    flip: Flip | null
    loading: boolean
    suggestion: any | null
  }>({
    visible: false,
    flip: null,
    loading: false,
    suggestion: null,
  })

  const loadFlips = useCallback(async (showSyncNotification = false) => {
    try {
      // Sync eBay orders first
      try {
        const syncResult = await api.syncEbayOrders()
        if (showSyncNotification && syncResult.synced > 0) {
          // Show sale notifications for each synced order
          syncResult.items?.forEach(item => {
            showSaleNotification(item.item_name, item.profit)
          })
        }
      } catch (err) {
        console.log('eBay sync skipped:', err)
      }

      const data = await api.getFlips({ status: 'active' })
      setFlips(data)
      setError(null)
    } catch (err) {
      setError('Failed to load flips')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [showSaleNotification])

  useEffect(() => {
    loadFlips()
  }, [loadFlips])

  const calculateDaysHeld = (buyDate: string): number => {
    const buy = new Date(buyDate)
    const now = new Date()
    return Math.floor((now.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24))
  }

  const calculateDaysListed = (listedAt: string): number => {
    const listed = new Date(listedAt)
    const now = new Date()
    return Math.floor((now.getTime() - listed.getTime()) / (1000 * 60 * 60 * 24))
  }

  const handleListItem = (flip: Flip) => {
    navigate(`/list-item/${flip.id}`)
  }

  const handleListOnFacebook = async (flip: Flip) => {
    setListingModal({ visible: true, flip, loading: true, suggestion: null })

    try {
      let suggestion
      if (flip.deal_id) {
        suggestion = await api.getFlipListingSuggestion(flip.id)
      } else {
        // For manually added flips, create basic listing text
        suggestion = {
          suggested_title: flip.item_name,
          description: `${flip.item_name}\n\nCondition: Used\nPrice: Negotiable`,
          testing_checklist: [],
        }
      }
      setListingModal(prev => ({ ...prev, loading: false, suggestion }))
    } catch (error) {
      console.error('Failed to generate FB listing:', error)
      // Fallback to basic listing
      setListingModal(prev => ({
        ...prev,
        loading: false,
        suggestion: {
          suggested_title: flip.item_name,
          description: flip.item_name,
          testing_checklist: [],
        },
      }))
    }
  }

  const copyForFacebook = async () => {
    if (!listingModal.suggestion || !listingModal.flip) return
    const { suggested_title, description } = listingModal.suggestion
    const price = parseFloat(String(listingModal.flip.buy_price)) * 1.5 // Suggest 50% markup as starting point

    const fbText = `${suggested_title}

${description}

Price: $${price.toFixed(0)} OBO
Condition: Used - Excellent
Pickup available

Message me with any questions!`

    try {
      await navigator.clipboard.writeText(fbText)
      showToast({
        type: 'success',
        title: 'Copied to Clipboard',
        message: 'Open Facebook Marketplace and paste into your new listing.',
      })
      setListingModal({ visible: false, flip: null, loading: false, suggestion: null })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Copy Failed',
        message: 'Could not copy to clipboard',
      })
    }
  }

  const handleSell = (flip: Flip) => {
    setSellPrice('')
    setSellPlatform(null)
    setSellModal({ visible: true, flip })
  }

  const confirmSell = async () => {
    if (!sellModal.flip || !sellPrice || !sellPlatform) return

    try {
      const price = parseFloat(sellPrice)
      // Calculate fees - use 13.5% default for eBay
      const fees = sellPlatform === 'ebay' ? price * 0.135 : 0

      await api.sellFlip(sellModal.flip.id, {
        sell_price: price,
        sell_date: new Date().toISOString().split('T')[0],
        sell_platform: sellPlatform,
        fees_paid: fees,
        shipping_cost: 0,
      })

      const profit = price - parseFloat(String(sellModal.flip.buy_price)) - fees
      showSaleNotification(sellModal.flip.item_name, profit)
      setSellModal({ visible: false, flip: null })
      setSellPrice('')
      setSellPlatform(null)
      loadFlips()
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to Record Sale',
        message: 'Please try again',
      })
      console.error(error)
    }
  }

  const handleDelete = async (flip: Flip) => {
    if (!window.confirm(`Remove "${flip.item_name}" from your inventory?`)) {
      return
    }

    try {
      await api.deleteFlip(flip.id)
      showToast({
        type: 'success',
        title: 'Item Removed',
        message: flip.item_name,
      })
      loadFlips()
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: 'Could not remove item',
      })
      console.error(error)
    }
  }

  const totalInventoryValue = flips.reduce(
    (sum, f) => sum + (Number(f.buy_price) || 0),
    0
  )

  if (loading) {
    return (
      <div className="current-flips-page">
        <div className="loading">Loading inventory...</div>
      </div>
    )
  }

  return (
    <div className="current-flips-page">
      <div className="summary-bar">
        <div className="summary-label">Total Inventory Value</div>
        <div className="summary-value">${totalInventoryValue.toFixed(2)}</div>
        <div className="summary-count">{flips.length} items</div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {flips.length === 0 ? (
        <div className="empty-state">
          <p>No active flips</p>
          <p className="empty-subtext">Purchase deals to track them here</p>
        </div>
      ) : (
        <div className="flips-list">
          {flips.map(flip => {
            const isListed = !!flip.listed_at
            const daysCount = isListed
              ? calculateDaysListed(flip.listed_at!)
              : calculateDaysHeld(flip.buy_date)

            return (
              <div
                key={flip.id}
                className={`flip-card ${isListed ? 'listed' : ''}`}
              >
                <div className="flip-header">
                  {/* Thumbnail */}
                  {flip.image_url ? (
                    <img
                      src={flip.image_url}
                      alt={flip.item_name}
                      className="thumbnail"
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <span>📦</span>
                    </div>
                  )}

                  <div className="flip-header-text">
                    <h3 className="flip-title">{flip.item_name}</h3>
                    <div className="flip-details">
                      <span className="buy-price">
                        Paid: ${Number(flip.buy_price).toFixed(2)}
                      </span>
                      <span className="source">{flip.buy_source || 'Unknown'}</span>
                    </div>
                  </div>

                  <div className="status-badge">
                    {isListed ? (
                      <>
                        <span className="listed-badge">LISTED</span>
                        <span className="days-count">{daysCount}d</span>
                      </>
                    ) : (
                      <span className="not-listed-badge">NOT LISTED</span>
                    )}
                  </div>
                </div>

                {flip.category && (
                  <div className="category">{flip.category}</div>
                )}

                {flip.ebay_listing_id && (
                  <div className="ebay-link">eBay: {flip.ebay_listing_id}</div>
                )}

                {flip.planned_repairs && flip.planned_repairs.length > 0 && (
                  <div className="planned-repairs">
                    <div className="planned-repairs-label">Planned Repairs:</div>
                    <div className="planned-repairs-list">
                      {flip.planned_repairs.map((r: any) => r.name).join(', ')}
                    </div>
                  </div>
                )}

                <div className="flip-actions">
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(flip)
                    }}
                    title="Delete"
                  >
                    🗑
                  </button>

                  {!isListed && (
                    <>
                      <button
                        className="ebay-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleListItem(flip)
                        }}
                        title="List on eBay"
                      >
                        <div className="ebay-logo">
                          <span className="ebay-e">e</span>
                          <span className="ebay-b">b</span>
                          <span className="ebay-a">a</span>
                          <span className="ebay-y">y</span>
                        </div>
                      </button>
                      <button
                        className="fb-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleListOnFacebook(flip)
                        }}
                        title="List on Facebook"
                      >
                        <span className="fb-logo">f</span>
                      </button>
                    </>
                  )}

                  <button
                    className="sell-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSell(flip)
                    }}
                  >
                    Sold
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Sell Modal */}
      {sellModal.visible && (
        <div className="modal-overlay" onClick={() => setSellModal({ visible: false, flip: null })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Mark as Sold</h2>
            <p className="modal-subtitle">{sellModal.flip?.item_name}</p>

            <input
              type="number"
              className="modal-input"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="Enter sell price"
              autoFocus
              step="0.01"
            />

            <div className="platform-label">Where did you sell it?</div>
            <div className="platform-buttons">
              {['ebay', 'facebook'].map((platform) => (
                <button
                  key={platform}
                  className={`platform-btn ${sellPlatform === platform ? 'active' : ''}`}
                  onClick={() => setSellPlatform(platform)}
                >
                  {platform === 'ebay' ? 'eBay' : 'Facebook'}
                </button>
              ))}
            </div>

            <div className="modal-buttons">
              <button
                className="modal-cancel-btn"
                onClick={() => setSellModal({ visible: false, flip: null })}
              >
                Cancel
              </button>
              <button
                className="modal-confirm-btn"
                onClick={confirmSell}
                disabled={!sellPrice || !sellPlatform}
              >
                Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Facebook Listing Modal */}
      {listingModal.visible && (
        <div className="modal-overlay" onClick={() => setListingModal({ visible: false, flip: null, loading: false, suggestion: null })}>
          <div className="modal-content listing-modal" onClick={(e) => e.stopPropagation()}>
            <div className="listing-header">
              <h2 className="modal-title">List on Facebook</h2>
              <button
                className="close-btn"
                onClick={() => setListingModal({ visible: false, flip: null, loading: false, suggestion: null })}
              >
                ✕
              </button>
            </div>

            {listingModal.loading ? (
              <div className="listing-loading">
                <p>Generating listing...</p>
              </div>
            ) : listingModal.suggestion ? (
              <div className="listing-content">
                <p className="fb-instructions">
                  Facebook Marketplace doesn't have an API, so we'll copy the listing text for you to paste.
                </p>

                {/* Preview */}
                <div className="listing-section">
                  <div className="section-label">Preview</div>
                  <div className="fb-preview-box">
                    <div className="fb-preview-title">
                      {listingModal.suggestion.suggested_title}
                    </div>
                    <div className="fb-preview-description">
                      {listingModal.suggestion.description}
                    </div>
                    <div className="fb-preview-price">
                      Price: ${(parseFloat(String(listingModal.flip?.buy_price || 0)) * 1.5).toFixed(0)} OBO
                    </div>
                  </div>
                </div>

                {/* Testing Checklist */}
                {listingModal.suggestion.testing_checklist && listingModal.suggestion.testing_checklist.length > 0 && (
                  <div className="listing-section">
                    <div className="section-label">Test Before Posting</div>
                    {listingModal.suggestion.testing_checklist.map((item: string, index: number) => (
                      <div key={index} className="checklist-item">
                        <span className="checklist-bullet">☐</span>
                        <span className="checklist-text">{item}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Copy Button */}
                <button className="fb-copy-btn" onClick={copyForFacebook}>
                  Copy & Open Facebook
                </button>

                <p className="fb-note">
                  You'll need to add photos manually in Facebook Marketplace
                </p>
              </div>
            ) : (
              <div className="listing-loading">
                <p>Failed to load listing</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
