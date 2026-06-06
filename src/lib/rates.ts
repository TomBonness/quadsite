import type { RateSettings } from '../types/drone';

/**
 * Calculates the output rate in degrees per second for a given input deflection (-1 to 1)
 * using the classic Betaflight rates formula.
 */
export function calculateBetaflightRate(input: number, settings: RateSettings): number {
  const absInput = Math.abs(input);
  
  // 1. Apply RC Expo
  // Betaflight Expo formula: input * (input^3 * expo + input * (1 - expo))
  // Wait, let's keep it signed:
  const inputExpo = input * (Math.pow(absInput, 3) * settings.expo + absInput * (1 - settings.expo));
  
  // 2. Apply RC Rate and Super Rate
  // Max rate (deg/s) = (rcRate * 200) / (1 - superRate) at full deflection.
  const rcRateFactor = settings.rcRate * 200;
  
  let rate = inputExpo * rcRateFactor;
  
  if (settings.superRate > 0) {
    const absInputExpo = Math.abs(inputExpo);
    // Clamp superRate slightly below 1.0 to prevent division by zero at full deflection
    const superRateClamp = Math.min(settings.superRate, 0.99);
    const denom = 1.0 - absInputExpo * superRateClamp;
    rate = rate / Math.max(denom, 0.01);
  }
  
  return rate;
}

/**
 * Converts rate in degrees per second to radians per second.
 */
export function degSecToRadSec(degSec: number): number {
  return (degSec * Math.PI) / 180;
}

/**
 * Generates an array of data points for plotting the rate curve.
 * Returns an array of objects with input and rate (deg/s) properties.
 */
export function generateRateCurvePoints(settings: RateSettings, steps = 40): { input: number; rate: number }[] {
  const points: { input: number; rate: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const input = (i / steps) * 2 - 1; // scale from -1 to 1
    const rate = calculateBetaflightRate(input, settings);
    points.push({ input: Math.round(input * 100) / 100, rate: Math.round(rate) });
  }
  return points;
}

/**
 * Calculates the maximum rate (deg/s) at full deflection (input = 1.0)
 */
export function calculateMaxRate(settings: RateSettings): number {
  return calculateBetaflightRate(1.0, settings);
}
