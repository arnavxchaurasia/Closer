import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const MY_NICK_KEY      = '@soulsync/my_nickname';
const PARTNER_NICK_KEY = '@soulsync/partner_nickname';

interface Nicknames {
  myNickname: string;
  partnerNickname: string;
  setMyNickname: (v: string) => Promise<void>;
  setPartnerNickname: (v: string) => Promise<void>;
}

export function useNicknames(myRealName?: string, partnerRealName?: string): Nicknames {
  const [myNickname, setMyNick]          = useState(myRealName?.split(' ')[0] ?? '');
  const [partnerNickname, setPartnerNick] = useState(partnerRealName?.split(' ')[0] ?? '');

  useEffect(() => {
    AsyncStorage.multiGet([MY_NICK_KEY, PARTNER_NICK_KEY]).then(pairs => {
      const [myStored, partnerStored] = pairs;
      setMyNick(myStored[1] || myRealName?.split(' ')[0] || '');
      setPartnerNick(partnerStored[1] || partnerRealName?.split(' ')[0] || '');
    });
  }, [myRealName, partnerRealName]);

  const setMyNickname = useCallback(async (v: string) => {
    setMyNick(v);
    await AsyncStorage.setItem(MY_NICK_KEY, v);
  }, []);

  const setPartnerNickname = useCallback(async (v: string) => {
    setPartnerNick(v);
    await AsyncStorage.setItem(PARTNER_NICK_KEY, v);
  }, []);

  return { myNickname, partnerNickname, setMyNickname, setPartnerNickname };
}
