import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CountryInfoSheet } from '@/components/CountryInfoSheet';
import { mapColors } from '@/map/offlineStyle';
import { WorldMap } from '@/map/WorldMap';

export default function MapScreen() {
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <WorldMap selectedIso3={selectedIso3} onSelect={setSelectedIso3} />
      <CountryInfoSheet iso3={selectedIso3} onClose={() => setSelectedIso3(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mapColors.ocean },
});
