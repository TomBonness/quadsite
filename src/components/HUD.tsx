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

  // CSS for Betaflight OSD typography (black stroke with white/green text)
  const osdTextShadow = {
    textShadow: '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000, 3px 3px 1px rgba(0,0,0,0.8)'
  };

  return (
    <div className="absolute inset-0 pointer-events-none font-mono text-white select-none z-10 text-sm md:text-base">
      {/* Top Left: RSSI & Mode */}
      <div className="absolute top-6 left-6 flex flex-col gap-1 items-start" style={osdTextShadow}>
        <div className="flex items-center gap-2 text-cyan-400">
          <span>RSSI:</span>
          <span className="font-bold">{rxRssi}%</span>
        </div>
        <div className="text-zinc-300">
          MODE: <span className="font-bold text-white">{flightMode}</span>
        </div>
      </div>

      {/* Top Right: Status & Master Timer */}
      <div className="absolute top-6 right-6 flex flex-col gap-1 items-end" style={osdTextShadow}>
        <div className="flex items-center gap-2">
          {armed ? (
            <span className="text-emerald-500 font-bold px-2 py-0.5 border border-emerald-500/30 bg-emerald-950/20 tracking-widest animate-pulse">ARMED</span>
          ) : (
            <span className="text-rose-500 font-bold px-2 py-0.5 border border-rose-500/30 bg-rose-950/20 tracking-widest">DISARMED</span>
          )}
        </div>
        <div className="text-zinc-300 mt-1">
          FLT TIME: <span className="font-bold text-white">{formatTime(batteryTimer)}</span>
        </div>
      </div>

      {/* Center: Artificial Horizon and Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Center Crosshair */}
        <div className="w-8 h-8 flex items-center justify-center relative">
          {/* OSD Center Cross */}
          <div className="w-2 h-0.5 bg-white shadow-sm" style={{ ...osdTextShadow }} />
          <div className="w-0.5 h-2 bg-white shadow-sm absolute" style={{ ...osdTextShadow }} />
          {/* Brackets [ ] */}
          <div className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-white font-bold" style={osdTextShadow}>[</div>
          <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 text-white font-bold" style={osdTextShadow}>]</div>
        </div>

        {/* Horizon Lines */}
        <svg 
          className="absolute w-72 h-72 pointer-events-none overflow-hidden" 
          style={{ transform: `rotate(${rollRotation}deg) translateY(${pitchOffset}px)` }}
        >
          {/* Center line with gap */}
          <line x1="10" y1="144" x2="110" y2="144" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="182" y1="144" x2="282" y2="144" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          
          {/* Ladder tick marks */}
          {/* +10 Degrees */}
          <line x1="96" y1="124" x2="116" y2="124" stroke="white" strokeWidth="1.5" />
          <line x1="96" y1="124" x2="96" y2="129" stroke="white" strokeWidth="1.5" />
          <line x1="176" y1="124" x2="196" y2="124" stroke="white" strokeWidth="1.5" />
          <line x1="196" y1="124" x2="196" y2="129" stroke="white" strokeWidth="1.5" />
          <text x="76" y="128" fill="white" fontSize="10" fontWeight="bold">10</text>
          <text x="202" y="128" fill="white" fontSize="10" fontWeight="bold">10</text>

          {/* -10 Degrees */}
          <line x1="96" y1="164" x2="116" y2="164" stroke="white" strokeWidth="1.5" />
          <line x1="96" y1="164" x2="96" y2="159" stroke="white" strokeWidth="1.5" />
          <line x1="176" y1="164" x2="196" y2="164" stroke="white" strokeWidth="1.5" />
          <line x1="196" y1="164" x2="196" y2="159" stroke="white" strokeWidth="1.5" />
          <text x="76" y="168" fill="white" fontSize="10" fontWeight="bold">-10</text>
          <text x="202" y="168" fill="white" fontSize="10" fontWeight="bold">-10</text>
        </svg>
      </div>

      {/* Bottom Left: Power & Battery */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-1 items-start" style={osdTextShadow}>
        <div className="flex items-center gap-2">
          <span className="text-zinc-300">BATTERY:</span>
          <span className={`font-bold ${batteryVoltage < 22.2 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
            {batteryVoltage.toFixed(1)}V
          </span>
        </div>
        <div className="text-zinc-400 text-xs">
          CELLS: <span className="font-semibold text-zinc-200">{cellVoltage}V</span>
        </div>
      </div>

      {/* Bottom Middle: Racing Telemetry */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-1 items-center bg-black/40 border border-zinc-800/40 px-6 py-3 rounded backdrop-blur-sm shadow-xl" style={osdTextShadow}>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center">
            <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Gates Passed</span>
            <span className="text-2xl font-black text-cyan-400">{passedGatesCount}<span className="text-xs text-zinc-500 font-normal"> / {gatesCount}</span></span>
          </div>
          <div className="w-[1px] h-8 bg-zinc-800" />
          <div className="flex flex-col items-center">
            <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Current Lap</span>
            <span className="text-2xl font-black text-white">{formatTime(currentLapTime)}</span>
          </div>
          {bestLapTime !== null && (
            <>
              <div className="w-[1px] h-8 bg-zinc-800" />
              <div className="flex flex-col items-center">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Best Lap</span>
                <span className="text-2xl font-black text-emerald-400">{formatTime(bestLapTime)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Right: Flight Stats */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-1 items-end" style={osdTextShadow}>
        <div className="flex items-center gap-2">
          <span className="text-zinc-300">SPEED:</span>
          <span className="font-bold text-white">{speedKMH} <span className="text-xs text-zinc-400 font-normal">km/h</span></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-300">ALTITUDE:</span>
          <span className="font-bold text-white">{altitude} <span className="text-xs text-zinc-400 font-normal">m</span></span>
        </div>
      </div>

      {/* Control Input Guide (Only shown when disarmed) */}
      {!armed && (
        <div 
          className="absolute top-1/2 left-6 -translate-y-1/2 bg-black/60 border border-zinc-800 p-6 max-w-sm rounded-none shadow-2xl backdrop-blur-md pointer-events-auto text-xs" 
          style={{ textShadow: 'none' }}
        >
          <h3 className="text-white font-black uppercase text-sm mb-3 border-b border-zinc-800 pb-2 tracking-wider">Control Configuration</h3>
          
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-zinc-300 mb-4 font-sans">
            <div className="font-mono font-bold text-white">SPACEBAR</div>
            <div>Arm / Disarm</div>
            
            <div className="font-mono font-bold text-white">W / S</div>
            <div>Throttle Up / Down</div>
            
            <div className="font-mono font-bold text-white">A / D</div>
            <div>Yaw Left / Right</div>
            
            <div className="font-mono font-bold text-white">ARROWS</div>
            <div>Roll & Pitch</div>
            
            <div className="font-mono font-bold text-white">R</div>
            <div>Reset Position</div>
            
            <div className="font-mono font-bold text-white">M</div>
            <div>Toggle Angle / Acro</div>
          </div>
          
          <p className="text-amber-500 font-bold font-sans text-[11px] leading-relaxed">
            * USB Controller (Gamepad API) will automatically map if configured in the settings panel below.
          </p>
        </div>
      )}
    </div>
  );
};
