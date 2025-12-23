import './App.css'

function App() {
  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">DealScout</h1>
        <p className="tagline">Find profitable deals. Track your flips.</p>
      </header>

      <main className="main">
        <div className="hero">
          <div className="hero-content">
            <h2>Smart Deal Discovery</h2>
            <p>
              DealScout monitors marketplace alerts, uses AI to classify items,
              and calculates profit potential so you never miss a good flip.
            </p>
            <ul className="features">
              <li>Real-time Swoopa alert monitoring</li>
              <li>AI-powered item classification</li>
              <li>eBay market value lookup</li>
              <li>Profit tracking and analytics</li>
              <li>Local pickup detection</li>
            </ul>
          </div>
        </div>

        <div className="cta-section">
          <p className="cta-text">Available on mobile</p>
          <div className="app-badges">
            <span className="badge">iOS</span>
            <span className="badge">Android</span>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>DealScout by Junipr</p>
      </footer>
    </div>
  )
}

export default App
