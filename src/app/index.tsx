import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CountryInfoSheet } from '@/components/CountryInfoSheet';
import { MapControls } from '@/components/MapControls';
import { mapColors } from '@/map/offlineStyle';
import { type FillMode, WorldMap } from '@/map/WorldMap';

export default function MapScreen() {
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);
  const [fillMode, setFillMode] = useState<FillMode>('flat');

  return (
    <View style={styles.container}>
      <WorldMap selectedIso3={selectedIso3} onSelect={setSelectedIso3} fillMode={fillMode} />
      <MapControls fillMode={fillMode} onFillModeChange={setFillMode} />
      <CountryInfoSheet iso3={selectedIso3} onClose={() => setSelectedIso3(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mapColors.ocean },
});
