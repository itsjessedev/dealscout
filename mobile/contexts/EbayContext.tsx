import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

interface EbayStatus {
  linked: boolean;
  username?: string;
  store_tier?: string;
  fee_percentage: number;
  token_valid?: boolean;
  last_updated?: string;
}

interface EbayContextType {
  status: EbayStatus | null;
  loading: boolean;
  feePercentage: number;
  refresh: () => Promise<void>;
}

const defaultFee = 13;

const EbayContext = createContext<EbayContextType>({
  status: null,
  loading: true,
  feePercentage: defaultFee,
  refresh: async () => {},
});

export function EbayProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    try {
      const data = await api.getEbayStatus();
      setStatus({
        ...data,
        fee_percentage: data.fee_percentage || defaultFee,
      });
    } catch (error) {
      console.error('Failed to load eBay status:', error);
      setStatus({ linked: false, fee_percentage: defaultFee });
    } finally {
      setLoading(false);
    }
  };

  // Load on mount (app launch)
  useEffect(() => {
    loadStatus();
  }, []);

  const feePercentage = status?.fee_percentage || defaultFee;

  return (
    <EbayContext.Provider
      value={{
        status,
        loading,
        feePercentage,
        refresh: loadStatus,
      }}
    >
      {children}
    </EbayContext.Provider>
  );
}

export function useEbay() {
  return useContext(EbayContext);
}
