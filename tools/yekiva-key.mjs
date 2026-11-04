// Formule canonique des clés Yekiva (YKV-....).
//
// Source de vérité : même alphabet, même tirage 12 octets -> 12 chars
// (byte & 31), même checksum pondéré. La validation reste 100 % SERVEUR
// (server/src/apptoken.js) — ce module sert à l'émission OFFLINE
// (tools/make-key.mjs) et aux tests.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateYekivaKey() {
  const random = crypto.getRandomValues(new Uint8Array(12));

  const payload = Array.from(
    random,
    byte => ALPHABET[byte & 31]
  ).join("");

  const checksum = calculateChecksum(payload);

  return `YKV-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${checksum}`;
}

function calculateChecksum(payload) {
  const total = [...payload].reduce(
    (sum, char, index) =>
      sum + (index + 1) * ALPHABET.indexOf(char),
    0
  );

  const value = total % 1024;

  return (
    ALPHABET[(value >> 5) & 31] +
    ALPHABET[value & 31]
  );
}

const YKV_PATTERN = /^YKV-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{2}$/;

function isValidYekivaKey(key) {
  if (!YKV_PATTERN.test(String(key ?? ""))) return false;
  const payload = key.slice(4, 8) + key.slice(9, 13) + key.slice(14, 18);
  return key.slice(19, 21) === calculateChecksum(payload);
}

export { ALPHABET, generateYekivaKey, calculateChecksum, isValidYekivaKey };
