import { useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { SvgXml } from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Pressable, Text } from '../ui/primitives';
import { colors, workspace } from '../ui/theme';
import { buildTimetableGrid, type TimetableEntry } from '../lib/timetable-grid';

export function TimetableGrid({ rows, identity, disabled, inlinePreview = false }: { rows: TimetableEntry[]; identity?: { fullName: string; studentId: string }; disabled?: boolean; inlinePreview?: boolean }) {
  const grid = useMemo(() => buildTimetableGrid(rows, identity), [rows, identity]);
  const svg = useRef<Svg | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [inlineWidth, setInlineWidth] = useState(0);
  const [previewBounds, setPreviewBounds] = useState({ width: 1, height: 1 });
  const insets = useSafeAreaInsets();
  const previewScale = Math.min(previewBounds.width / grid.width, previewBounds.height / grid.height);

  async function download() {
    setExporting(true); setError(null);
    let output: File | null = null;
    let rendered: File | null = null;
    try {
      if (Platform.OS === 'web') {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(grid.xml)}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = grid.width * 2; canvas.height = grid.height * 2;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('สร้างรูปไม่ได้ กรุณาลองใหม่');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const link = document.createElement('a');
        link.download = 'classping-timetable.png'; link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link); link.click(); link.remove();
      } else {
        if (!await Sharing.isAvailableAsync()) throw new Error('อุปกรณ์นี้ยังไม่รองรับการบันทึกหรือแชร์รูป');
        const base64 = await new Promise<string>((resolve, reject) => {
          if (!svg.current) { reject(new Error('ตารางยังไม่พร้อม กรุณาลองใหม่')); return; }
          const timer = setTimeout(() => reject(new Error('สร้างรูปไม่สำเร็จ กรุณาลองใหม่')), 15000);
          svg.current.toDataURL(value => { clearTimeout(timer); resolve(value); });
        });
        output = new File(Paths.cache, `classping-timetable-${Date.now()}.png`);
        output.write(base64, { encoding: 'base64' });
        const image = await ImageManipulator.manipulate(output.uri).resize({ width: grid.width * 2 }).renderAsync();
        const png = await image.saveAsync({ format: SaveFormat.PNG });
        rendered = new File(png.uri);
        await Sharing.shareAsync(rendered.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'บันทึกหรือแชร์ตารางเรียน' });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกรูปไม่สำเร็จ กรุณาลองใหม่'); }
    finally {
      for (const file of [output, rendered]) {
        try { if (file?.exists) file.delete(); } catch { /* best effort */ }
      }
      setExporting(false);
    }
  }

  return <View style={styles.section}>
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>ตารางเรียนรายสัปดาห์</Text>
      <Pressable disabled={disabled || !grid.placements.length} onPress={() => { setError(null); setOpen(true); }} style={styles.download}>
        <Text style={styles.link}>ดูตารางเรียน</Text>
      </Pressable>
    </View>
    {inlinePreview && <Pressable accessibilityLabel="ขยายภาพตารางเรียนรายสัปดาห์" disabled={disabled || !grid.placements.length} onPress={() => { setError(null); setOpen(true); }} style={styles.inlinePreview} onLayout={event => setInlineWidth(event.nativeEvent.layout.width)}>
      {inlineWidth > 0 && <SvgXml xml={grid.xml} width={inlineWidth} height={inlineWidth * grid.height / grid.width} accessible={false} />}
    </Pressable>}
    {grid.omitted > 0 && <Text style={styles.warning}>อีก {grid.omitted} วิชายังวางในตารางไม่ได้ กรุณาตรวจวันและเวลาในการ์ดด้านล่าง</Text>}
    <Modal visible={open} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => { if (!exporting) setOpen(false); }}>
      <View style={[styles.viewer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>ตารางเรียนรายสัปดาห์</Text>
          <Pressable disabled={exporting} accessibilityLabel="ปิดตารางเรียน" style={styles.download} onPress={() => setOpen(false)}><Text style={styles.link}>ปิด</Text></Pressable>
        </View>
        <View style={styles.preview} onLayout={event => setPreviewBounds({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
          <View style={{ width: grid.width * previewScale, height: grid.height * previewScale, overflow: 'hidden', backgroundColor: colors.surface }}>
            <View style={{ position: 'absolute', width: grid.width, height: grid.height, transform: [{ scale: previewScale }], transformOrigin: 'top left' }}>
              <SvgXml xml={grid.xml} override={{ ref: svg, width: grid.width, height: grid.height, accessibilityLabel: 'ตารางเรียนครบทั้งสัปดาห์' }} />
            </View>
          </View>
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable disabled={exporting} style={styles.primary} onPress={() => void download()}><Text style={styles.primaryText}>{exporting ? 'กำลังสร้างรูป…' : 'ดาวน์โหลด PNG'}</Text></Pressable>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  inlinePreview: { width: '100%', minHeight: 120, backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.identity },
  download: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: colors.action, borderRadius: 10 },
  link: { color: colors.action, fontSize: 14, lineHeight: 24, fontWeight: '500' },
  viewer: { flex: 1, paddingHorizontal: 16, gap: 16, backgroundColor: workspace.background },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  primary: { minHeight: 52, padding: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action, borderRadius: 12 },
  primaryText: { color: colors.onAction, fontSize: 16, fontWeight: '600' },
  warning: { color: colors.warning, fontSize: 14, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 24 },
});
