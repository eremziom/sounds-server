import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDraft, validateUploadFile } from "../src/components/application/upload-validation.ts";
import { registerNavigationBlocker, confirmNavigation, hasNavigationBlocker } from "../src/lib/unsaved-navigation.ts";
import { translateApiError } from "../src/i18n/api-errors.ts";

const valid = { title: "Track", description: "Description", genre: "", subgenre: "", bpmFrom: "60", bpmTo: "200" };
test("upload metadata validates optional description and genres, numeric BPM and range order", () => {
  assert.deepEqual(validateDraft(valid), {});
  assert.deepEqual(validateDraft({ ...valid, bpmFrom: "", bpmTo: "" }), {});
  assert.deepEqual(validateDraft({ ...valid, description: "", genre: "", subgenre: "" }), {});
  for (const key of ["genre", "subgenre"]) {
    assert.deepEqual(validateDraft({ ...valid, [key]: "abc" }), {});
    assert.deepEqual(validateDraft({ ...valid, [key]: "x".repeat(30) }), {});
    assert.equal(validateDraft({ ...valid, [key]: "ab" })[key], "lengthGenre");
    assert.equal(validateDraft({ ...valid, [key]: "x".repeat(31) })[key], "lengthGenre");
  }
  assert.equal(validateDraft({ ...valid, bpmFrom: "90", bpmTo: "" }).bpmTo, "bpmInvalid");
  assert.equal(validateDraft({ ...valid, bpmFrom: "" }).bpmFrom, "bpmInvalid");
  assert.equal(validateDraft({ ...valid, bpmTo: "201" }).bpmTo, "bpmInvalid");
  assert.equal(validateDraft({ ...valid, bpmFrom: "120", bpmTo: "100" }).bpmTo, "bpmOrder");
  assert.deepEqual(validateDraft({ ...valid, title: "😀".repeat(50), bpmFrom: "60.5" }), {});
  assert.equal(validateDraft({ ...valid, title: "x".repeat(51) }).title, "lengthTitle");
  assert.equal(validateDraft({ ...valid, description: "ab" }).description, "lengthDescription");
});
test("file validation follows actual server format and byte limits independently of browser MIME", () => {
  const config = { maxFileBytes: 20, formats: [{ extension: ".wav", mimeType: "audio/wav" }] };
  assert.equal(validateUploadFile({ name: "sample.WAV", size: 20 }, config), undefined);
  assert.equal(validateUploadFile({ name: "sample.mp3", size: 20 }, config), "fileUnsupported");
  assert.equal(validateUploadFile({ name: "sample.wav", size: 21 }, config), "fileTooLarge");
  assert.equal(validateUploadFile({ name: "sample.wav", size: 0 }, config), "fileEmpty");
});
test("navigation delegates to the dirty editor and removes only its own registration", async () => {
  let dirty = true;
  const unregister = registerNavigationBlocker(async () => false, () => dirty);
  assert.equal(hasNavigationBlocker(), true);
  assert.equal(await confirmNavigation(), false);
  dirty = false;
  assert.equal(await confirmNavigation(), true);
  const unregisterNew = registerNavigationBlocker(async () => false);
  unregister();
  assert.equal(await confirmNavigation(), false);
  unregisterNew();
  assert.equal(await confirmNavigation(), true);
});
test("audio errors and metadata field errors use allowlisted translations, never backend text", () => {
  for (const [code, status, key] of [
    ["AUDIO_FILE_INVALID", 400, "audioFileInvalid"], ["AUDIO_FILE_TOO_LARGE", 413, "audioFileTooLarge"],
    ["AUDIO_FORMAT_UNSUPPORTED", 415, "audioFormatUnsupported"], ["AUDIO_STORAGE_FAILED", 503, "audioStorageFailed"],
    ["AUDIO_VALIDATION_UNAVAILABLE", 503, "audioValidationUnavailable"],
  ]) {
    assert.equal(translateApiError({ kind: "http", status, body: { code, message: "secret" } }, "track", k => k).message, `errors.${key}`);
    assert.equal(translateApiError({ kind: "http", status: 418, body: { code } }, "track", k => k).message, "errors.unexpected");
  }
  const result = translateApiError({ kind: "http", status: 400, body: { code: "VALIDATION_FAILED", fieldErrors: [
    { field: "title", code: "LENGTH", params: { min: 3, max: 50 } }, { field: "bpm.bpmTo", code: "MAX" }, { field: "private", code: "REQUIRED" },
  ] } }, "track", k => k);
  assert.deepEqual(result.fieldErrors, { title: ["validation.length"], "bpm.bpmTo": ["validation.invalid"] });
});
