import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import './Settings.css'

interface EbayStatus {
  linked: boolean
  username?: string
  store_tier?: string
  fee_percentage?: number
  token_valid?: boolean
  last_updated?: string
}

export default function Settings() {
  const { showToast } = useToast()
  const [profitThreshold, setProfitThreshold] = useState('30')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [ebayLoading, setEbayLoading] = useState(false)
  const [ebayStatus, setEbayStatus] = useState<EbayStatus | null>(null)

  useEffect(() => {
    loadSettings()
    loadEbayStatus()
  }, [])

  const loadSettings = async () => {
    try {
      const settings = await api.getSettings()
      setProfitThreshold(settings.profit_threshold.toString())
      setNotificationsEnabled(settings.notifications_enabled)
    } catch (error) {
      console.error('Failed to load settings:', error)
      showToast({ type: 'error', title: 'Failed to Load', message: 'Could not load settings' })
    } finally {
      setLoading(false)
    }
  }

  const loadEbayStatus = async () => {
    try {
      const status = await api.getEbayStatus()
      setEbayStatus(status)
    } catch (error) {
      console.error('Failed to load eBay status:', error)
    }
  }

  const handleLinkEbay = async () => {
    try {
      setEbayLoading(true)
      const { auth_url } = await api.getEbayAuthUrl()
      if (auth_url) {
        window.open(auth_url, '_blank')
        showToast({ type: 'info', title: 'eBay Authorization', message: 'Complete the login in the new window' })
        // Poll for status update after a delay
        setTimeout(() => loadEbayStatus(), 3000)
      }
    } catch (error) {
      showToast({ type: 'error', title: 'Authorization Failed', message: 'Could not start eBay authorization' })
    } finally {
      setEbayLoading(false)
    }
  }

  const handleRefreshEbay = async () => {
    try {
      setEbayLoading(true)
      await api.refreshEbayInfo()
      await loadEbayStatus()
      showToast({ type: 'success', title: 'eBay Refreshed', message: 'Account info updated' })
    } catch (error) {
      showToast({ type: 'error', title: 'Refresh Failed', message: 'Could not refresh eBay info' })
    } finally {
      setEbayLoading(false)
    }
  }

  const handleUnlinkEbay = async () => {
    if (!confirm('This will remove your eBay account connection. Fees will default to 13%. Continue?')) {
      return
    }

    try {
      setEbayLoading(true)
      await api.unlinkEbayAccount()
      await loadEbayStatus()
      showToast({ type: 'success', title: 'eBay Unlinked', message: 'Account has been disconnected' })
    } catch (error) {
      showToast({ type: 'error', title: 'Unlink Failed', message: 'Could not unlink eBay account' })
    } finally {
      setEbayLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      await api.updateSettings({
        profit_threshold: parseFloat(profitThreshold) || 30,
        ebay_fee_percentage: ebayStatus?.fee_percentage || 13,
        notifications_enabled: notificationsEnabled,
      })
      showToast({ type: 'success', title: 'Settings Saved', message: 'Your preferences have been updated' })
    } catch (error) {
      showToast({ type: 'error', title: 'Save Failed', message: 'Could not save settings' })
    }
  }

  const currentFee = ebayStatus?.fee_percentage || 13

  if (loading) {
    return (
      <div className="settings-page">
        <div className="loading">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-sections">
        {/* Deal Alerts Section */}
        <div className="section">
          <h2 className="section-title">Deal Alerts</h2>

          <div className="setting">
            <div className="setting-info">
              <div className="setting-label">Profit Threshold</div>
              <div className="setting-description">
                Minimum profit to trigger a notification
              </div>
            </div>
            <div className="input-container">
              <span className="input-prefix">$</span>
              <input
                type="number"
                className="input"
                value={profitThreshold}
                onChange={(e) => setProfitThreshold(e.target.value)}
                placeholder="30"
              />
            </div>
          </div>

          <div className="setting">
            <div className="setting-info">
              <div className="setting-label">Notifications</div>
              <div className="setting-description">
                Receive push notifications for deals (mobile only)
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* eBay Account Section */}
        <div className="section">
          <h2 className="section-title">eBay Account</h2>

          {ebayStatus?.linked ? (
            <>
              <div className="ebay-linked">
                <div className="ebay-status">
                  <span className="ebay-status-label">Status</span>
                  <span className="linked-badge">Linked</span>
                </div>
                {ebayStatus.store_tier && (
                  <div className="ebay-row">
                    <span className="ebay-row-label">Store Tier</span>
                    <span className="ebay-row-value">{ebayStatus.store_tier}</span>
                  </div>
                )}
                <div className="ebay-row">
                  <span className="ebay-row-label">Your Fee Rate</span>
                  <span className="ebay-fee-value">{currentFee}%</span>
                </div>
              </div>
              <div className="ebay-actions">
                <button
                  className="ebay-refresh-btn"
                  onClick={handleRefreshEbay}
                  disabled={ebayLoading}
                >
                  {ebayLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  className="ebay-unlink-btn"
                  onClick={handleUnlinkEbay}
                  disabled={ebayLoading}
                >
                  Unlink
                </button>
              </div>
            </>
          ) : (
            <div className="ebay-unlinked">
              <p className="ebay-unlinked-text">
                Link your eBay seller account to automatically use your actual fee rates
              </p>
              <button
                className="ebay-link-btn"
                onClick={handleLinkEbay}
                disabled={ebayLoading}
              >
                {ebayLoading ? 'Connecting...' : 'Link eBay Account'}
              </button>
              <p className="ebay-default-fee">
                Default fee: 13% (standard seller rate)
              </p>
            </div>
          )}
        </div>

        {/* Fee Summary Section */}
        <div className="section">
          <h2 className="section-title">Fee Summary</h2>

          <div className="fee-info">
            <div className="fee-row">
              <span className="fee-label">eBay Final Value Fee</span>
              <span className="fee-value">{currentFee}%</span>
            </div>
            <p className="fee-description">
              {ebayStatus?.linked
                ? `Based on your ${ebayStatus.store_tier || 'account'} subscription`
                : 'Link eBay account above for your actual rate'}
            </p>
          </div>

          <div className="fee-info">
            <div className="fee-row">
              <span className="fee-label">Facebook Marketplace</span>
              <span className="fee-value-free">0%</span>
            </div>
            <p className="fee-description">
              No fees for local pickup transactions
            </p>
          </div>
        </div>

        {/* Save Button */}
        <button className="save-button" onClick={saveSettings}>
          Save Settings
        </button>

        {/* About Section */}
        <div className="about">
          <h3 className="about-title">DealScout</h3>
          <p className="about-version">Version 1.0.0</p>
          <p className="about-description">
            Find profitable deals, track your flips, and maximize your reselling
            profits.
          </p>
        </div>
      </div>
    </div>
  )
}
