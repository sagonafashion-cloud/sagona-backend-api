import React, { useState, useRef, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EventSource from 'react-native-sse';
import * as SecureStore from 'expo-secure-store';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import { API_BASE } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'assistant', text: 'Hi! I\'m SAGi, your SAGONA style assistant. Ask me about products, sizes, orders, or anything kidswear! 👋' }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const stored = SecureStore.getItemAsync('sagi_session').then((v) => { if (v) setSessionId(v); });
    return () => { esRef.current?.close(); };
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
    const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', text: '', streaming: true };
    setMessages((prev) => [...prev, userMsg, botMsg]);

    try {
      const token = await SecureStore.getItemAsync('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const es = new EventSource(`${API_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text, sessionId }),
      });
      esRef.current = es;

      let buffer = '';

      es.addEventListener('message', (e: any) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type === 'session') {
            setSessionId(parsed.sessionId);
            SecureStore.setItemAsync('sagi_session', parsed.sessionId);
          } else if (parsed.type === 'text') {
            buffer += parsed.content;
            const captured = buffer;
            setMessages((prev) => prev.map((m) => m.streaming ? { ...m, text: captured } : m));
          } else if (parsed.type === 'done' || parsed.type === 'error') {
            setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
            es.close();
            setSending(false);
          }
        } catch {}
      });

      es.addEventListener('error', () => {
        setMessages((prev) => prev.map((m) => m.streaming ? { ...m, text: 'Sorry, something went wrong.', streaming: false } : m));
        setSending(false);
      });
    } catch {
      setMessages((prev) => prev.map((m) => m.streaming ? { ...m, text: 'Connection error. Please try again.', streaming: false } : m));
      setSending(false);
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{item.text}</Text>
        {item.streaming && <ActivityIndicator size="small" color={colors.gold} style={{ marginTop: 4 }} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SAGi</Text>
        <Text style={styles.headerSub}>Your style assistant</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask about products, sizes, orders..."
            placeholderTextColor={colors.lightGray}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]} onPress={sendMessage} disabled={!input.trim() || sending}>
            <Ionicons name="send" size={18} color={input.trim() && !sending ? colors.black : colors.lightGray} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  header: { backgroundColor: colors.black, padding: spacing.md, alignItems: 'center' },
  headerTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.gold, letterSpacing: 2 },
  headerSub: { fontFamily: fonts.body, fontSize: 11, color: colors.lightGray, letterSpacing: 1 },
  messageList: { padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleUser: { backgroundColor: colors.gold, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: colors.white, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontFamily: fonts.body, fontSize: 15, color: colors.black, lineHeight: 22 },
  bubbleTextUser: { color: colors.black },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.sm, gap: spacing.sm },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.black, maxHeight: 100, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.border },
});
