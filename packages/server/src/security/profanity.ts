/**
 * Small profanity filter for names and chat. Intentionally conservative: we would rather let
 * a borderline word through than block a real name. Extend the list per language as needed.
 */
const BAD_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'chutiya',
  'madarchod',
  'behenchod',
  'bhenchod',
  'gandu',
  'randi',
  'harami',
  'kamina',
  'lund',
  'bhosdike',
  'bhosdi',
  'chut',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

function isLetter(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 0x0900 && code <= 0x097f); // a-z or Devanagari
}

function normalize(text: string): string {
  let out = '';
  for (const raw of text.toLowerCase()) {
    const c = LEET[raw] ?? raw;
    if (isLetter(c.charCodeAt(0))) out += c;
  }
  return out;
}

// Matches the word with up to two junk characters between letters (e.g. "s.h.i.t").
const patterns = BAD_WORDS.map((w) => new RegExp(w.split('').join('.{0,2}'), 'i'));

export function containsProfanity(text: string): boolean {
  const n = normalize(text);
  return patterns.some((p) => p.test(n));
}

/** Replace bad words with asterisks, keeping the message length. */
export function censor(text: string): string {
  let out = text;
  for (const w of BAD_WORDS) {
    const re = new RegExp(w, 'gi');
    out = out.replace(re, (m) => '*'.repeat(m.length));
  }
  return out;
}

export function sanitizeName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 16);
  return containsProfanity(trimmed) ? 'Player' : trimmed;
}
