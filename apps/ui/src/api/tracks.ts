import "server-only";
import { apiRequest, isRecord, type ApiOptions, type ApiResult } from "./client.ts";

export type UploadConfig = {
  maxFileBytes: number;
  formats: { extension: ".mp3" | ".wav"; mimeType: "audio/mpeg" | "audio/wav" }[];
};

export type Track = {
  id: number; ownerId: number | null; hasAudio: boolean;
  title: string; description: string | null; releaseDate: string;
  bpm: { bpmFrom: number; bpmTo: number };
};

export function parseTrack(value: unknown): Track | undefined {
  const positiveInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  if (!isRecord(value) || !positiveInt(value.id) ||
      !(value.ownerId === null || positiveInt(value.ownerId)) || typeof value.hasAudio !== "boolean" ||
      typeof value.title !== "string" || !(value.description === null || typeof value.description === "string") ||
      typeof value.releaseDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.releaseDate) ||
      !Number.isFinite(Date.parse(value.releaseDate)) || new Date(value.releaseDate).toISOString().slice(0, 10) !== value.releaseDate ||
      !isRecord(value.bpm) || !positiveInt(value.bpm.bpmFrom) || !positiveInt(value.bpm.bpmTo) ||
      value.bpm.bpmFrom > value.bpm.bpmTo) return undefined;
  return { id: value.id, ownerId: value.ownerId, hasAudio: value.hasAudio,
    title: value.title, description: value.description, releaseDate: value.releaseDate,
    bpm: { bpmFrom: value.bpm.bpmFrom, bpmTo: value.bpm.bpmTo } };
}

export function getTracks(accessToken: string | undefined, options?: ApiOptions): Promise<ApiResult<Track[]>> {
  if (!accessToken) return Promise.resolve({ ok: false, status: 401,
    error: { kind: "http", status: 401, body: { code: "AUTH_REQUIRED" } } });
  return apiRequest("/tracks", { method: "GET", expectedStatus: 200, accessToken,
    parse(value) {
      if (!Array.isArray(value)) return undefined;
      const tracks = value.map(parseTrack);
      return tracks.some(track => track === undefined) ? undefined : tracks as Track[];
    },
  }, options);
}

function parseUploadConfig(value: unknown): UploadConfig | undefined {
  if (
    !isRecord(value) || typeof value.maxFileBytes !== "number" ||
    !Number.isSafeInteger(value.maxFileBytes) ||
    value.maxFileBytes <= 0 || value.maxFileBytes > 2_147_483_647 ||
    !Array.isArray(value.formats) || value.formats.length === 0 || value.formats.length > 2
  ) return undefined;
  const formats: UploadConfig["formats"] = [];
  for (const format of value.formats) {
    if (!isRecord(format) || !(
      (format.extension === ".mp3" && format.mimeType === "audio/mpeg") ||
      (format.extension === ".wav" && format.mimeType === "audio/wav")
    ) || formats.some(({ extension }) => extension === format.extension)) return undefined;
    formats.push({ extension: format.extension, mimeType: format.mimeType });
  }
  return { maxFileBytes: value.maxFileBytes, formats };
}

export function getUploadConfig(
  accessToken: string | undefined,
  options?: ApiOptions,
): Promise<ApiResult<UploadConfig>> {
  if (!accessToken) return Promise.resolve({
    ok: false, status: 401,
    error: { kind: "http", status: 401, body: { code: "AUTH_REQUIRED" } },
  });
  return apiRequest("/tracks/upload-config", {
    method: "GET", expectedStatus: 200, accessToken, parse: parseUploadConfig,
  }, options);
}
