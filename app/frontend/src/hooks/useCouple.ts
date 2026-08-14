import { useState, useEffect, useCallback } from 'react';
import { api } from '@/src/api';

export type CoupleStatus = 'loading' | 'connected' | 'not_connected';

export function useCouple() {
  const [status, setStatus] = useState<CoupleStatus>('loading');
  const [couple, setCouple] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);

  const check = useCallback(async () => {
    try {
      const data = await api.get<any>('/api/couple');
      if (data && data.couple_id) {
        setCouple(data);
        setStatus('connected');
        // Fetch partner info
        try {
          const p = await api.get('/api/partner');
          setPartner(p);
        } catch {}
      } else {
        setStatus('not_connected');
      }
    } catch {
      setStatus('not_connected');
    }
  }, []);

  useEffect(() => { check(); }, []);

  return { status, couple, partner, refetch: check };
}
