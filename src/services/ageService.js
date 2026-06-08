import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

const bandsPath = path.join(config.paths.knowledge, 'ageBands.json');
const bandsData = JSON.parse(readFileSync(bandsPath, 'utf-8'));
const BANDS = bandsData.bands;

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

/**
 * Converts a baby profile (with either `ageDays` or `birthDate`) into a
 * normalized age object: { days, band }.
 */
export function resolveAge(profile) {
  if (!profile) return { days: null, band: null };

  let days = null;
  if (Number.isFinite(profile.ageDays)) {
    days = Math.floor(profile.ageDays);
  } else if (profile.birthDate) {
    const birth = new Date(profile.birthDate);
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date();
      const ms = now.getTime() - birth.getTime();
      days = Math.floor(ms / (1000 * 60 * 60 * 24));
    }
  }

  if (days === null) return { days: null, band: null };
  return { days, band: ageBandForDays(days) };
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
