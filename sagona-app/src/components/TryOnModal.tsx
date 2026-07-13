import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, Image, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';

const { height: H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  productId: string;
  garmentImageUrl: string;
  productName: string;
}

type Phase = 'checking' | 'no_photo' | 'generating' | 'result' | 'error';

export default function TryOnModal({ visible, onClose, productId, garmentImageUrl, productName }: Props) {
  const [phase, setPhase]           = useState<Phase>('checking');
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl]   = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [saved, setSaved]           = useState(false);

  useEffect(() => {
    if (visible) {
      setPhase('checking');
      setResultUrl(null);
      setSaved(false);
      checkAndGenerate();
    }
  }, [visible]);

  async function checkAndGenerate() {
    try {
      const res = await api.get('/tryon/photo');
      if (!res.data.data?.hasPhoto) { setPhase('no_photo'); return; }
      setMyPhotoUrl(res.data.data.url);
      setPhase('generating');
      await generate();
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
      setPhase('error');
    }
  }

  async function generate() {
    try {
      setPhase('generating');
      const res = await api.post('/tryon/generate', { productId, garmentImageUrl });
      if (res.data.success) {
        setResultUrl(res.data.data.resultUrl);
        setPhase('result');
      } else {
        throw new Error(res.data.message);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Generation failed');
      setPhase('error');
    }
  }

  async function saveResult() {
    try {
      await api.post('/tryon/save-result', {
        garmentProductId: productId,
        garmentName: productName,
        resultImageUrl: resultUrl
      });
      setSaved(true);
    } catch {}
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
           onRequestClose={onClose}>
      <SafeAreaView style={s.container} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Try-On Studio</Text>
            <Text style={s.headerSub} numberOfLines={1}>{productName}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={20} color="#555" />
          </TouchableOpacity>
        </View>

        <ScrollView style={s.body} showsVerticalScrollIndicator={false}>

          {/* CHECKING */}
          {phase === 'checking' && (
            <View style={s.centered}>
              <ActivityIndicator color="#C9A84C" size="large" />
              <Text style={s.statusText}>Setting up try-on...</Text>
            </View>
          )}

          {/* NO PHOTO */}
          {phase === 'no_photo' && (
            <View style={s.centered}>
              <Text style={s.bigEmoji}>📸</Text>
              <Text style={s.noPhotoTitle}>Upload Your Photo First</Text>
              <Text style={s.noPhotoText}>
                Go to Account → Try-On Studio to upload your photo once.
                Then try on any garment with one tap!
              </Text>
              <TouchableOpacity onPress={onClose} style={s.primaryBtn}>
                <Text style={s.primaryBtnText}>GO TO MY ACCOUNT</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* GENERATING */}
          {phase === 'generating' && (
            <View>
              <View style={s.previewRow}>
                <View style={s.previewItem}>
                  <Text style={s.previewLabel}>YOUR PHOTO</Text>
                  {myPhotoUrl && (
                    <Image source={{ uri: myPhotoUrl }} style={s.previewImg} />
                  )}
                </View>
                <Text style={s.plusSign}>+</Text>
                <View style={s.previewItem}>
                  <Text style={s.previewLabel}>GARMENT</Text>
                  <Image source={{ uri: garmentImageUrl }} style={s.previewImg} />
                </View>
              </View>
              <View style={s.generatingBox}>
                <ActivityIndicator color="#C9A84C" size="large" style={{ marginBottom: 16 }} />
                <Text style={s.generatingTitle}>Generating your try-on...</Text>
                <Text style={s.generatingText}>
                  AI is styling the garment on your photo. This takes 20–40 seconds.
                </Text>
              </View>
            </View>
          )}

          {/* RESULT */}
          {phase === 'result' && resultUrl && (
            <View>
              <Text style={s.resultLabel}>✨ YOUR TRY-ON RESULT</Text>
              <Image source={{ uri: resultUrl }} style={s.resultImg} resizeMode="contain" />
              <Text style={s.disclaimer}>
                AI-generated preview. Actual product may vary slightly.
              </Text>
              <TouchableOpacity
                onPress={saveResult}
                style={[s.primaryBtn, saved && s.savedBtn]}
                disabled={saved}
              >
                <Text style={s.primaryBtnText}>{saved ? '✓ SAVED' : '💾 SAVE RESULT'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={generate} style={s.secondaryBtn}>
                <Text style={s.secondaryBtnText}>🔄 TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <View style={s.errorBox}>
              <Text style={s.errorEmoji}>⚠️</Text>
              <Text style={s.errorText}>{errorMsg || 'Try-on failed. Please try again.'}</Text>
              <TouchableOpacity onPress={generate} style={s.primaryBtn}>
                <Text style={s.primaryBtnText}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  header:         { flexDirection: 'row', alignItems: 'center',
                    padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#E8E5E0' },
  headerTitle:    { fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 18, color: '#0A0A0A' },
  headerSub:      { fontSize: 12, color: '#888', marginTop: 2 },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F8F6F3',
                    alignItems: 'center', justifyContent: 'center' },
  body:           { flex: 1, padding: 20 },
  centered:       { alignItems: 'center', paddingVertical: 40 },
  bigEmoji:       { fontSize: 56, marginBottom: 16 },
  noPhotoTitle:   { fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 20, color: '#0A0A0A',
                    marginBottom: 10, textAlign: 'center' },
  noPhotoText:    { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20,
                    marginBottom: 24, paddingHorizontal: 20 },
  previewRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  previewItem:    { flex: 1 },
  previewLabel:   { fontSize: 10, letterSpacing: 1.5, color: '#888', marginBottom: 8, textAlign: 'center' },
  previewImg:     { width: '100%', aspectRatio: 3/4, borderRadius: 8, backgroundColor: '#F0EDE8' },
  plusSign:       { fontSize: 24, color: '#888' },
  generatingBox:  { backgroundColor: '#F8F6F3', borderRadius: 10, padding: 24, alignItems: 'center' },
  generatingTitle:{ fontSize: 15, fontWeight: '600', color: '#0A0A0A', marginBottom: 8 },
  generatingText: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },
  statusText:     { fontSize: 13, color: '#888', marginTop: 14 },
  resultLabel:    { fontSize: 12, letterSpacing: 1.5, color: '#888', textAlign: 'center', marginBottom: 14 },
  resultImg:      { width: '100%', height: H * 0.55, borderRadius: 10,
                    backgroundColor: '#F0EDE8', marginBottom: 10 },
  disclaimer:     { fontSize: 11, color: '#AAA', textAlign: 'center', marginBottom: 16 },
  primaryBtn:     { backgroundColor: '#C9A84C', borderRadius: 4, padding: 14,
                    alignItems: 'center', marginBottom: 10 },
  savedBtn:       { backgroundColor: '#1D9E75' },
  primaryBtnText: { color: '#fff', fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },
  secondaryBtn:   { borderWidth: 0.5, borderColor: '#E8E5E0', borderRadius: 4, padding: 12, alignItems: 'center' },
  secondaryBtnText:{ fontSize: 12, color: '#555', letterSpacing: 1 },
  errorBox:       { alignItems: 'center', padding: 32, backgroundColor: '#FCEBEB', borderRadius: 10 },
  errorEmoji:     { fontSize: 36, marginBottom: 12 },
  errorText:      { fontSize: 13, color: '#E24B4A', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
});
