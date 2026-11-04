// YKV application keys (prototype distribution).
//
// NOTE (obfuscation): the canonical key formula lives in a private doc OFF-repo.
// This module is its obfuscated mirror: the alphabet is rebuilt from code points
// (no literal copy of the reference string) and the checksum math uses split
// constants. It deters casual reading of the public hackathon repo — it does NOT
// replace real authentication. Validation runs SERVER-SIDE ONLY; the APK never
// contains this logic, only one issued key baked at build time (extractible,
// like any client secret — see tools/build-config.mjs).
//
// Scheme: YKV-PPPP-PPPP-PPPP-CC, 12 random payload chars + 2 checksum chars.
// Server accepts (when APP_TOKEN is set): the exact APP_TOKEN, or any
// well-formed YKV key. When APP_TOKEN is empty: open (dev only, as before).

import { randomBytes } from "node:crypto";

// Rebuilt alphabet: 0-9, A-Z minus I, L, O (32 symbols). No literal reference string.
const _cps = [];
for (let _c = 48; _c <= 57; _c++) _cps.push(_c);
for (let _c = 65; _c <= 90; _c++) {
  if (_c === 73 || _c === 76 || _c === 79) continue;
  _cps.push(_c);
}
const _A = String.fromCharCode(..._cps);
const _S5 = 5; // checksum split: high/low 5 bits of a 10-bit digest
const _M10 = (1 << 10) - 1; // 1023
const _M5 = (1 << _S5) - 1; // 31

function _digest(payload) {
  let _t = 0;
  for (let _i = 0; _i < payload.length; _i++) {
    _t += (_i + 1) * _A.indexOf(payload[_i]);
  }
  const _v = _t & _M10;
  return _A[(_v >> _S5) & _M5] + _A[_v & _M5];
}

/** Mint a fresh YKV key (offline, issuance only). */
export function mintAppKey() {
  const _r = randomBytes(12);
  let _p = "";
  for (const _b of _r) _p += _A[_b & _M5];
  return `YKV-${_p.slice(0, 4)}-${_p.slice(4, 8)}-${_p.slice(8, 12)}-${_digest(_p)}`;
}

const _pat = () => new RegExp(`^YKV-([${_A}]{4}-){2}[${_A}]{4}-[${_A}]{2}$`);

/** True when `token` is a well-formed YKV key with a valid checksum. */
export function isYkvKey(token) {
  const _t = String(token ?? "");
  if (!_pat().test(_t)) return false;
  const _p = _t.slice(4, 8) + _t.slice(9, 13) + _t.slice(14, 18);
  const _c = _t.slice(19, 21);
  if (_p.length !== 12 || _c.length !== 2) return false;
  const _e = _digest(_p);
  return _c[0] === _e[0] && _c[1] === _e[1];
}

/**
 * Gate used by server/src/app.js. `configured` = APP_TOKEN env (may be "").
 * - empty configured -> open (dev only, same as before);
 * - exact match -> legacy single-secret behavior;
 * - otherwise any valid YKV key (prototype multi-key distribution).
 */
export function isValidAppToken(token, configured) {
  if (!configured) return true;
  if (typeof token === "string" && token === configured) return true;
  return isYkvKey(token);
}
