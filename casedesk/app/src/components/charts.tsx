import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../theme';

export function HBars({ data, color, format = (n: number) => n.toLocaleString('en-US') }: {
  data: { label: string; value: number; highlight?: boolean }[]; color?: string; format?: (n: number) => string;
}) {
  const t = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ gap: 12 }}>
      {data.map((d, i) => (
        <View key={d.label}>
          <View style={{ flexDirection: 'row', marginBottom: 5 }}>
            <Text style={{ color: t.faint, width: 20, fontSize: 13, fontWeight: '600' }}>{i + 1}</Text>
            <Text style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{d.label}</Text>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{format(d.value)}</Text>
          </View>
          <View style={{ marginLeft: 20, height: 8, backgroundColor: t.surface2, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${(d.value / max) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: d.highlight ? t.amber : color ?? t.accent }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Columns({ data, height = 150 }: { data: { label: string; value: number; note?: string }[]; height?: number }) {
  const t = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: height + 44 }}>
      {data.map((d, i) => {
        const last = i === data.length - 1;
        return (
          <View key={d.label} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: last ? t.text : t.sub, fontSize: 11, fontWeight: '700', marginBottom: 6, fontVariant: ['tabular-nums'] }}>
              {d.value >= 1000 ? `${Math.round(d.value / 1000)}K` : d.value}
            </Text>
            <View style={{ width: '100%', height: (d.value / max) * height, borderRadius: 8, backgroundColor: last ? t.accent : t.surface2 }} />
            <Text style={{ color: t.sub, fontSize: 11, marginTop: 6, fontWeight: '600' }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
