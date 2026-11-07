import { formatTime } from "@/lib/time";
import type { TripView } from "@/lib/types";
import { Photo } from "./photo";

// หนึ่งรอบนอกห้อง นาทีปัดลง ยังไม่กลับ: ระหว่างคาบเขียนว่าออกอยู่ หลังจบคาบขอบแดงว่าไม่กลับ
export function TripChip({
  trip,
  ended,
  onClick,
}: {
  trip: TripView;
  ended: boolean;
  onClick: () => void;
}) {
  const open = trip.backAt === null;
  const noReturn = open && ended;
  const text = open
    ? `${formatTime(trip.outAt)}– ${ended ? "ไม่กลับ" : "ออกอยู่"}`
    : `${formatTime(trip.outAt)}–${formatTime(trip.backAt!)} · ${Math.floor(trip.seconds / 60)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border py-0.5 pr-2 pl-0.5 text-xs hover:bg-gray-50 ${
        noReturn ? "border-red-300 text-red-700" : "text-gray-700"
      }`}
    >
      {trip.imageUrl ? (
        <Photo src={trip.imageUrl} size="h-5 w-5" />
      ) : (
        <span className="h-5 w-5 rounded-lg bg-gray-100" />
      )}
      {text}
    </button>
  );
}
