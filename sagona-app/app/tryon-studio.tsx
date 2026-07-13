import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/lib/api';

const C = {
  black: '#0A0A0A', gold: '#C9A84C', cream: '#F8F6F3',
  border: '#E8E5E0', muted: '#888', success: '#1D9E75', white: '#fff'
};

export default function TryOnStudioScreen() {
  const router = useRouter();
  const [myPhoto, setMyPhoto]     = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { fetchMyPhoto(); }, []);

  async function fetchMyPhoto() {
    try {
      const res = await api.get('/tryon/photo');
      if (res.data.data?.hasPhoto) setMyPhoto(res.data.data.url);
    } catch {}
    finally { setLoading(false); }
  }

  async function uploadPhoto(uri: string) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', { uri, type: 'image/jpeg', name: 'tryon-photo.jpg' } as any);
      const res = await api.post('/tryon/upload-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setMyPhoto(res.data.data.url);
        Alert.alert('✓ Photo uploaded!', 'You can now try on any garment in one tap.');
      }
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload your try-on photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled) await uploadPhoto(result.assets[0].uri);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [3, 4], quality: 0.85
    });
    if (!result.canceled) await uploadPhoto(result.assets[0].uri);
  }

  async function deletePhoto() {
    Alert.alert('Delete photo?', 'You can upload a new one anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete('/tryon/photo'); setMyPhoto(null); } catch {}
      }}
    ]);
  }

  if (loading) return (
    <SafeAreaView style={s.screen}>
      <ActivityIndicator color={C.gold} size="large" style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.black} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Try-On Studio</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.subtitle}>
          Upload one photo of yourself. Try any garment on yourself with one tap —
          no re-uploading needed.
        </Text>

        <View style={s.privacyBox}>
          <Text style={s.privacyText}>
            🔒 Your photo is stored securely and only used for virtual try-on.
            It is never shared or used for advertising. Delete anytime.
          </Text>
        </View>

        {myPhoto ? (
          <View style={s.photoCard}>
            <Image source={{ uri: myPhoto }} style={s.myPhoto} />
            <View style={{ flex: 1 }}>
              <Text style={s.photoReady}>✓ Photo uploaded</Text>
              <Text style={s.photoSub}>
                Tap "TRY ON" on any product to see how it looks on you.
              </Text>
              <TouchableOpacity onPress={pickFromGallery} style={s.changeBtn} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color={C.gold} size="small" />
                  : <Text style={s.changeBtnText}>📸 CHANGE PHOTO</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={deletePhoto} style={s.deleteBtn}>
                <Text style={s.deleteBtnText}>🗑 DELETE PHOTO</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.uploadCard}>
            <Text style={s.uploadIcon}>👤</Text>
            <Text style={s.uploadTitle}>No photo yet</Text>
            <Text style={s.uploadHint}>
              Upload a clear, full-length or waist-up photo of yourself.
            </Text>

            <View style={s.guidelines}>
              {[
                '✅ Good lighting, clear background',
                '✅ Full body or waist-up photo',
                '✅ Fitted or light-coloured clothing',
                '❌ No group photos',
              ].map((g, i) => (
                <Text key={i} style={s.guideline}>{g}</Text>
              ))}
            </View>

            <TouchableOpacity onPress={pickFromGallery} style={s.uploadBtn} disabled={uploading}>
              {uploading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.uploadBtnText}>📷 CHOOSE FROM GALLERY</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={takePhoto} style={[s.uploadBtn, s.cameraBtn]} disabled={uploading}>
              <Text style={[s.uploadBtnText, { color: C.black }]}>📸 TAKE A PHOTO NOW</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.cream },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.border, backgroundColor: C.white },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 18, color: C.black },
  body:         { flex: 1, padding: 20 },
  subtitle:     { fontSize: 13, color: C.muted, lineHeight: 20, marginBottom: 16 },
  privacyBox:   { backgroundColor: '#EAF3DE', borderRadius: 8, padding: 12, marginBottom: 20 },
  privacyText:  { fontSize: 12, color: '#2D6A4F', lineHeight: 18 },
  photoCard:    { backgroundColor: C.white, borderRadius: 12, padding: 16, flexDirection: 'row',
                  gap: 14, marginBottom: 20, borderWidth: 1, borderColor: C.gold },
  myPhoto:      { width: 100, height: 130, borderRadius: 8 },
  photoReady:   { fontSize: 14, fontWeight: '600', color: C.success, marginBottom: 6 },
  photoSub:     { fontSize: 12, color: C.muted, lineHeight: 18, marginBottom: 12 },
  changeBtn:    { padding: 8, borderWidth: 0.5, borderColor: C.gold, borderRadius: 4,
                  marginBottom: 8, alignItems: 'center' },
  changeBtnText:{ fontSize: 11, letterSpacing: 1, color: C.gold, fontWeight: '500' },
  deleteBtn:    { padding: 8, alignItems: 'center' },
  deleteBtnText:{ fontSize: 11, color: '#E24B4A' },
  uploadCard:   { backgroundColor: C.white, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20 },
  uploadIcon:   { fontSize: 48, marginBottom: 12 },
  uploadTitle:  { fontSize: 16, fontWeight: '600', color: C.black, marginBottom: 6 },
  uploadHint:   { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18, marginBottom: 16 },
  guidelines:   { width: '100%', marginBottom: 20 },
  guideline:    { fontSize: 13, color: '#555', paddingVertical: 6,
                  borderBottomWidth: 0.5, borderBottomColor: C.border },
  uploadBtn:    { width: '100%', padding: 14, backgroundColor: C.gold, borderRadius: 4,
                  alignItems: 'center', marginBottom: 10 },
  cameraBtn:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.black },
  uploadBtnText:{ fontSize: 12, letterSpacing: 1.5, color: C.white, fontWeight: '600' },
});
