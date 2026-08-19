import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { colors, fonts, spacing, radius, typography } from '../lib/theme';
import Button from './ui/Button';

// Wires the PDP's size picker into the existing backend AI sizing feature
// (POST /sizing/recommend, public — no auth required). Closes the P0 "AI
// sizing not connected to PDP" gap from the Aug 2026 UX report. Only handles
// manual measurement entry; using a saved child profile (GET /sizing/profiles,
// requires login) is a reasonable Phase 4 follow-on, not built here.

interface Recommendation {
  size: string;
  confidence: number;
  confidenceLabel: string;
  fitType: string;
  warnings: string[];
  notes: string[];
  alternative?: { size: string; confidence: number; reason: string | null } | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  productId: string;
  onSelectSize: (size: string) => void;
}

export default function SizeFinderModal({ visible, onClose, productId, onSelectSize }: Props) {
  const [height, setHeight] = useState('');
  const [chest, setChest] = useState('');
  const [shoulder, setShoulder] = useState('');
  const [waist, setWaist] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [noData, setNoData] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setResult(null);
    setNoData(null);
    setError('');
  };

  const submit = async () => {
    if (!height && !chest) {
      setError('Enter at least height or chest measurement (in cm)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const measurements: Record<string, number> = {};
      if (height) measurements.height = Number(height);
      if (chest) measurements.chest = Number(chest);
      if (shoulder) measurements.shoulder = Number(shoulder);
      if (waist) measurements.waist = Number(waist);

      const { data } = await api.post('/sizing/recommend', { productId, measurements });
      if (data.hasData === false) {
        setNoData(data.message || 'Size chart not available for this product.');
        setResult(null);
      } else {
        setResult(data.recommendation);
        setNoData(null);
      }
    } catch (err: any) {
      setError(err.message || 'Could not get a recommendation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Find My Size</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.gray} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            Enter measurements in centimetres — height and chest give the best match. The rest are optional.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>HEIGHT (CM)</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={height} onChangeText={setHeight} placeholder="e.g. 104" placeholderTextColor={colors.lightGray} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>CHEST (CM)</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={chest} onChangeText={setChest} placeholder="e.g. 56" placeholderTextColor={colors.lightGray} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>SHOULDER (CM) · OPTIONAL</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={shoulder} onChangeText={setShoulder} placeholder="e.g. 28" placeholderTextColor={colors.lightGray} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>WAIST (CM) · OPTIONAL</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={waist} onChangeText={setWaist} placeholder="e.g. 52" placeholderTextColor={colors.lightGray} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label={loading ? 'Finding your size...' : 'Get My Recommendation'} onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />

          {noData && (
            <View style={styles.noDataBox}>
              <Ionicons name="information-circle-outline" size={20} color={colors.gray} />
              <Text style={styles.noDataText}>{noData}</Text>
            </View>
          )}

          {result && (
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>RECOMMENDED SIZE</Text>
              <Text style={styles.resultSize}>{result.size}</Text>
              <Text style={styles.resultConfidence}>{result.confidenceLabel} match · {result.confidence}%</Text>
              <Text style={styles.resultFit}>{result.fitType}</Text>

              {result.warnings?.map((w, i) => <Text key={i} style={styles.warning}>⚠ {w}</Text>)}
              {result.notes?.map((n, i) => <Text key={i} style={styles.note}>{n}</Text>)}

              <TouchableOpacity style={styles.useBtn} onPress={() => { onSelectSize(result.size); handleClose(); }}>
                <Text style={styles.useBtnText}>Use size {result.size}</Text>
              </TouchableOpacity>

              {result.alternative && (
                <TouchableOpacity
                  style={styles.altBtn}
                  onPress={() => { onSelectSize(result.alternative!.size); handleClose(); }}
                >
                  <Text style={styles.altBtnText}>
                    Prefer looser? Try {result.alternative.size} ({result.alternative.confidence}% match)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  title: { ...typography.h2 },
  closeBtn: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.light, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, padding: spacing.lg },
  hint: { ...typography.bodyMuted, lineHeight: 19, marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.gray, letterSpacing: 0.5, marginBottom: spacing.xs },
  input: { height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 15, color: colors.black, backgroundColor: colors.white },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.error, marginBottom: spacing.sm },
  noDataBox: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.light, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg, alignItems: 'flex-start' },
  noDataText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.gray, lineHeight: 19 },
  resultCard: { backgroundColor: colors.light, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg },
  resultLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.gray, letterSpacing: 1, marginBottom: spacing.xs },
  resultSize: { fontFamily: fonts.heading, fontSize: 36, color: colors.black },
  resultConfidence: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.gold, marginTop: 2 },
  resultFit: { fontFamily: fonts.body, fontSize: 12, color: colors.gray, marginTop: 2, marginBottom: spacing.sm },
  warning: { fontFamily: fonts.body, fontSize: 12, color: colors.error, marginTop: 4 },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.gray, marginTop: 4 },
  useBtn: { backgroundColor: colors.black, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center', marginTop: spacing.md },
  useBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.white, letterSpacing: 0.5 },
  altBtn: { paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  altBtnText: { fontFamily: fonts.body, fontSize: 12, color: colors.gray, textDecorationLine: 'underline' },
});
