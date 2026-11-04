import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMmsApiKey } from "../src/mms-config.js";

test("MMS key resolver prefers a server process secret without requiring project .env", () => {
  assert.equal(resolveMmsApiKey({ env: { TTS_API_KEY: "secret-from-process" }, filePath: "/missing" }), "secret-from-process");
});

test("MMS key resolver reads existing TTS_API_KEY from /etc-style env file", () => {
  const dir = mkdtempSync(join(tmpdir(), "yekiva-mms-key-test-"));
  const file = join(dir, "tts-api.env");
  try {
    writeFileSync(file, "# private test key\nTTS_API_KEY='test-only-secret'\n");
    assert.equal(resolveMmsApiKey({ env: {}, filePath: file }), "test-only-secret");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MMS key resolver ignores comments and ambiguous unknown key names", () => {
  const dir = mkdtempSync(join(tmpdir(), "yekiva-mms-key-test-"));
  const file = join(dir, "tts-api.env");
  try {
    writeFileSync(file, "# API_KEY=comment\nFIRST_API_KEY=one\nSECOND_TTS_KEY=two\n");
    assert.equal(resolveMmsApiKey({ env: {}, filePath: file }), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
