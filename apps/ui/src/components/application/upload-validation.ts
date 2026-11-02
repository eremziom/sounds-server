import isISO8601 from "validator/lib/isISO8601.js";
import isLength from "validator/lib/isLength.js";
import type { UploadConfig } from "@/api/tracks";

export type TrackDraft = { title: string; description: string; releaseDate: string; bpmFrom: string; bpmTo: string };
export const emptyDraft: TrackDraft = { title: "", description: "", releaseDate: "", bpmFrom: "", bpmTo: "" };
export function validateDraft(draft: TrackDraft) {
  const errors: Partial<Record<keyof TrackDraft, "lengthTitle" | "lengthDescription" | "dateInvalid" | "bpmInvalid" | "bpmOrder">> = {};
  if (!isLength(draft.title, { min: 3, max: 50 })) errors.title = "lengthTitle";
  if (!isLength(draft.description, { min: 3, max: 300 })) errors.description = "lengthDescription";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.releaseDate) || !isISO8601(draft.releaseDate, { strict: true })) errors.releaseDate = "dateInvalid";
  for (const key of ["bpmFrom", "bpmTo"] as const) {
    if (!draft[key].trim() || !Number.isFinite(Number(draft[key])) || Number(draft[key]) < 60 || Number(draft[key]) > 200) errors[key] = "bpmInvalid";
  }
  if (!errors.bpmFrom && !errors.bpmTo && Number(draft.bpmFrom) > Number(draft.bpmTo)) errors.bpmTo = "bpmOrder";
  return errors;
}
export function validateUploadFile(file: Pick<File, "name" | "size">, config: UploadConfig) {
  if (file.size === 0) return "fileEmpty";
  if (file.size > config.maxFileBytes) return "fileTooLarge";
  if (!config.formats.some(format => file.name.toLowerCase().endsWith(format.extension))) return "fileUnsupported";
  return undefined;
}
