import isLength from "validator/lib/isLength.js";
import type { UploadConfig } from "@/api/tracks";

export type TrackDraft = { title: string; description: string; genre: string; subgenre: string; bpmFrom: string; bpmTo: string };
export const emptyDraft: TrackDraft = { title: "", description: "", genre: "", subgenre: "", bpmFrom: "", bpmTo: "" };
export function validateDraft(draft: TrackDraft) {
  const errors: Partial<Record<keyof TrackDraft, "lengthTitle" | "lengthDescription" | "lengthGenre" | "bpmInvalid" | "bpmOrder">> = {};
  if (!isLength(draft.title, { min: 3, max: 50 })) errors.title = "lengthTitle";
  if (draft.description && !isLength(draft.description, { min: 3, max: 300 })) errors.description = "lengthDescription";
  for (const key of ["genre", "subgenre"] as const) {
    if (draft[key] && !isLength(draft[key], { min: 3, max: 30 })) errors[key] = "lengthGenre";
  }
  if (draft.bpmFrom.trim() || draft.bpmTo.trim()) {
    for (const key of ["bpmFrom", "bpmTo"] as const) {
      if (!draft[key].trim() || !Number.isFinite(Number(draft[key])) || Number(draft[key]) < 60 || Number(draft[key]) > 200) errors[key] = "bpmInvalid";
    }
    if (!errors.bpmFrom && !errors.bpmTo && Number(draft.bpmFrom) > Number(draft.bpmTo)) errors.bpmTo = "bpmOrder";
  }
  return errors;
}
export function validateUploadFile(file: Pick<File, "name" | "size">, config: UploadConfig) {
  if (file.size === 0) return "fileEmpty";
  if (file.size > config.maxFileBytes) return "fileTooLarge";
  if (!config.formats.some(format => file.name.toLowerCase().endsWith(format.extension))) return "fileUnsupported";
  return undefined;
}
