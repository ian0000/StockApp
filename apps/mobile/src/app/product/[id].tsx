import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <PlaceholderScreen title="Detalle de producto" subtitle={`ID: ${id}`} />
  );
}
