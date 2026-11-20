import { EnrollmentProgress } from '../ui/EnrollmentProgress';
import { AppIcon } from '../ui/AppIcon';
import { colors, typography, workspace } from '../ui/theme';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView as NativeScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Pressable, Text } from '../ui/primitives';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Circle, Path } from 'react-native-svg';
import { ApiError, apiFetch } from '../lib/api';
import { discardCard, uploadPose, verifyIdentity } from '../lib/face';
import type { FaceStatus, Pose } from '../lib/types';

const POSES: Pose[] = ['front', 'left', 'right', 'up', 'down'];

// ปัญหาที่ภาพบัตร สแกนหน้าใหม่ไม่ช่วย ต้องกลับไปเลือกภาพบัตรใหม่
// FACE_ALREADY_ENROLLED สแกนซ้ำก็ได้ผลเดิม จึงกลับไปหน้าเลือกบัตรที่แสดงข้อความและมีปุ่มออกจากระบบ
const CARD_ERRORS = new Set([
  'CARD_INVALID',
  'CARD_UNREADABLE',
  'CARD_NOT_YOURS',
  'CARD_NOT_TODAY',
  'CARD_NO_FACE',
  'CARD_MULTIPLE_FACES',
  'FACE_ALREADY_ENROLLED',
]);

const HINT: Record<Pose, string> = {
  front: 'มองตรงกล้อง ระบบจะเทียบกับรูปในบัตร',
  left: 'หันหน้าไปทางซ้าย แล้วค้างไว้',
  right: 'หันหน้าไปทางขวา แล้วค้างไว้',
  up: 'เงยหน้าเล็กน้อย แล้วค้างไว้',
  down: 'ก้มหน้าเล็กน้อย แล้วค้างไว้',
};

// มุมกลางของเส้นโค้งแต่ละทิศ (0 = ขวา หมุนตามเข็ม) ภาพกล้องหน้ากลับซ้ายขวาแล้ว ซ้ายของผู้ใช้จึงอยู่ซ้ายจอ
const ARC_AT: Partial<Record<Pose, number>> = { up: -90, right: 0, down: 90, left: 180 };

// ถ่ายแค่ 1280x720 พอ รูปเต็มจากกล้องใหญ่ ถ่ายและส่งช้า ทำให้ข้อความตามท่าไม่ทัน
const PICTURE_SIZE = '1280x720';

const GREY = 'rgba(255,255,255,0.35)';
const BLUE = workspace.cameraActive;
const GREEN = workspace.cameraComplete;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function arcPath(c: number, r: number, from: number, to: number) {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${c + r * Math.cos(rad)} ${c + r * Math.sin(rad)}`;
  };
  return `M ${point(from)} A ${r} ${r} 0 0 1 ${point(to)}`;
}

interface Props {
  done: Pose[];
  // ภาพบัตรที่เลือกไว้ ใช้ตอนสแกนหน้าตรง
  card: string | null;
  onCardRejected: (message: string) => void;
  onComplete: (status: FaceStatus) => void;
  onUnauthorized: (message: string) => void;
  onSignOut: () => void;
}

export function EnrollScreen({
  done: initialDone,
  card,
  onCardRejected,
  onComplete,
  onUnauthorized,
  onSignOut,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const window = useWindowDimensions();
  const [bounds, setBounds] = useState<{ width: number; height: number } | null>(null);
  const { width, height } = bounds ?? window;
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string>();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [done, setDone] = useState(initialDone);
  const doneRef = useRef(initialDone);
  const [message, setMessage] = useState<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const busy = useRef(false);
  const callbacks = useRef({ card, onCardRejected, onComplete, onUnauthorized });
  callbacks.current = { card, onCardRejected, onComplete, onUnauthorized };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  // ถ่ายแล้วส่งตรวจไปเรื่อยๆ ทีละรูป จนครบทุกท่าหรือเจอ error ที่ถ่ายใหม่ไม่ช่วย
  useEffect(() => {
    if (!ready || !foreground || stopped) return;
    let cancelled = false;

    (async () => {
      // รอบเก่าที่ยังรอ API อยู่ต้องจบก่อน จะได้ไม่ส่งซ้อนกัน
      while (busy.current) await wait(100);
      while (!cancelled) {
        const pose = POSES.find((p) => !doneRef.current.includes(p));
        if (!pose || !camera.current) return;
        busy.current = true;
        try {
          const photo = await camera.current.takePictureAsync({ quality: 0.7, shutterSound: false });
          if (cancelled) return;
          const { card: cardUri } = callbacks.current;
          if (pose === 'front' && !cardUri) {
            callbacks.current.onCardRejected('ยืนยันตัวตนด้วยบัตรนักศึกษาก่อน');
            return;
          }
          const status =
            pose === 'front' && cardUri
              ? await verifyIdentity(cardUri, photo)
              : await uploadPose(pose, photo);
          if (pose === 'front') discardCard(cardUri);
          doneRef.current = status.done;
          setDone(status.done);
          setMessage(null);
          if (status.complete) {
            callbacks.current.onComplete(status);
            return;
          }
          // ให้เวลาเปลี่ยนท่า รูปที่ถ่ายเร็วไปจะยังเป็นท่าเดิมแล้วโดนตีกลับ
          await wait(1200);
        } catch (e) {
          if (cancelled) return;
          if (e instanceof ApiError && (CARD_ERRORS.has(e.code) || e.code === 'IDENTITY_REQUIRED')) {
            callbacks.current.onCardRejected(e.message);
            return;
          }
          // ไฟล์ใหญ่เกินตอนส่งบัตร ส่วนใหญ่เป็นที่ภาพบัตร (รูปหน้าย่อแล้ว)
          if (e instanceof ApiError && e.status === 413 && pose === 'front') {
            callbacks.current.onCardRejected('ภาพบัตรใหญ่เกินไป ใช้ภาพหน้าจอบัตรแทนรูปถ่าย');
            return;
          }
          if (e instanceof ApiError && e.status === 422) {
            setMessage(e.message);
            // ตอนส่งบัตรไปด้วย เว้นจังหวะไม่ให้ส่งภาพบัตรซ้ำถี่ ๆ
            if (pose === 'front') await wait(1200);
            continue;
          }
          if (e instanceof ApiError && e.status === 401) {
            callbacks.current.onUnauthorized(e.message);
            return;
          }
          // ลงทะเบียนครบจากเครื่องอื่นไปแล้ว
          if (e instanceof ApiError && e.code === 'ALREADY_ENROLLED') {
            const status = await apiFetch<FaceStatus>('/me/face').catch(() => null);
            if (status) {
              callbacks.current.onComplete(status);
              return;
            }
          }
          setStopped(e instanceof Error ? e.message : 'ส่งรูปไม่สำเร็จ');
          return;
        } finally {
          busy.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, foreground, stopped]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <NativeScrollView style={styles.permissionRoot} contentContainerStyle={styles.center}>
        <EnrollmentProgress current={2} />
        <View style={styles.permissionIcon}><AppIcon name="camera" size={36} /></View>
        <Text accessibilityRole="header" style={styles.permissionTitle}>พร้อมสแกนใบหน้า</Text>
        <Text style={styles.body}>ต้องใช้กล้องหน้าสแกนหน้าเพื่อลงทะเบียนใบหน้า</Text>
        {permission.canAskAgain ? (
          <Pressable style={styles.primary} onPress={requestPermission}>
            <Text style={styles.primaryText}>อนุญาตใช้กล้อง</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primary} onPress={() => Linking.openSettings()}>
            <Text style={styles.primaryText}>เปิดการตั้งค่า</Text>
          </Pressable>
        )}
        <Pressable style={styles.link} onPress={onSignOut}>
          <Text style={styles.linkGrey}>ออกจากระบบ</Text>
        </Pressable>
      </NativeScrollView>
    );
  }

  const pose = POSES.find((p) => !done.includes(p));
  const color = (p: Pose) => (done.includes(p) ? GREEN : p === pose ? BLUE : GREY);

  // วงกลมกลางจอ พื้นรอบๆ ทำจากขอบหนาๆ ของ View ที่โค้งเป็นวงกลม
  const landscape = width > height;
  const hole = Math.max(96, Math.min(width * (landscape ? 0.4 : 0.72), height * (landscape ? 0.6 : 0.38), 320));
  const cx = landscape ? width * 0.28 : width / 2;
  const cy = height * (landscape ? 0.54 : 0.42);
  const edge = Math.max(width, height);
  const ring = hole + 40;
  const r = hole / 2 + 12;

  return (
    <View style={styles.root} onLayout={event => setBounds({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="front"
        pictureSize={pictureSize}
        onCameraReady={async () => {
          const sizes = await camera.current?.getAvailablePictureSizesAsync().catch(() => [] as string[]);
          if (sizes?.includes(PICTURE_SIZE)) setPictureSize(PICTURE_SIZE);
          setReady(true);
        }}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
        <View
          style={{
            position: 'absolute',
            left: cx - hole / 2 - edge,
            top: cy - hole / 2 - edge,
            width: hole + edge * 2,
            height: hole + edge * 2,
            borderRadius: hole / 2 + edge,
            borderWidth: edge,
            borderColor: workspace.cameraScrim,
          }}
        />
        <Svg
          width={ring}
          height={ring}
          style={{ position: 'absolute', left: cx - ring / 2, top: cy - ring / 2 }}
        >
          <Circle cx={ring / 2} cy={ring / 2} r={r} stroke={color('front')} strokeWidth={3} fill="none" />
          {(Object.keys(ARC_AT) as Pose[]).map((p) => (
            <Path
              key={p}
              d={arcPath(ring / 2, r, ARC_AT[p]! - 30, ARC_AT[p]! + 30)}
              stroke={color(p)}
              strokeWidth={8}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>

      <View style={[styles.top, landscape && { left: width * 0.56, right: 24 }]}>
        <Text accessibilityRole="header" style={styles.title}>สแกนใบหน้า</Text>
        <Text style={styles.progressText} accessibilityLiveRegion="polite">สำเร็จ {done.length} / {POSES.length} มุม</Text>
      </View>

      <NativeScrollView style={[styles.bottom, { top: landscape ? 104 : cy + ring / 2 + 16, bottom: 16 }, landscape && { left: width * 0.56 }]} contentContainerStyle={styles.captureActions}>
        <View style={styles.poseSteps} accessible accessibilityLabel={`สแกนสำเร็จ ${done.length} จาก ${POSES.length} มุม`}>
          {POSES.map((p, index) => <View key={p} style={styles.poseStep}>
            <View style={[styles.poseTrack, { backgroundColor: color(p) }]} />
            <View style={styles.poseLabel}>{done.includes(p) && <AppIcon name="check" size={14} color={GREEN} />}<Text style={[styles.poseText, p === pose && styles.activePoseText]}>{['ตรง', 'ซ้าย', 'ขวา', 'เงย', 'ก้ม'][index]}</Text></View>
          </View>)}
        </View>
        <Text style={styles.hint} accessibilityLiveRegion="polite">{pose ? HINT[pose] : 'สแกนครบแล้ว'}</Text>
        {stopped ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>{stopped}</Text>
            <Pressable style={styles.primary} onPress={() => setStopped(null)}>
              <Text style={styles.primaryText}>ลองอีกครั้ง</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.message} accessibilityLiveRegion="polite">{message ?? (ready ? 'กำลังสแกน…' : 'กำลังเปิดกล้อง…')}</Text>
        )}
        {pose === 'front' && card && (
          <Pressable
            style={styles.link}
            onPress={() => onCardRejected('เลือกภาพบัตรใหม่ได้เลย')}
          >
            <Text style={styles.linkLight}>เปลี่ยนภาพบัตร</Text>
          </Pressable>
        )}
        <Pressable style={styles.link} onPress={onSignOut}>
          <Text style={styles.linkLight}>ออกจากระบบ</Text>
        </Pressable>
      </NativeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: workspace.camera },
  clip: { overflow: 'hidden' },
  permissionRoot: { flex: 1, backgroundColor: workspace.background },
  center: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20, backgroundColor: workspace.background },
  permissionTitle: { ...typography.pageTitle },
  permissionIcon: { width: 80, height: 80, backgroundColor: colors.selected, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 16, left: 24, right: 24, alignItems: 'center' },
  title: { color: colors.surface, fontSize: 24, lineHeight: 34, fontWeight: '600', textAlign: 'center' },
  progressText: { color: workspace.cameraActive, fontSize: 14, lineHeight: 24 },
  poseSteps: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  poseStep: { flex: 1, gap: 8 },
  poseTrack: { height: 4, borderRadius: 2 },
  poseLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 2 },
  poseText: { color: colors.onAction, fontSize: 12, lineHeight: 20, textAlign: 'center' },
  activePoseText: { color: workspace.cameraActive, fontWeight: '600' },
  hint: { color: colors.onAction, fontSize: 18, lineHeight: 28, textAlign: 'center', fontWeight: '500' },
  bottom: { position: 'absolute', left: 24, right: 24 },
  captureActions: { alignItems: 'stretch', gap: 12, flexGrow: 1, padding: 16, borderRadius: 16, backgroundColor: workspace.camera },
  message: { color: colors.surface, fontSize: 16, textAlign: 'center' },
  error: { color: '#fca5a5', fontSize: 16, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 24, color: colors.muted },
  primary: { minHeight: 52, justifyContent: 'center', backgroundColor: colors.action, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  primaryText: { color: colors.surface, fontSize: 16 },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 8 },
  linkGrey: { color: colors.muted },
  linkLight: { color: colors.onAction, fontSize: 14, lineHeight: 24 },
});
