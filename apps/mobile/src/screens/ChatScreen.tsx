import { colors } from '../ui/theme';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { Pressable, ScrollView, Text, TextInput } from '../ui/primitives';
import { apiFetch } from '../lib/api';
import {SearchSuggestions} from '../ui/SearchSuggestions';

interface Reply {
  answer: string;
  sources: { id: string; title: string; content: string; url: string | null }[];
  mock: boolean;
  webGrounded?: boolean;
  searchEntryPoint?: string;
  mode?: 'study';
}
interface Message { question: string; reply: Reply }

export function ChatScreen({ authenticated }: { authenticated: boolean }) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reviewInput = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => { const timer = setTimeout(() => reviewInput.current?.focus(), 3000); return () => clearTimeout(timer); }, []);
  const sending = useRef(false);
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const history = useRef<ComponentRef<typeof ScrollView>>(null);
  const visibleMessages = authenticated ? messages.filter(item => item.reply.mode === 'study') : messages;
  async function send() {
    const question = text.trim();
    if (!question || sending.current) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      const reply = await apiFetch<Reply>(authenticated ? '/chat/student' : '/chat/public', {
        method: 'POST', body: JSON.stringify({ message: question, ...(authenticated && {history: visibleMessages.slice(-6).map(item => ({question: item.question, answer: item.reply.answer.slice(0, 2000)}))}) }),
      }, 70_000);
      if (authenticated && reply.mode !== 'study') throw new Error('ผู้ช่วยเรียนยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      setMessages((items) => [...items.slice(-19), { question, reply }]);
      setText('');
    } catch (e) { setError(e instanceof Error ? e.message : 'ส่งข้อความไม่ได้'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <View ref={frame} collapsable={false} style={styles.root} onLayout={() => {
    frame.current?.measureInWindow((_x, y) => setKeyboardOffset(y));
  }}>
  <KeyboardAvoidingView style={styles.root} keyboardVerticalOffset={keyboardOffset} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.heading}>{authenticated ? 'ผู้ช่วยเรียน' : 'DPU Chat'}</Text>
      <Text style={styles.caption}>{authenticated ? 'อธิบายบทเรียน ฝึกโจทย์ และเรียนรู้ไปด้วยกัน' : 'ถามข้อมูลมหาวิทยาลัย'}</Text>
    </View>
    <ScrollView ref={history} onContentSizeChange={() => history.current?.scrollToEnd({ animated: true })} style={styles.history} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" accessibilityLabel="ประวัติแชท">
      {!visibleMessages.length && <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{authenticated ? 'วันนี้อยากเรียนรู้เรื่องอะไร?' : 'อยากรู้อะไรเกี่ยวกับ DPU?'}</Text>
        <Text style={styles.caption}>{authenticated ? 'พิมพ์หัวข้อหรือโจทย์ที่สงสัย แล้วค่อย ๆ ทำความเข้าใจไปด้วยกัน' : 'พิมพ์คำถามด้านล่างได้เลย'}</Text>
        {authenticated && <View style={styles.suggestions}>{['ช่วยอธิบายหัวข้อที่เรียนไม่เข้าใจ', 'สอนวิธีแก้โจทย์ทีละขั้น', 'ช่วยวางแผนอ่านหนังสือสอบ'].map(prompt => <Pressable key={prompt} style={styles.suggestion} onPress={() => setText(prompt)}><Text style={styles.suggestionText}>{prompt}</Text></Pressable>)}</View>}
      </View>}
      {visibleMessages.map((m, i) => <View key={i} style={styles.exchange}>
        <View style={styles.question}><Text selectable style={styles.questionText}>{m.question}</Text></View>
        <View style={styles.answer}>
          <Text selectable style={styles.answerText}>{m.reply.answer}</Text>
          {m.reply.mock && <Text style={styles.caption}>โหมดทดสอบ · ยังไม่ได้เชื่อม AI จริง</Text>}
          {m.reply.searchEntryPoint && <SearchSuggestions html={m.reply.searchEntryPoint}/>}
          {m.reply.sources.length > 0 && <View style={styles.sources}>
            <Text style={styles.caption}>แหล่งอ้างอิง</Text>
            {m.reply.sources.map((source, n) => source.url && /^https?:\/\//i.test(source.url) ? (
              <Pressable key={source.id} accessibilityRole="link" accessibilityLabel={source.title} style={({ pressed }) => [styles.sourceLink, pressed && styles.pressed]} onPress={() => {
                void Linking.openURL(source.url!).catch(() => setError('เปิดลิงก์ไม่ได้'));
              }}><Text style={styles.link}>{n + 1}. {source.title}</Text></Pressable>
            ) : <Text key={source.id} style={styles.caption}>{n + 1}. {source.title}</Text>)}
          </View>}
        </View>
      </View>)}
      {busy && <View style={styles.loading} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.ink} /><Text style={styles.caption}>กำลังค้นหาคำตอบ…</Text></View>}
    </ScrollView>
    <View style={styles.composer}>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.inputRow}>
        <TextInput ref={reviewInput} accessibilityLabel="คำถาม" placeholder={authenticated ? 'ถามบทเรียนหรือพิมพ์โจทย์ที่สงสัย…' : 'ถามเกี่ยวกับ DPU…'} placeholderTextColor={colors.muted} value={text} onChangeText={setText}
          multiline maxLength={2000} editable={!busy} style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel="ส่งคำถาม" accessibilityState={{ disabled: busy || !text.trim(), busy }} disabled={busy || !text.trim()} onPress={() => void send()} style={({ pressed }) => [styles.button, (busy || !text.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>ส่ง</Text>
        </Pressable>
      </View>
      <Text style={styles.notice}>{authenticated ? 'ช่วยตอบและอธิบายเท่านั้น · ควรตรวจสอบคำตอบก่อนนำไปใช้' : 'ตอบจากข้อมูลมหาวิทยาลัยที่เปิดเผยในระบบ'}</Text>
    </View>
  </KeyboardAvoidingView>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 24, paddingVertical: 20, gap: 4 },
  heading: { fontSize: 27, lineHeight: 38, fontWeight: '500', color: colors.identity },
  caption: { fontSize: 14, lineHeight: 22, color: colors.muted },
  history: { flex: 1 },
  historyContent: { flexGrow: 1, padding: 20, gap: 24, width: '100%', maxWidth: 800, alignSelf: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: 12, paddingVertical: 32 },
  emptyTitle: { fontSize: 22, lineHeight: 32, fontWeight: '500', color: colors.identity },
  suggestions: {alignSelf: 'stretch', gap: 8, marginTop: 12},
  suggestion: {justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface},
  suggestionText: {fontSize: 14, color: colors.identity},
  exchange: { gap: 16 },
  question: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: colors.action, padding: 16, borderRadius: 16 },
  questionText: { fontSize: 16, lineHeight: 26, color: colors.surface },
  answer: { alignSelf: 'stretch', gap: 16, paddingVertical: 4 },
  answerText: { fontSize: 16, lineHeight: 28, color: colors.ink },
  sources: { gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 },
  sourceLink: { minHeight: 48, justifyContent: 'center' },
  link: { fontSize: 14, lineHeight: 22, color: colors.ink, textDecorationLine: 'underline' },
  loading: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 },
  composer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: 800, alignSelf: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, color: colors.ink, borderRadius: 12, padding: 12, minHeight: 48, maxHeight: 130, fontSize: 16, lineHeight: 24 },
  button: { minHeight: 48, minWidth: 48, padding: 12, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.surface },
  notice: { fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9 },
});
