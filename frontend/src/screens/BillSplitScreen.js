import React from 'react';
import { useQuery } from '@tanstack/react-query';
import BillSplitFlow from '../components/billSplit/BillSplitFlow';
import { fetchProfile } from '../api/client';
import { queryKeys } from '../data/queryKeys';

/**
 * Stack screen for the bill split flow. Opened from the People header's receipt button
 * with the picked bill photo in route.params.image.
 */
export default function BillSplitScreen({ route, navigation, token, onShowToast, onTransactionMutated }) {
  const { data: profile } = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => fetchProfile(token),
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <BillSplitFlow
      token={token}
      image={route?.params?.image || null}
      language={profile?.language === 'ml' ? 'ml' : 'en'}
      onClose={() => navigation.goBack()}
      onMutated={onTransactionMutated}
      onShowToast={onShowToast}
    />
  );
}
