import React from 'react';
import { Quaternion, Euler } from 'three';
import type { DroneState } from '../types/drone';

interface HUDProps {
  droneState: DroneState;
  gatesCount: number;
}

export const HUD: React.FC<HUDProps> = ({ droneState, gatesCount }) => {
  const {
    position,
    velocity,
    quaternion,
    batteryVoltage,
    batteryTimer,
    rxRssi,
    armed,
    flightMode,
    passedGatesCount,
    currentLapTime,
    bestLapTime
  } = droneState;

  // Calculate speed in km/h and m/s
  const speedMS = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
  const speedKMH = Math.round(speedMS * 3.6);
  const altitude = Math.max(0, position[1] - 0.15).toFixed(1); // adjust for drone center offset

  // Extract Euler angles for the Artificial Horizon
  const q = new Quaternion(...quaternion);
  const euler = new Euler().setFromQuaternion(q, 'YXZ');
  
  // Convert to degrees
  const roll = (euler.z * 180) / Math.PI;
  const pitch = (euler.x * 180) / Math.PI;

  // Format flight timer (mm:ss.t)
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    const tenths = Math.floor((secs % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}.${tenths}`;
  };

  // Cell battery calculations (assuming a 6S LiPo battery, fully charged 25.2V, dead 21.0V)
  const cells = 6;
  const cellVoltage = (batteryVoltage / cells).toFixed(2);

  // Artificial horizon positioning
  // Max pitch offset is capped for visual sanity
  const pitchOffset = Math.max(-100, Math.min(100, pitch * 2)); // 2px per degree
  const rollRotation = -roll; // invert roll rotation to match horizon behavior


  return (
    <div className="absolute inset-0 pointer-events-none font-mono text-black select-none z-10 text-sm md:text-base">
      {/* Top Left: RSSI & Mode */}
      <div className="absolute top-6 left-6 flex flex-col gap-1 items-start">
        <div className="flex items-center gap-2">
          <span>RSSI:</span>
          <span className="font-bold">{rxRssi}%</span>
        </div>
        <div>
          MODE: <span className="font-bold">{flightMode}</span>
        </div>
      </div>
      {/* Top Right: Status & Master Timer */}
      <div className="absolute top-6 right-6 flex flex-col gap-1 items-end">
        <div className="flex items-center gap-2">
          {armed ? (
            <span className="text-red-600 font-bold px-2 py-0.5 border border-red-600 bg-white tracking-widest uppercase">ARMED</span>
          ) : (
            <span className="text-black font-bold px-2 py-0.5 border border-black bg-white tracking-widest uppercase">DISARMED</span>
          )}
        </div>
        <div className="mt-1">
          FLT TIME: <span className="font-bold">{formatTime(batteryTimer)}</span>
        </div>
      </div>
      {/* Center: Artificial Horizon and Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Center Crosshair */}
        <div className="w-8 h-8 flex items-center justify-center relative">
          {/* OSD Center Cross */}
          <div className="w-2 h-0.5 bg-black" />
          <div className="w-0.5 h-2 bg-black absolute" />
          {/* Brackets [ ] */}
          <div className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-black font-bold">[</div>
          <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 text-black font-bold">]</div>
        </div>
        {/* Horizon Lines */}
        <svg 
          className="absolute w-72 h-72 pointer-events-none overflow-hidden" 
          style={{ transform: `rotate(${rollRotation}deg) translateY(${pitchOffset}px)` }}
        >
          {/* Center line with gap */}
          <line x1="10" y1="144" x2="110" y2="144" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="182" y1="144" x2="282" y2="144" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
          {/* Minimal ladder lines */}
          {/* +10 Degrees */}
          <line x1="110" y1="124" x2="130" y2="124" stroke="black" strokeWidth="1" />
          <line x1="162" y1="124" x2="182" y2="124" stroke="black" strokeWidth="1" />
          {/* -10 Degrees */}
          <line x1="110" y1="164" x2="130" y2="164" stroke="black" strokeWidth="1" />
          <line x1="162" y1="164" x2="182" y2="164" stroke="black" strokeWidth="1" />
        </svg>
      </div>

      {/* Bottom Left: Power & Battery */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-1 items-start">
        <div className="flex items-center gap-2">
          <span>BATTERY:</span>
          <span className={`font-bold ${batteryVoltage < 22.2 ? 'text-red-600 animate-pulse' : 'text-black'}`}>
            {batteryVoltage.toFixed(1)}V
          </span>
        </div>
        <div className="text-xs">
          CELLS: <span className="font-semibold">{cellVoltage}V</span>
        </div>
      </div>

      {/* Bottom Middle: Racing Telemetry */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs md:text-sm font-bold bg-white/90 border border-black px-6 py-2 rounded-none">
        <span>GATES: {passedGatesCount}/{gatesCount}</span>
        <span>|</span>
        <span>LAP: {formatTime(currentLapTime)}</span>
        {bestLapTime !== null && (
          <>
            <span>|</span>
            <span>BEST: {formatTime(bestLapTime)}</span>
          </>
        )}
      </div>
      {/* Bottom Right: Flight Stats */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-1 items-end">
        <div className="flex items-center gap-2">
          <span>SPEED:</span>
          <span className="font-bold">{speedKMH} km/h</span>
        </div>
        <div className="flex items-center gap-2">
          <span>ALTITUDE:</span>
          <span className="font-bold">{altitude} m</span>
        </div>
      </div>

      {/* Control Input Guide (Only shown when disarmed) */}
      {!armed && (
        <div 
          className="absolute top-1/2 left-6 -translate-y-1/2 bg-white border border-black p-6 max-w-sm rounded-none pointer-events-auto text-xs text-black" 
        >
          <h3 className="font-black uppercase text-sm mb-3 border-b border-black pb-2 tracking-wider">Control Configuration</h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 mb-4 font-sans">
            <div className="font-mono font-bold">SPACEBAR</div>
            <div>Arm / Disarm</div>
            <div className="font-mono font-bold">W / S</div>
            <div>Throttle Up / Down</div>
            <div className="font-mono font-bold">A / D</div>
            <div>Yaw Left / Right</div>
            <div className="font-mono font-bold">ARROWS</div>
            <div>Roll & Pitch</div>
            <div className="font-mono font-bold">R</div>
            <div>Reset Position</div>
            <div className="font-mono font-bold">M</div>
            <div>Toggle Angle / Acro</div>
          </div>
          <p className="text-red-600 font-bold font-sans text-[11px] leading-relaxed">
            * USB Controller (Gamepad API) will automatically map if configured in the settings panel below.
          </p>
        </div>
      )}
    </div>
  );
};
