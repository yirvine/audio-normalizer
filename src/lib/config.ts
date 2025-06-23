/**
 * Audio normalization configuration
 * Centralized constants for LUFS and True Peak targets
 */

export const AUDIO_CONFIG = {
  TARGET_LUFS: -7.0,
  TARGET_TP: -0.4,  // True Peak in dBTP
} as const;

// Export individual constants for convenience
export const { TARGET_LUFS, TARGET_TP } = AUDIO_CONFIG; 