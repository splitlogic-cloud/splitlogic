"use server";

import { revalidatePath } from "next/cache";
import {
  createSplit,
  updateSplit,
  deleteSplit,
} from "./splits.repo";

export async function createSplitAction(formData: FormData) {
  const companyId = String(formData.get("companyId"));
  const workId = String(formData.get("workId"));
  const partyId = String(formData.get("partyId"));
  const sharePercent = Number(formData.get("sharePercent"));

  await createSplit({
    companyId,
    workId,
    partyId,
    sharePercent,
  });

  revalidatePath(`/c/${companyId}/works/${workId}/splits`);
}

export async function updateSplitAction(formData: FormData) {
  const splitId = String(formData.get("splitId"));
  const sharePercent = Number(formData.get("sharePercent"));

  await updateSplit({ splitId, sharePercent });

  revalidatePath("/");
}

export async function deleteSplitAction(formData: FormData) {
  const splitId = String(formData.get("splitId"));

  await deleteSplit(splitId);

  revalidatePath("/");
}