import "server-only";
import { apiRequest, isRecord, type ApiOptions, type ApiResult } from "./client.ts";

export type UploadConfig = {
  maxFileBytes: number;
  formats: { extension: ".mp3" | ".wav"; mimeType: "audio/mpeg" | "audio/wav" }[];
};

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
