import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { api } from '@/src/api';
import { useAuth } from '@/src/context/AuthContext';

export interface CouplePartner {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  avatar_url?: string;
  last_active?: string;
}

export interface CoupleData {
  couple_id: string;
  members: CouplePartner[];
  created_at: string;
}

export interface PartnerAvailability {
  status: string;
  updated_at: string;
}

interface PairStatusResponse {
  paired: boolean;
  couple?: CoupleData;
  partner?: CouplePartner;
  partner_availability?: PartnerAvailability;
}

interface CoupleContextValue {
  couple: CoupleData | null;
  partner: CouplePartner | null;
  isPaired: boolean;
  isLoading: boolean;
  partnerAvailability: PartnerAvailability | null;
  refresh(): Promise<void>;
}

const CoupleContext = createContext<CoupleContextValue | undefined>(undefined);

export function CoupleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [couple, setCouple] = useState<CoupleData | null>(null);
  const [partner, setPartner] = useState<CouplePartner | null>(null);
  const [partnerAvailability, setPartnerAvailability] =
    useState<PartnerAvailability | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setCouple(null);
      setPartner(null);
      setPartnerAvailability(null);
      return;
    }
    setIsLoading(true);
    try {
      const status = await api.get<PairStatusResponse>('/api/pair/status');
      if (status.paired && status.couple) {
        setCouple(status.couple);
        setPartner(status.partner ?? null);
        setPartnerAvailability(status.partner_availability ?? null);
      } else {
        setCouple(null);
        setPartner(null);
        setPartnerAvailability(null);
      }
    } catch {
      // Network error — retain previous state.
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return (
    <CoupleContext.Provider
      value={{
        couple,
        partner,
        isPaired: couple !== null,
        isLoading,
        partnerAvailability,
        refresh: fetchStatus,
      }}
    >
      {children}
    </CoupleContext.Provider>
  );
}

export function useCouple(): CoupleContextValue {
  const ctx = useContext(CoupleContext);
  if (!ctx) throw new Error('useCouple must be used within CoupleProvider');
  return ctx;
}
