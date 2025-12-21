# DealScout

A mobile app that monitors marketplace alerts, analyzes deals for profitability, and tracks your flips.

## Features

- **Deal Discovery**: Ingests alerts from Swoopa (via email) for Facebook Marketplace, Craigslist, eBay, and more
- **AI Classification**: Uses Gemini Flash to identify items, brands, models, and condition
- **Price Lookup**: Checks eBay sold listings to determine market value
- **Profit Calculation**: Estimates profit after platform fees
- **Push Notifications**: Alerts you instantly when a profitable deal appears
- **Flip Tracking**: Track purchases, sales, and profits over time

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────┐
│  Swoopa Alerts  │────▶│  Backend (FastAPI)                   │
│  (Gmail)        │     │  - Email ingestion                   │
└─────────────────┘     │  - AI classification (Gemini Flash)  │
                        │  - Price lookup (eBay API)           │
                        │  - Push notifications (FCM)          │
                        └──────────────────────────────────────┘
                                         │
                                         ▼
                        ┌──────────────────────────────────────┐
                        │  Mobile App (React Native)           │
                        │  - Deals feed with profit estimates  │
                        │  - Current Flips inventory           │
                        │  - Profits history with filters      │
                        │  - Settings                          │
                        └──────────────────────────────────────┘
```

## Tech Stack

### Backend
- Python 3.11+ with FastAPI
- SQLite (or PostgreSQL)
- Gmail API for email ingestion
- Google Gemini Flash for AI classification
- eBay Browse API for price lookup
- Firebase Cloud Messaging for push notifications

### Mobile
- React Native with Expo
- Firebase Cloud Messaging

## Setup

### Backend

1. Create a virtual environment:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up API credentials:
   - **Gmail API**: Create project in Google Cloud Console, enable Gmail API, download `credentials.json`
   - **Gemini AI**: Get API key from Google AI Studio
   - **eBay API**: Register at eBay Developer Program, get app credentials
   - **Firebase**: Create project in Firebase Console, download service account JSON

4. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. Run the server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Mobile App

1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```

2. Configure Firebase:
   - Add `google-services.json` (Android) to `mobile/`
   - Update Firebase config in `app.json`

3. Run the app:
   ```bash
   npx expo start
   ```

## API Endpoints

### Deals
- `GET /deals` - List deals (filter by status, min_profit, category)
- `GET /deals/{id}` - Get single deal
- `POST /deals/{id}/dismiss` - Dismiss a deal
- `POST /deals/{id}/condition` - Update condition (new/used)
- `POST /deals/{id}/purchase` - Mark as purchased (creates flip)

### Flips
- `GET /flips` - List flips (filter by status, category, date)
- `POST /flips` - Create manual flip
- `PUT /flips/{id}` - Update flip
- `POST /flips/{id}/sell` - Mark as sold

### Stats
- `GET /stats` - Profit statistics
- `GET /settings` - Get settings
- `PUT /settings` - Update settings
- `POST /device-token` - Register for push notifications

## App Screens

1. **Deals** - Incoming profitable deals with estimated profit
2. **Current Flips** - Items purchased but not yet sold
3. **Profits** - Completed sales with profit breakdown
4. **Settings** - Notification preferences and fee defaults

## License

MIT
