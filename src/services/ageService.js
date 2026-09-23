import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

const bandsPath = path.join(config.paths.knowledge, 'ageBands.json');
const bandsData = JSON.parse(readFileSync(bandsPath, 'utf-8'));
const BANDS = bandsData.bands;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_SUPPORTED_DAYS = 1095;

/**
 * Returns the age band ({id, label, minDays, maxDays}) for a given age in days,
 * or null if the age is outside known ranges.
 */
export function ageBandForDays(days) {
  if (!Number.isFinite(days) || days < 0) return null;
  for (const band of BANDS) {
    if (days >= band.minDays && days <= band.maxDays) return band;
  }
  return null;
}

function coerceFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysSince(year, monthIndex, day) {
  const birth = new Date(year, monthIndex, day);
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getFullYear() !== year || birth.getMonth() !== monthIndex || birth.getDate() !== day) {
    return null;
  }
  return Math.floor((Date.now() - birth.getTime()) / MS_PER_DAY);
}

export function parseBirthDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      iso: `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`,
    };
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const days = daysSince(year, month - 1, day);
    if (days === null) return null;
    return { year, month, day, iso: `${year}-${pad2(month)}-${pad2(day)}`, days };
  }

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const days = daysSince(year, month - 1, day);
    if (days === null) return null;
    return { year, month, day, iso: `${year}-${pad2(month)}-${pad2(day)}`, days };
  }

  const fallback = new Date(s);
  if (Number.isNaN(fallback.getTime())) return null;
  return {
    year: fallback.getFullYear(),
    month: fallback.getMonth() + 1,
    day: fallback.getDate(),
    iso: `${fallback.getFullYear()}-${pad2(fallback.getMonth() + 1)}-${pad2(fallback.getDate())}`,
    days: Math.floor((Date.now() - fallback.getTime()) / MS_PER_DAY),
  };
}

/**
 * Reads an explicit baby age from the mother's text. Conservative on purpose:
 * generic "a cada 3 dias" must not become the official age.
 */
export function extractAgeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;

  const dayPatterns = [
    /(?:bebe|bebê|bb|filho|filha|nenem|neném|nenê)\s+(?:tem|de|com)\s+(\d{1,4})\s*dias?\b/i,
    /(?:tem|com)\s+(\d{1,4})\s*dias?\s*(?:de\s+vida|de\s+idade)?\b/i,
    /(\d{1,4})\s*dias?\s+de\s+(?:vida|idade)\b/i,
    /idade(?:\s+do\s+beb[eê])?\s*(?:é|:)?\s*(\d{1,4})\s*dias?\b/i,
    /^(\d{1,4})\s*dias?\s*[.!?]?\s*$/i,
  ];
  for (const re of dayPatterns) {
    const match = t.match(re);
    if (!match) continue;
    const ageDays = Number(match[1]);
    if (Number.isInteger(ageDays) && ageDays >= 0 && ageDays <= MAX_SUPPORTED_DAYS) {
      return { ageDays, source: 'text_days' };
    }
  }

  const datePatterns = [
    /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/,
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  ];
  for (const re of datePatterns) {
    const match = t.match(re);
    if (!match) continue;
    const parsed = parseBirthDate(match[0]);
    if (!parsed || parsed.days === null || parsed.days < 0 || parsed.days > MAX_SUPPORTED_DAYS) {
      continue;
    }
    return { ageDays: parsed.days, birthDate: parsed.iso, source: 'text_date' };
  }

  const monthPatterns = [
    /(?:bebe|bebê|bb|filho|filha|nenem|neném|nenê)\s+(?:tem|de|com)\s+(\d{1,2})\s*meses?\b/i,
    /(?:tem|com)\s+(\d{1,2})\s*meses?\s*(?:de\s+vida|de\s+idade)?\b/i,
    /(\d{1,2})\s*meses?\s+de\s+(?:vida|idade)\b/i,
    /^(\d{1,2})\s*meses?\s*[.!?]?\s*$/i,
  ];
  for (const re of monthPatterns) {
    const match = t.match(re);
    if (!match) continue;
    const months = Number(match[1]);
    if (Number.isInteger(months) && months >= 0 && months <= 36) {
      return { ageDays: months * 30, source: 'text_months' };
    }
  }

  if (/^\d{1,4}$/.test(t)) {
    const ageDays = Number(t);
    if (ageDays >= 0 && ageDays <= MAX_SUPPORTED_DAYS) {
      return { ageDays, source: 'text_bare_days' };
    }
  }

  return null;
}

/**
 * Converts a baby profile (with either `ageDays` or `birthDate`) into a
 * normalized age object: { days, band }.
 */
export function resolveAge(profile) {
  if (!profile) return { days: null, band: null };

  let days = coerceFiniteNumber(profile.ageDays);
  if (days !== null) {
    days = Math.floor(days);
  } else if (profile.birthDate) {
    const parsed = parseBirthDate(profile.birthDate);
    if (parsed && parsed.days !== null) {
      days = parsed.days;
    }
  }

  if (days === null) return { days: null, band: null };
  return { days, band: ageBandForDays(days) };
}

export function collectUserTexts(message, conversation = []) {
  const texts = [];
  if (message) texts.push(String(message));
  for (const item of [...conversation].reverse()) {
    if (item?.role === 'user' && item.content) {
      texts.push(String(item.content));
    }
  }
  return texts;
}

export function resolveAgeWithFallback(profile, texts = []) {
  const primary = resolveAge(profile);
  if (
    Number.isFinite(primary.days) &&
    primary.days >= 0 &&
    primary.days <= MAX_SUPPORTED_DAYS
  ) {
    return { ...primary, source: 'profile' };
  }

  for (const text of texts) {
    const extracted = extractAgeFromText(text);
    if (!extracted) continue;
    const next = resolveAge({
      ageDays: extracted.ageDays,
      birthDate: extracted.birthDate,
    });
    if (Number.isFinite(next.days) && next.days >= 0) {
      return {
        ...next,
        source: extracted.source,
        birthDate: extracted.birthDate,
      };
    }
  }

  return { days: null, band: null, source: null };
}

export function hydrateBabyProfile(profile, age) {
  const next = profile && typeof profile === 'object' ? { ...profile } : {};
  if (!Number.isFinite(coerceFiniteNumber(next.ageDays)) && Number.isFinite(age?.days) && age.days >= 0) {
    next.ageDays = age.days;
  }
  if (!next.birthDate && age?.birthDate) {
    next.birthDate = age.birthDate;
  }
  return next;
}

/**
 * Pilot scope guard: returns true if the resolved band is in the active set.
 */
export function isNamespaceActive(bandId) {
  if (!bandId) return false;
  return config.activeNamespaces.includes(bandId);
}

export function listBands() {
  return [...BANDS];
}
