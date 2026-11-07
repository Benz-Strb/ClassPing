import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiFetch } from '../lib/api';

interface Reply {
  answer: string;
  sources: { id: string; title: string; content: string; url: string | null }[];
  mock: boolean;
}
interface Message { question: string; reply: Reply }

export function ChatScreen({ authenticated }: { authenticated: boolean }) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const history = useRef<ComponentRef<typeof ScrollView>>(null);
  async function send() {
    const question = text.trim();
    if (!question || sending.current) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      const reply = await apiFetch<Reply>(authenticated ? '/chat/student' : '/chat/public', {
        method: 'POST', body: JSON.stringify({ message: question }),
      }, 70_000);
      setMessages((items) => [...items.slice(-19), { question, reply }]);
      setText('');
    } catch (e) { setError(e instanceof Error ? e.message : 'ส่งข้อความไม่ได้'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.heading}>DPU Chat</Text>
      <Text style={styles.caption}>ถามข้อมูลมหาวิทยาลัย</Text>
    </View>
    <ScrollView ref={history} onContentSizeChange={() => history.current?.scrollToEnd({ animated: true })} style={styles.history} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" accessibilityLabel="ประวัติแชท">
      {!messages.length && <View style={styles.empty}>
        <Text style={styles.emptyTitle}>อยากรู้อะไรเกี่ยวกับ DPU?</Text>
        <Text style={styles.caption}>พิมพ์คำถามด้านล่างได้เลย</Text>
      </View>}
      {messages.map((m, i) => <View key={i} style={styles.exchange}>
        <View style={styles.question}><Text selectable style={styles.questionText}>{m.question}</Text></View>
        <View style={styles.answer}>
          <Text selectable style={styles.answerText}>{m.reply.answer}</Text>
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
      {busy && <View style={styles.loading} accessibilityLiveRegion="polite"><ActivityIndicator color="#111" /><Text style={styles.caption}>กำลังค้นหาคำตอบ…</Text></View>}
    </ScrollView>
    <View style={styles.composer}>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.inputRow}>
        <TextInput accessibilityLabel="คำถาม" placeholder="ถามเกี่ยวกับ DPU…" placeholderTextColor="#5e6168" value={text} onChangeText={setText}
          multiline maxLength={2000} editable={!busy} style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel="ส่งคำถาม" accessibilityState={{ disabled: busy || !text.trim(), busy }} disabled={busy || !text.trim()} onPress={() => void send()} style={({ pressed }) => [styles.button, (busy || !text.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>ส่ง</Text>
        </Pressable>
      </View>
      <Text style={styles.notice}>รุ่นทดสอบ · ตอบจากข้อมูลที่มีในระบบ</Text>
    </View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#efefef' },
  header: { paddingHorizontal: 24, paddingVertical: 16, gap: 4, borderBottomWidth: 1, borderColor: '#d5d5d5' },
  heading: { fontSize: 22, fontWeight: '600', color: '#111' },
  caption: { fontSize: 14, lineHeight: 22, color: '#5e6168' },
  history: { flex: 1 },
  historyContent: { flexGrow: 1, padding: 20, gap: 24, width: '100%', maxWidth: 800, alignSelf: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyTitle: { fontSize: 22, lineHeight: 32, fontWeight: '600', color: '#111', textAlign: 'center' },
  exchange: { gap: 16 },
  question: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: '#111', padding: 16, borderRadius: 16 },
  questionText: { fontSize: 16, lineHeight: 26, color: '#fff' },
  answer: { alignSelf: 'stretch', gap: 16, paddingVertical: 4 },
  answerText: { fontSize: 16, lineHeight: 28, color: '#111' },
  sources: { gap: 8, borderTopWidth: 1, borderColor: '#d5d5d5', paddingTop: 12 },
  sourceLink: { minHeight: 48, justifyContent: 'center' },
  link: { fontSize: 14, lineHeight: 22, color: '#111', textDecorationLine: 'underline' },
  loading: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 },
  composer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, backgroundColor: '#efefef', borderTopWidth: 1, borderColor: '#d5d5d5' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: 800, alignSelf: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#999', backgroundColor: '#fff', color: '#111', borderRadius: 12, padding: 12, minHeight: 48, maxHeight: 130, fontSize: 16, lineHeight: 24 },
  button: { minHeight: 48, minWidth: 48, padding: 12, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  notice: { fontSize: 12, lineHeight: 18, color: '#5e6168', textAlign: 'center' },
  error: { color: '#b42318', fontSize: 14, lineHeight: 22 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
