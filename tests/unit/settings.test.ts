import { describe, expect, it } from 'vitest';
import { isContentCommand, isRuntimeRequest } from '../../src/shared/messages';
import { DEFAULT_SETTINGS, normaliseSettings } from '../../src/shared/settings';

describe('normaliseSettings', () => {
  it('returns defaults for missing or malformed input', () => {
    expect(normaliseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings('junk')).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings({ autoDetect: 'yes', indicatorPosition: 'middle' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    expect(normaliseSettings({ autoDetect: false, indicatorPosition: 'top-left' })).toEqual({
      autoDetect: false,
      indicatorPosition: 'top-left',
    });
  });
});

describe('message guards', () => {
  it('recognise only well-formed messages', () => {
    expect(isRuntimeRequest({ type: 'tab-entry:get' })).toBe(true);
    expect(isRuntimeRequest({ type: 'other' })).toBe(false);
    expect(isRuntimeRequest(null)).toBe(false);
    expect(isContentCommand({ type: 'command:activate' })).toBe(true);
    expect(isContentCommand({ type: 'tab-entry:get' })).toBe(false);
  });
});
