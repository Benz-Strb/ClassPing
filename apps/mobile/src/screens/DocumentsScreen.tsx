import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Pressable, ScrollView, Text } from "../ui/primitives";
import { colors, typography } from "../ui/theme";
import { LeaveScreen } from "./LeaveScreen";
import { TimetableUpload } from "./TimetableUpload";

export function DocumentsScreen({
  active,
  focusTick,
  onTimetableImported,
}: {
  active: boolean;
  focusTick: number;
  onTimetableImported: () => void;
}) {
  const [section, setSection] = useState<"leave" | "timetable">("leave");
  const [visitedTimetable, setVisitedTimetable] = useState(false);
  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          เอกสาร
        </Text>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {(
            [
              { key: "leave", label: "การลา" },
              { key: "timetable", label: "อัพโหลดตารางเรียน" },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: section === item.key }}
              onPress={() => {
                setSection(item.key);
                if (item.key === "timetable") setVisitedTimetable(true);
              }}
              style={[styles.tab, section === item.key && styles.selected]}
            >
              <Text
                style={section === item.key ? styles.selectedText : undefined}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View
        style={[styles.root, section !== "leave" && styles.hidden]}
        accessibilityElementsHidden={section !== "leave"}
        importantForAccessibility={
          section === "leave" ? "auto" : "no-hide-descendants"
        }
      >
        <LeaveScreen
          active={active && section === "leave"}
          focusTick={focusTick}
        />
      </View>
      {visitedTimetable && (
        <View
          style={[styles.root, section !== "timetable" && styles.hidden]}
          accessibilityElementsHidden={section !== "timetable"}
          importantForAccessibility={section === "timetable" ? "auto" : "no-hide-descendants"}
        >
          <ScrollView contentContainerStyle={styles.timetable}>
            <TimetableUpload onImported={onTimetableImported} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  timetable: { padding: 24, flexGrow: 1, width: "100%", maxWidth: 800, alignSelf: "center" },
  hidden: { display: "none" },
  heading: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 4, gap: 20, width: "100%", maxWidth: 800, alignSelf: "center" },
  title: { ...typography.pageTitle },
  tabs: { flexDirection: "row", gap: 4, backgroundColor: colors.selected, borderRadius: 14, padding: 4 },
  tab: {
    minHeight: 48,
    padding: 12,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  selected: { backgroundColor: colors.surface },
  selectedText: { color: colors.action, fontWeight: "600" },
});
