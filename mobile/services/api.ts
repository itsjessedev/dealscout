/**
 * API service for communicating with DealScout backend.
 */

// Configure this to your backend URL
const API_URL = 'http://localhost:8000';

export interface Deal {
  id: number;
  title: string;
  asking_price: number | null;
  listing_url: string | null;
  source: string | null;
  location: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  condition_confidence: string | null;
  market_value: number | null;
  estimated_profit: number | null;
  status: string;
  created_at: string;
}

export interface Flip {
  id: number;
  deal_id: number | null;
  item_name: string;
  category: string | null;
  buy_price: number;
  buy_date: string;
  buy_source: string | null;
  status: string;
  sell_price: number | null;
  sell_date: string | null;
  sell_platform: string | null;
  fees_paid: number;
  shipping_cost: number;
  profit: number | null;
}

export interface Stats {
  overall: {
    total_profit: number;
    total_flips: number;
    avg_profit_per_flip: number;
    best_flip_profit: number | null;
    total_invested: number;
    total_revenue: number;
  };
  by_period: Array<{
    period: string;
    profit: number;
    flip_count: number;
  }>;
  by_category: Array<{
    category: string;
    profit: number;
    flip_count: number;
  }>;
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  // Deals
  async getDeals(params?: {
    status?: string;
    min_profit?: number;
    category?: string;
    needs_review?: boolean;
  }): Promise<Deal[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.min_profit) query.set('min_profit', String(params.min_profit));
    if (params?.category) query.set('category', params.category);
    if (params?.needs_review) query.set('needs_review', 'true');

    const queryString = query.toString();
    return this.request(`/deals${queryString ? `?${queryString}` : ''}`);
  }

  async getDeal(id: number): Promise<Deal> {
    return this.request(`/deals/${id}`);
  }

  async dismissDeal(id: number): Promise<void> {
    await this.request(`/deals/${id}/dismiss`, { method: 'POST' });
  }

  async updateCondition(id: number, condition: 'new' | 'used'): Promise<Deal> {
    return this.request(`/deals/${id}/condition`, {
      method: 'POST',
      body: JSON.stringify({ condition }),
    });
  }

  async purchaseDeal(
    id: number,
    data: { buy_price: number; buy_date: string; notes?: string }
  ): Promise<Flip> {
    return this.request(`/deals/${id}/purchase`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Flips
  async getFlips(params?: {
    status?: 'active' | 'sold';
    category?: string;
    platform?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<Flip[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);
    if (params?.platform) query.set('platform', params.platform);
    if (params?.date_from) query.set('date_from', params.date_from);
    if (params?.date_to) query.set('date_to', params.date_to);

    const queryString = query.toString();
    return this.request(`/flips${queryString ? `?${queryString}` : ''}`);
  }

  async createFlip(data: {
    item_name: string;
    category?: string;
    buy_price: number;
    buy_date: string;
    buy_source?: string;
    notes?: string;
  }): Promise<Flip> {
    return this.request('/flips', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFlip(
    id: number,
    data: Partial<{
      item_name: string;
      category: string;
      buy_price: number;
      buy_date: string;
      buy_source: string;
      notes: string;
    }>
  ): Promise<Flip> {
    return this.request(`/flips/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async sellFlip(
    id: number,
    data: {
      sell_price: number;
      sell_date: string;
      sell_platform: string;
      fees_paid?: number;
      shipping_cost?: number;
    }
  ): Promise<Flip> {
    return this.request(`/flips/${id}/sell`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteFlip(id: number): Promise<void> {
    await this.request(`/flips/${id}`, { method: 'DELETE' });
  }

  // Stats
  async getStats(): Promise<Stats> {
    return this.request('/stats');
  }

  // Settings
  async getSettings(): Promise<{
    profit_threshold: number;
    ebay_fee_percentage: number;
    notifications_enabled: boolean;
  }> {
    return this.request('/settings');
  }

  async updateSettings(data: {
    profit_threshold?: number;
    ebay_fee_percentage?: number;
    notifications_enabled?: boolean;
  }): Promise<void> {
    await this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Device token
  async registerDeviceToken(token: string): Promise<void> {
    await this.request('/device-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }
}

export const api = new ApiService();
