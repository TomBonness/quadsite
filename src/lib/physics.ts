import { Vector3, Quaternion, Euler } from 'three';
import type { DroneState, RawInput, SimulatorSettings, Gate, PIDCoefficients } from '../types/drone';
import { calculateBetaflightRate, degSecToRadSec } from './rates';

// Physics Presets
export const PHYSICS_PRESETS = [
  {
    name: '5" Freestyle',
    description: 'Standard 5-inch miniquad. Snappy, powerful, and holds momentum. Perfect for acrobatics.',
    physics: {
      mass: 0.65, // 650g
      gravity: 9.81,
      dragLinear: 0.15,
      dragAngular: 0.08,
      maxThrust: 35.0, // 35 Newtons
      momentOfInertia: { x: 0.005, y: 0.005, z: 0.008 },
      motorResponseTime: 0.03 // 30ms
    }
  },
  {
    name: 'Tiny Whoop 75mm',
    description: 'Ultralight 75mm micro quad. Low inertia, high drag, very safe and nimble indoors.',
    physics: {
      mass: 0.045, // 45g
      gravity: 9.81,
      dragLinear: 0.25,
      dragAngular: 0.12,
      maxThrust: 2.2, // 2.2 Newtons
      momentOfInertia: { x: 0.0004, y: 0.0004, z: 0.0006 },
      motorResponseTime: 0.015 // 15ms
    }
  },
  {
    name: '7" Cinematic',
    description: 'Heavy 7-inch long-range quad. Slow response, massive momentum, stable in wind.',
    physics: {
      mass: 1.2, // 1.2kg
      gravity: 9.81,
      dragLinear: 0.22,
      dragAngular: 0.15,
      maxThrust: 52.0, // 52 Newtons
      momentOfInertia: { x: 0.015, y: 0.015, z: 0.024 },
      motorResponseTime: 0.05 // 50ms
    }
  }
];

// Helper to check if a value is near zero
const EPSILON = 0.0001;

// Internal PID State (persisted across steps in the simulator loop)
export class PIDController {
  private integral = { x: 0, y: 0, z: 0 };
  private prevGyro = { x: 0, y: 0, z: 0 };

  reset() {
    this.integral = { x: 0, y: 0, z: 0 };
    this.prevGyro = { x: 0, y: 0, z: 0 };
  }

  update(
    error: Vector3,
    gyro: Vector3,
    pidSettings: { roll: PIDCoefficients; pitch: PIDCoefficients; yaw: PIDCoefficients },
    dt: number
  ): Vector3 {
    const outputs = new Vector3();

    // Roll (X)
    const errX = error.x;
    this.integral.x = Math.max(-1.0, Math.min(1.0, this.integral.x + errX * pidSettings.roll.i * dt));
    // D-term on gyro to avoid D-kick
    const dX = dt > EPSILON ? -(gyro.x - this.prevGyro.x) * pidSettings.roll.d / dt : 0;
    outputs.x = errX * pidSettings.roll.p + this.integral.x + dX;

    // Pitch (Y) - note: standard Pitch maps to Y axis or X depending on convention, let's map Pitch to local X or Y.
    // In our convention: Roll is X, Pitch is Y (actually local pitch is pitch-rate around local X, roll-rate around local Z. Let's map roll -> local Z, pitch -> local X, yaw -> local Y).
    // Let's check:
    // In standard aerodynamics:
    // Roll = rotation around local X (forward)
    // Pitch = rotation around local Z (right)
    // Yaw = rotation around local Y (up)
    // In Three.js:
    // Forward is -Z, Right is X, Up is Y.
    // Therefore:
    // Roll rate = rotation around Z axis (local)
    // Pitch rate = rotation around X axis (local)
    // Yaw rate = rotation around Y axis (local)
    // Let's use this standard Three.js convention:
    // - roll -> around local Z
    // - pitch -> around local X
    // - yaw -> around local Y
    const errY = error.y; // Pitch
    this.integral.y = Math.max(-1.0, Math.min(1.0, this.integral.y + errY * pidSettings.pitch.i * dt));
    const dY = dt > EPSILON ? -(gyro.y - this.prevGyro.y) * pidSettings.pitch.d / dt : 0;
    outputs.y = errY * pidSettings.pitch.p + this.integral.y + dY;

    // Yaw (Z)
    const errZ = error.z; // Yaw
    this.integral.z = Math.max(-1.0, Math.min(1.0, this.integral.z + errZ * pidSettings.yaw.i * dt));
    const dZ = dt > EPSILON ? -(gyro.z - this.prevGyro.z) * pidSettings.yaw.d / dt : 0;
    outputs.z = errZ * pidSettings.yaw.p + this.integral.z + dZ;

    // Save history
    this.prevGyro = { x: gyro.x, y: gyro.y, z: gyro.z };

    return outputs;
  }
}

/**
 * Executes a single physics step at a fixed dt (e.g. 0.002s = 500Hz).
 */
export function stepPhysics(
  state: DroneState,
  rawInput: RawInput,
  settings: SimulatorSettings,
  pidController: PIDController,
  dt: number,
  gates: Gate[]
): { nextState: DroneState; crashed: boolean; passedGateId: string | null } {
  // If not armed, motor speeds are 0, no torque/thrust
  if (!rawInput.arm) {
    const gravityForce = new Vector3(0, -settings.physics.gravity, 0);
    const vel = new Vector3(...state.velocity);
    
    // Apply gravity and drag
    const dragForce = vel.clone().multiplyScalar(-vel.length() * settings.physics.dragLinear);
    const accel = gravityForce.add(dragForce.divideScalar(settings.physics.mass));
    
    vel.addScaledVector(accel, dt);
    const pos = new Vector3(...state.position).addScaledVector(vel, dt);
    
    // Collision with ground
    let crashed = false;
    let nextVel = vel.toArray() as [number, number, number];
    const nextPos = pos.toArray() as [number, number, number];
    
    if (pos.y <= 0.15) {
      if (Math.abs(vel.y) > 3.0) {
        crashed = true;
      }
      nextPos[1] = 0.15;
      nextVel = [0, 0, 0];
    }

    pidController.reset();

    return {
      nextState: {
        ...state,
        position: nextPos,
        velocity: nextVel,
        angularVelocity: [0, 0, 0],
        motorSpeeds: [0, 0, 0, 0],
        armed: false,
        flightMode: settings.flightMode,
        batteryTimer: state.armed ? state.batteryTimer + dt : state.batteryTimer,
        currentLapTime: state.armed ? state.currentLapTime + dt : state.currentLapTime
      },
      crashed,
      passedGateId: null
    };
  }

  // 1. Calculate Target Angular Rates (rad/s)
  // Pitch -> local X rotation, Roll -> local Z rotation, Yaw -> local Y rotation.
  let targetRollRate: number;
  let targetPitchRate: number;

  // Convert quaternion to Euler angles to get current orientation in radians
  const currentQuat = new Quaternion(...state.quaternion);
  const currentEuler = new Euler().setFromQuaternion(currentQuat, 'YXZ'); // YXZ matching standard Yaw-Pitch-Roll

  if (settings.flightMode === 'ANGLE') {
    // In Angle mode: pitch and roll sticks target absolute angles
    const maxAngleRad = (settings.pid.angleLimit * Math.PI) / 180;
    
    // Scale stick inputs to target angles
    const targetRollAngle = rawInput.roll * maxAngleRad;
    const targetPitchAngle = rawInput.pitch * maxAngleRad; // forward stick = positive pitch angle

    // Angle error
    const rollAngle = -currentEuler.z;
    const pitchAngle = -currentEuler.x;
    const rollError = targetRollAngle - rollAngle;
    const pitchError = targetPitchAngle - pitchAngle;

    // Target rate is proportional to angle error
    targetRollRate = rollError * settings.pid.angleP;
    targetPitchRate = pitchError * settings.pid.angleP;
  } else {
    // In Acro mode: pitch and roll sticks target rates
    targetRollRate = degSecToRadSec(calculateBetaflightRate(rawInput.roll, settings.rates.roll));
    targetPitchRate = degSecToRadSec(calculateBetaflightRate(rawInput.pitch, settings.rates.pitch));
  }

  // Yaw is always in Rate mode
  const targetYawRate = degSecToRadSec(calculateBetaflightRate(rawInput.yaw, settings.rates.yaw));

  // 2. PID Stabilization Loop
  // Gym input / gyro feedback (current angular velocity in body frame)
  const gyro = new Vector3(...state.angularVelocity); // [rollRate, pitchRate, yawRate] -> [Z, X, Y]
  // Wait, let's keep the mapping clear:
  // state.angularVelocity is defined as [roll, pitch, yaw] which maps to [Z, X, Y] in local rotation rates.
  // Let's create error vector:
  // error.x = Roll error, error.y = Pitch error, error.z = Yaw error
  const rateError = new Vector3(
    targetRollRate - gyro.x,
    targetPitchRate - gyro.y,
    targetYawRate - gyro.z
  );

  // Run PID update
  const pidOutput = pidController.update(rateError, gyro, settings.pid, dt);

  // 3. Motor Mixing (Quad X Layout)
  // PID outputs map to:
  // pidOutput.x -> Roll command
  // pidOutput.y -> Pitch command
  // pidOutput.z -> Yaw command
  const t = rawInput.throttle; // 0 to 1
  const r = pidOutput.x;
  const p = pidOutput.y;
  const y = pidOutput.z;

  // Quad X Mixer:
  // Motor 1: Rear Right (CCW)  = T - R + P + Y
  // Motor 2: Front Right (CW)  = T - R - P - Y
  // Motor 3: Rear Left (CW)   = T + R + P - Y
  // Motor 4: Front Left (CCW)  = T + R - P + Y
  const m1 = Math.max(0.0, Math.min(1.0, t - r + p + y));
  const m2 = Math.max(0.0, Math.min(1.0, t - r - p - y));
  const m3 = Math.max(0.0, Math.min(1.0, t + r + p - y));
  const m4 = Math.max(0.0, Math.min(1.0, t + r - p + y));

  // 4. Update actual motor speeds based on response lag
  const nextMotorSpeeds: [number, number, number, number] = [0, 0, 0, 0];
  const tau = settings.physics.motorResponseTime;
  for (let i = 0; i < 4; i++) {
    const cmd = [m1, m2, m3, m4][i];
    const prevSpeed = state.motorSpeeds[i];
    nextMotorSpeeds[i] = prevSpeed + (cmd - prevSpeed) * (dt / Math.max(tau, 0.005));
    // clamp just in case
    nextMotorSpeeds[i] = Math.max(0.0, Math.min(1.0, nextMotorSpeeds[i]));
  }

  // 5. Physics Simulation - Force & Torque generation
  // Total thrust force is sum of motor speeds * maxThrust
  const totalThrustSpeed = (nextMotorSpeeds[0] + nextMotorSpeeds[1] + nextMotorSpeeds[2] + nextMotorSpeeds[3]) / 4;
  const thrustForceMagnitude = totalThrustSpeed * settings.physics.maxThrust;

  // Local thrust is along local Y axis (Up in Three.js)
  const localThrustForce = new Vector3(0, thrustForceMagnitude, 0);
  const worldThrustForce = localThrustForce.clone().applyQuaternion(currentQuat);

  // Gravity
  const worldGravityForce = new Vector3(0, -settings.physics.mass * settings.physics.gravity, 0);

  // Linear Drag
  const worldVel = new Vector3(...state.velocity);
  const worldDragForce = worldVel.clone().multiplyScalar(-worldVel.length() * settings.physics.dragLinear);

  // Total Linear Acceleration
  const totalWorldForce = new Vector3()
    .add(worldThrustForce)
    .add(worldGravityForce)
    .add(worldDragForce);

  const worldAccel = totalWorldForce.divideScalar(settings.physics.mass);

  // Integrate Velocity & Position
  worldVel.addScaledVector(worldAccel, dt);
  const nextPosition = new Vector3(...state.position).addScaledVector(worldVel, dt);

  // Torques in body frame
  // Approximate maximum torques based on dimensions and motor thrusts
  // For a 5-inch drone, max roll torque is around 1.2 N*m, pitch 1.2 N*m, yaw 0.4 N*m
  const maxRollTorque = 1.8;
  const maxPitchTorque = 1.8;
  const maxYawTorque = 0.6;

  // Calculate net torque from actual motor speeds (relative differences)
  // Roll torque: left motors (3, 4) minus right motors (1, 2)
  const torqueRoll = ((nextMotorSpeeds[2] + nextMotorSpeeds[3]) - (nextMotorSpeeds[0] + nextMotorSpeeds[1])) * 0.5 * maxRollTorque;
  // Pitch torque: rear motors (1, 3) minus front motors (2, 4)
  const torquePitch = ((nextMotorSpeeds[0] + nextMotorSpeeds[2]) - (nextMotorSpeeds[1] + nextMotorSpeeds[4 - 1])) * 0.5 * maxPitchTorque;
  // Yaw torque: CCW motors (1, 4) minus CW motors (2, 3)
  const torqueYaw = ((nextMotorSpeeds[0] + nextMotorSpeeds[3]) - (nextMotorSpeeds[1] + nextMotorSpeeds[2])) * 0.5 * maxYawTorque;

  // Angular accelerations in body frame (alpha = torque / Inertia)
  const angularAccel = new Vector3(
    torqueRoll / settings.physics.momentOfInertia.x,
    torquePitch / settings.physics.momentOfInertia.y,
    torqueYaw / settings.physics.momentOfInertia.z
  );

  // Angular Drag
  const angularVel = new Vector3(...state.angularVelocity);
  const angularDragTorque = angularVel.clone().multiplyScalar(-angularVel.length() * settings.physics.dragAngular);
  
  angularAccel.add(new Vector3(
    angularDragTorque.x / settings.physics.momentOfInertia.x,
    angularDragTorque.y / settings.physics.momentOfInertia.y,
    angularDragTorque.z / settings.physics.momentOfInertia.z
  ));

  // Integrate Angular Velocity
  angularVel.addScaledVector(angularAccel, dt);

  // Update Quaternion (using body-frame angular velocity)
  // To rotate the quaternion using body-frame rotation rates:
  // q_new = q_old * q_delta
  // q_delta represents a rotation around the angular velocity axis by angularVel.length() * dt
  const rotationVector = new Vector3(-angularVel.y, -angularVel.z, -angularVel.x);
  const angleDelta = rotationVector.length() * dt;
  if (angleDelta > EPSILON) {
    const axis = rotationVector.clone().normalize();
    const qDelta = new Quaternion().setFromAxisAngle(axis, angleDelta);
    currentQuat.multiply(qDelta).normalize();
  }

  // Ground collision detection
  let crashed = false;
  if (nextPosition.y <= 0.15) {
    // If we land/crash hard
    if (Math.abs(worldVel.y) > 3.5) {
      crashed = true;
    }
    nextPosition.y = 0.15;
    worldVel.set(0, 0, 0);
    angularVel.set(0, 0, 0);
  }

  // Obstacle / Gate Collision Check and Pass logic
  let passedGateId: string | null = null;
  let nextPassedCount = state.passedGatesCount;
  let nextLastPassGateId = state.lastPassGateId;
  let nextBestLapTime = state.bestLapTime;
  let nextCurrentLapTime = state.currentLapTime + dt;

  for (const gate of gates) {
    // Represent gate as center position and orientation
    const gatePos = new Vector3(...gate.position);
    // Distance from drone to gate center
    const dist = nextPosition.distanceTo(gatePos);
    
    // Check if drone is close to the gate
    if (dist < 3.0) {
      // Gate normal vector from its rotation
      const gateRot = new Euler(...gate.rotation, 'YXZ');
      const gateNormal = new Vector3(0, 0, 1).applyEuler(gateRot); // Z-forward normal for gate
      
      // Project drone position relative to gate onto gate normal
      const droneRel = nextPosition.clone().sub(gatePos);
      const prevDroneRel = new Vector3(...state.position).sub(gatePos);
      
      const distNormal = droneRel.dot(gateNormal);
      const prevDistNormal = prevDroneRel.dot(gateNormal);
      
      // If drone crossed the gate plane this frame
      if (Math.sign(distNormal) !== Math.sign(prevDistNormal)) {
        // Project crossing point onto gate plane
        // Interpolate position when crossing plane (t is fraction of step)
        const tCross = Math.abs(prevDistNormal) / (Math.abs(prevDistNormal) + Math.abs(distNormal));
        const crossPos = new Vector3().lerpVectors(prevDroneRel, droneRel, tCross);
        
        // Distance from gate center in gate plane
        const distFromCenter = crossPos.length();
        
        if (distFromCenter < gate.width / 2) {
          // Passed through the gate!
          // Make sure we don't trigger the same gate twice consecutively
          if (state.lastPassGateId !== gate.id) {
            passedGateId = gate.id;
            nextLastPassGateId = gate.id;
            nextPassedCount += 1;
            
            // Lap timing: if this is gate 0, it acts as Start/Finish line
            if (gate.id === gates[0].id && state.passedGatesCount > 0) {
              if (nextBestLapTime === null || nextCurrentLapTime < nextBestLapTime) {
                nextBestLapTime = nextCurrentLapTime;
              }
              nextCurrentLapTime = 0; // reset lap timer
            }
          }
        } else if (distFromCenter < (gate.width / 2) + 0.3) {
          // Hit the gate frame!
          crashed = true;
        }
      }
    }
  }

  // Simulated Battery Drainage:
  // Voltage starts at 25.2V (6S fully charged) and drains based on average motor speed (throttle)
  const averageCurrent = totalThrustSpeed * 100; // max current 100A
  const capacityUsed = (averageCurrent * dt) / 3600; // Ah
  const capacityTotal = 1.3; // 1300mAh = 1.3Ah
  // Simple voltage drop curve: 25.2V (fully charged) to 21.0V (empty)
  const batteryPct = Math.max(0.0, 1.0 - (state.batteryTimer / 240.0) - (capacityUsed / capacityTotal));
  const batteryVoltage = 21.0 + batteryPct * 4.2;

  return {
    nextState: {
      position: nextPosition.toArray() as [number, number, number],
      velocity: worldVel.toArray() as [number, number, number],
      quaternion: currentQuat.toArray() as [number, number, number, number],
      angularVelocity: angularVel.toArray() as [number, number, number],
      motorSpeeds: nextMotorSpeeds,
      batteryVoltage,
      batteryTimer: state.batteryTimer + dt,
      rxRssi: Math.max(10, Math.round(99 - nextPosition.length() * 0.1)), // Simulated RSSI drops with distance from origin
      armed: true,
      flightMode: settings.flightMode,
      lastPassGateId: nextLastPassGateId,
      passedGatesCount: nextPassedCount,
      currentLapTime: nextCurrentLapTime,
      bestLapTime: nextBestLapTime
    },
    crashed,
    passedGateId
  };
}
