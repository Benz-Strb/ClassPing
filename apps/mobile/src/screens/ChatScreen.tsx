import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiFetch } from '../lib/api';

interface Reply {
  answer: string;
  sources: { id: string; title: string; content: string; url: string | null }[];
  mock: boolean;
  classroom: 'not_connected';
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
      });
      setMessages((items) => [...items.slice(-19), { question, reply }]);
      setText('');
    } catch (e) { setError(e instanceof Error ? e.message : 'ส่งข้อความไม่ได้'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Text style={styles.heading}>{authenticated ? 'ผู้ช่วยนักศึกษา' : 'Open House / บุคคลทั่วไป'}</Text>
    <Text>โหมดทดสอบ ยังไม่เชื่อม LLM และ Classroom</Text>
    <Text>{authenticated ? 'ค้นเฉพาะข้อมูลสาธารณะและข้อมูลที่บัญชีนี้มีสิทธิ์' : 'ค้นเฉพาะแหล่งความรู้สาธารณะ ไม่ต้องเข้าสู่ระบบ'}</Text>
    <ScrollView ref={history} onContentSizeChange={() => history.current?.scrollToEnd({ animated: true })} style={styles.history} keyboardShouldPersistTaps="handled" accessibilityLabel="ประวัติแชท">
      {!messages.length && <Text>ถามเกี่ยวกับมหาวิทยาลัยได้ คำตอบจะแสดงข้อความและแหล่งอ้างอิงที่นำเข้าแล้ว</Text>}
      {messages.map((m, i) => <View key={i} style={styles.message}>
        <Text style={styles.heading}>คุณ: {m.question}</Text>
        <Text selectable>{m.reply.answer}</Text>
        {m.reply.sources.map((s, n) => <View key={s.id}>
          <Text>แหล่งอ้างอิง [{n + 1}]: {s.title}</Text>
          {s.url && /^https?:\/\//i.test(s.url) && <Pressable accessibilityRole="link" onPress={() => {
            void Linking.openURL(s.url!).catch(() => setError('เปิดลิงก์ไม่ได้'));
          }}><Text style={styles.link}>เปิดแหล่งข้อมูล</Text></Pressable>}
        </View>)}
      </View>)}
    </ScrollView>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <TextInput accessibilityLabel="คำถาม" placeholder="พิมพ์คำถาม" value={text} onChangeText={setText}
      multiline maxLength={2000} editable={!busy} style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityLabel="ส่งคำถาม" accessibilityState={{ disabled: busy || !text.trim(), busy }} disabled={busy || !text.trim()} onPress={() => void send()} style={[styles.button, (busy || !text.trim()) && styles.disabled]}>
      {busy ? <ActivityIndicator /> : <Text>ส่งคำถาม</Text>}
    </Pressable>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10 }, heading: { fontSize: 18, fontWeight: '600' },
  history: { flex: 1 }, message: { padding: 12, gap: 8, marginBottom: 12, backgroundColor: '#f2f4f7', borderRadius: 8 },
  input: { borderWidth: 1, borderColor: '#98a2b3', borderRadius: 8, padding: 12, minHeight: 48, maxHeight: 130 },
  button: { padding: 14, backgroundColor: '#dbeafe', alignItems: 'center', borderRadius: 8 },
  link: { color: '#175cd3', paddingVertical: 8 }, error: { color: '#b42318' },
  disabled: { opacity: 0.5 },
});
