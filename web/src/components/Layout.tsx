import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import './Layout.css'

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()

  const navItems = [
    { path: '/deals', label: 'Deals', icon: '🔍' },
    { path: '/flips', label: 'Current Flips', icon: '📦' },
    { path: '/profits', label: 'Profits', icon: '💰' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ]

  const isActive = (path: string) => location.pathname === path

  // Get current page title from nav items or path
  const getPageTitle = () => {
    const currentNav = navItems.find(item => location.pathname.startsWith(item.path))
    if (currentNav) return currentNav.label
    if (location.pathname.startsWith('/list-item')) return 'List Item'
    return 'DealScout'
  }

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h1 className="brand">
            {sidebarOpen ? 'DealScout' : 'DS'}
          </h1>
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? '✕' : '☰'}
          </button>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span className="nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="main-container">
        <header className="header">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <h2 className="page-title">{getPageTitle()}</h2>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

export default Layout
