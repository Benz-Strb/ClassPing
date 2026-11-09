"use client";
import { useParams } from "next/navigation";
import { TransferWorkspace } from "@/components/transfer-workspace";
export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <TransferWorkspace requestId={id} />;
}
