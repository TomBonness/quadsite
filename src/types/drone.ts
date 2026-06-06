export type FlightMode = 'ACRO' | 'ANGLE';

export interface PIDCoefficients {
  p: number;
  i: number;
  d: number;
}

export interface PIDSettings {
  roll: PIDCoefficients;
  pitch: PIDCoefficients;
  yaw: PIDCoefficients;
  angleLimit: number; // max angle in degrees for ANGLE mode
  angleP: number; // P gain for ANGLE mode outer loop
}

export interface RateSettings {
  // Betaflight rates
  rcRate: number;
  superRate: number;
  expo: number;
}

export interface AxisMapping {
  axisIndex: number;
  invert: boolean;
  min: number; // calibrated min
  max: number; // calibrated max
  deadband: number;
}

export interface GamepadMapping {
  id: string; // gamepad identifier
  throttle: AxisMapping;
  yaw: AxisMapping;
  pitch: AxisMapping;
  roll: AxisMapping;
  armSwitch?: number; // button index
  modeSwitch?: number; // button index
}

export interface KeyboardMapping {
  // key mappings for WASD/arrows or custom
  throttleUp: string;
  throttleDown: string;
  yawLeft: string;
  yawRight: string;
  pitchForward: string;
  pitchBackward: string;
  rollLeft: string;
  rollRight: string;
  reset: string;
  changeMode: string;
}

export interface PhysicsParameters {
  mass: number;          // kg
  gravity: number;       // m/s^2
  dragLinear: number;    // linear aerodynamic drag coefficient
  dragAngular: number;   // angular drag coefficient
  maxThrust: number;     // Newtons (total max thrust of all motors)
  momentOfInertia: {     // kg * m^2
    x: number; // roll
    y: number; // pitch
    z: number; // yaw
  };
  motorResponseTime: number; // time constant in seconds
}

export interface DronePreset {
  name: string;
  description: string;
  physics: PhysicsParameters;
}

export interface SimulatorSettings {
  cameraUptilt: number;  // degrees
  cameraFov: number;     // degrees
  flightMode: FlightMode;
  rates: {
    roll: RateSettings;
    pitch: RateSettings;
    yaw: RateSettings;
  };
  pid: PIDSettings;
  physics: PhysicsParameters;
  gamepadMapping: GamepadMapping | null;
  keyboardMapping: KeyboardMapping;
}

export interface RawInput {
  throttle: number; // -1 to 1 or 0 to 1
  yaw: number;      // -1 to 1
  pitch: number;    // -1 to 1
  roll: number;     // -1 to 1
  arm: boolean;
  modeSwitch: boolean;
  reset: boolean;
}

export interface ControlInput {
  throttle: number; // 0 to 1
  yawRate: number;  // rad/s target
  pitchRate: number; // rad/s target
  rollRate: number;  // rad/s target
  arm: boolean;
  flightMode: FlightMode;
  reset: boolean;
}

export interface DroneState {
  position: [number, number, number];    // x, y, z in meters
  velocity: [number, number, number];    // vx, vy, vz in m/s
  quaternion: [number, number, number, number]; // x, y, z, w (Three.js format or [x,y,z,w])
  angularVelocity: [number, number, number]; // roll, pitch, yaw rates in rad/s (body frame)
  motorSpeeds: [number, number, number, number]; // 0 to 1 representation for visual effects
  batteryVoltage: number; // simulated voltage in Volts (e.g. 24V down to 21V)
  batteryTimer: number;   // elapsed time in seconds
  rxRssi: number;         // 0 to 100 signal strength
  armed: boolean;
  flightMode: FlightMode;
  lastPassGateId: string | null;
  passedGatesCount: number;
  currentLapTime: number;
  bestLapTime: number | null;
}

export interface Gate {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles (x, y, z) in radians
  width: number;
  height: number;
  radius?: number; // if circular
}

export const TRACK_GATES: Gate[] = [
  { id: 'gate-1', position: [0, 1.5, -20], rotation: [0, 0, 0], width: 4, height: 4 },
  { id: 'gate-2', position: [15, 2.0, -35], rotation: [0, Math.PI / 4, 0], width: 4, height: 4 },
  { id: 'gate-3', position: [35, 2.5, -30], rotation: [0, Math.PI / 2, 0], width: 4, height: 4 },
  { id: 'gate-4', position: [40, 3.0, -5], rotation: [0, Math.PI * 0.75, 0], width: 4, height: 4 },
  { id: 'gate-5', position: [25, 2.5, 20], rotation: [0, Math.PI, 0], width: 4, height: 4 },
  { id: 'gate-6', position: [0, 2.0, 25], rotation: [0, Math.PI, 0], width: 4, height: 4 },
  { id: 'gate-7', position: [-25, 2.5, 15], rotation: [0, -Math.PI * 0.75, 0], width: 4, height: 4 },
  { id: 'gate-8', position: [-35, 2.0, -10], rotation: [0, -Math.PI / 2, 0], width: 4, height: 4 },
  { id: 'gate-9', position: [-20, 1.5, -30], rotation: [0, -Math.PI / 4, 0], width: 4, height: 4 }
];
