import type { RawInput, GamepadMapping, KeyboardMapping, SimulatorSettings } from '../types/drone';

// Global keyboard state tracker
const keysPressed: Record<string, boolean> = {};
let keyboardArmed = false;
export function setKeyboardArmed(armed: boolean) {
  keyboardArmed = armed;
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const code = e.code.toLowerCase();
    // Toggle arm state on spacebar press (edge-triggered)
    if ((key === ' ' || code === 'space') && !e.repeat) {
      keyboardArmed = !keyboardArmed;
    }
    keysPressed[key] = true;
    keysPressed[code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
    keysPressed[e.code.toLowerCase()] = false;
  });
}

// Keep track of keyboard throttle level
let keyboardThrottle = 0.1; // start slightly above zero

/**
 * Gets keyboard raw input state.
 * @param mapping Current keyboard mapping.
 * @param dt Delta time in seconds for updating continuous state (like throttle).
 */
export function getKeyboardInput(mapping: KeyboardMapping, dt: number): RawInput {
  // Throttle manipulation
  if (keysPressed[mapping.throttleUp.toLowerCase()]) {
    keyboardThrottle = Math.min(1.0, keyboardThrottle + 1.2 * dt);
  } else if (keysPressed[mapping.throttleDown.toLowerCase()]) {
    keyboardThrottle = Math.max(0.0, keyboardThrottle - 1.2 * dt);
  }

  // Roll
  let roll = 0;
  if (keysPressed[mapping.rollLeft.toLowerCase()]) roll -= 1.0;
  if (keysPressed[mapping.rollRight.toLowerCase()]) roll += 1.0;

  // Pitch
  let pitch = 0;
  if (keysPressed[mapping.pitchForward.toLowerCase()]) pitch += 1.0; // W / UpArrow = pitch forward (positive deflection)
  if (keysPressed[mapping.pitchBackward.toLowerCase()]) pitch -= 1.0;

  // Yaw
  let yaw = 0;
  if (keysPressed[mapping.yawLeft.toLowerCase()]) yaw -= 1.0;
  if (keysPressed[mapping.yawRight.toLowerCase()]) yaw += 1.0;

  // Armed switch (space)
  if (keysPressed[mapping.reset.toLowerCase()]) {
    keyboardArmed = false;
  }
  const arm = keyboardArmed;

  // Mode switch (m)
  const modeSwitch = keysPressed[mapping.changeMode.toLowerCase()];

  // Reset (r)
  const reset = keysPressed[mapping.reset.toLowerCase()];

  return {
    throttle: keyboardThrottle,
    yaw,
    pitch,
    roll,
    arm: arm || false,
    modeSwitch: modeSwitch || false,
    reset: reset || false
  };
}

/**
 * Processes a raw gamepad axis value using calibration mappings.
 */
export function processAxis(value: number, mapping: { min: number; max: number; invert: boolean; deadband: number }, isThrottle = false): number {
  // Clamp input value to calibrated min/max
  const min = Math.min(mapping.min, mapping.max);
  const max = Math.max(mapping.min, mapping.max);
  const clamped = Math.max(min, Math.min(max, value));
  
  let result: number;
  if (isThrottle) {
    // Map [min, max] to [0, 1]
    const range = max - min;
    result = range > 0.01 ? (clamped - min) / range : 0;
    if (mapping.invert) {
      result = 1.0 - result;
    }
  } else {
    // Map [min, max] to [-1, 1] with asymmetric center handling
    const center = (min + max) / 2;
    if (clamped > center) {
      const denom = max - center;
      result = denom > 0.01 ? (clamped - center) / denom : 0;
    } else {
      const denom = center - min;
      result = denom > 0.01 ? (clamped - center) / denom : 0;
    }
    if (mapping.invert) {
      result = -result;
    }
    
    // Apply deadband
    const absVal = Math.abs(result);
    if (absVal < mapping.deadband) {
      result = 0;
    } else {
      result = Math.sign(result) * ((absVal - mapping.deadband) / (1.0 - mapping.deadband));
    }
  }

  return result;
}

/**
 * Polls the Gamepad API and maps standard stick axes.
 */
export function getGamepadInput(mapping: GamepadMapping): RawInput | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return null;
  }

  const gamepads = navigator.getGamepads();
  // Find the matching gamepad by id prefix
  let targetGamepad: Gamepad | null = null;
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (gp && gp.id.includes(mapping.id)) {
      targetGamepad = gp;
      break;
    }
  }

  // Fallback to first available gamepad if target not found
  if (!targetGamepad) {
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        targetGamepad = gamepads[i];
        break;
      }
    }
  }

  if (!targetGamepad) {
    return null;
  }

  const axes = targetGamepad.axes;
  const buttons = targetGamepad.buttons;

  const throttle = axes.length > mapping.throttle.axisIndex ? axes[mapping.throttle.axisIndex] : 0;
  const yaw = axes.length > mapping.yaw.axisIndex ? axes[mapping.yaw.axisIndex] : 0;
  const pitch = axes.length > mapping.pitch.axisIndex ? axes[mapping.pitch.axisIndex] : 0;
  const roll = axes.length > mapping.roll.axisIndex ? axes[mapping.roll.axisIndex] : 0;

  // Process axes with calibration
  const procThrottle = processAxis(throttle, mapping.throttle, true);
  const procYaw = processAxis(yaw, mapping.yaw, false);
  const procPitch = processAxis(pitch, mapping.pitch, false);
  const procRoll = processAxis(roll, mapping.roll, false);

  // Check switches
  let arm = false;
  if (mapping.armSwitch !== undefined && buttons.length > mapping.armSwitch) {
    // Treat buttons with value > 0.5 as pressed/true
    arm = buttons[mapping.armSwitch].pressed || buttons[mapping.armSwitch].value > 0.5;
  }

  let modeSwitch = false;
  if (mapping.modeSwitch !== undefined && buttons.length > mapping.modeSwitch) {
    modeSwitch = buttons[mapping.modeSwitch].pressed || buttons[mapping.modeSwitch].value > 0.5;
  }

  return {
    throttle: procThrottle,
    yaw: procYaw,
    pitch: procPitch,
    roll: procRoll,
    arm,
    modeSwitch,
    reset: false // Reset usually bound to keyboard or UI button
  };
}

/**
 * Gets unified raw input (gamepad with keyboard fallback).
 */
export function getUnifiedInput(settings: SimulatorSettings, dt: number): RawInput {
  let input: RawInput | null = null;
  
  if (settings.gamepadMapping) {
    input = getGamepadInput(settings.gamepadMapping);
  }
  
  if (!input) {
    input = getKeyboardInput(settings.keyboardMapping, dt);
  }
  
  return input;
}

/**
 * Helper to reset keyboard throttle (e.g. on crash reset)
 */
export function resetKeyboardThrottle(val = 0.1) {
  keyboardThrottle = val;
}
