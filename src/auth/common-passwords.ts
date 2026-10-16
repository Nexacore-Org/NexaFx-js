/**
 * Passwords that appear in breach corpuses, kept in the stored form checked by
 * {@link isCommonPassword} (lower-case, no trailing digits/symbols). The list
 * is intentionally data, so a larger breached-password list can replace it
 * without touching the checking logic.
 */
const COMMON_PASSWORD_BASES = `
password passw0rd p4ssword pa55word pa55w0rd passphrase passwords
letmein letmein1 welcome welcome1 welcomehome admin administrator adminadmin root toor
qwerty qwertyuiop qwertyui qwerty123 qwertyuiopasdfghjkl asdfgh asdfghjkl asdfghjk zxcvbnm zxcvbn
iloveyou iloveyou1 ilovemyself monkey dragon master superman batman spiderman
football baseball basketball soccer hockey liverpool manchester arsenal chelsea barcelona realmadrid
sunshine princess shadow michael jennifer jessica ashley daniel thomas jordan hunter
trustno trustno1 whatever freedom starwars pokemon naruto minecraft fortnite
changeme changeit default guest user test testing tester testtest temp temporary secret secretpassword
abc abcd abcde abcdef abcdefg abcdefgh abc123 abcabc abcdefghijkl
login logmein access mustang harley ranger cheese killer pepper cookie
internet computer samsung google facebook twitter instagram snapchat whatsapp linkedin
nexafx nexa nexafxpassword stellar stellarlumens lumens bitcoin ethereum crypto cryptocurrency blockchain
1q2w3e 1q2w3e4r 1qaz2wsx 1qazxsw2 qazwsx qazwsxedc zaq12wsx q1w2e3r4 1234qwer qwer1234
iloveu loveyou lovelove loveme forever 2020 2021 2022 2023 2024 2025 2026
baseball1 football1 monkey1 dragon1 master1 sunshine1 princess1 charlie donald
aaaaaa zzzzzz mypassword mypass mypassw0rd thepassword yourpassword newpassword oldpassword
`.split(/\s+/).filter(Boolean);

/** Sequences that make a password guessable regardless of what surrounds them. */
const BAD_FRAGMENTS = [
  'password', 'passw0rd', 'qwerty', 'asdfgh', 'zxcvbn', 'letmein', 'welcome',
  '123456', '654321', '1234567', '0123456', 'abcdef', 'iloveyou', 'admin',
  '111111', '000000', '121212', '112233',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

const COMMON_SET = new Set(COMMON_PASSWORD_BASES);

function normalize(password: string): { plain: string; leet: string } {
  const lower = password.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+$/g, '').replace(/[0-9!@#$%^&*._-]+$/g, '');
  const leet = stripped.replace(/[013457@$!]/g, (c) => LEET[c] ?? c);
  return { plain: stripped, leet };
}

/**
 * True when the password is, or is built on, a known-breached/guessable
 * password. Compared case-insensitively, ignoring trailing digits/symbols
 * ("Password123!x" -> "password") and common leetspeak ("P@ssw0rd" -> "password").
 */
export function isCommonPassword(password: string): boolean {
  const { plain, leet } = normalize(password);
  if (COMMON_SET.has(plain) || COMMON_SET.has(leet)) return true;
  const letters = password.toLowerCase();
  if (BAD_FRAGMENTS.some((fragment) => letters.includes(fragment) || leet.includes(fragment))) return true;
  // One character repeated (aaaaaaaaaaaa) or a short unit repeated (abababababab).
  return /^(.{1,3})\1{3,}$/.test(letters);
}
