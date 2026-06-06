import { useState, useEffect } from 'react';
import type { SimulatorSettings, DroneState } from './types/drone';
import { TRACK_GATES } from './types/drone';
import { Simulator } from './components/Simulator';
import { HUD } from './components/HUD';
import { Settings } from './components/Settings';
import { resetKeyboardThrottle } from './lib/input';

const LOCAL_STORAGE_KEY = 'quadsite_settings';

const DEFAULT_SETTINGS: SimulatorSettings = {
  cameraUptilt: 25,
  cameraFov: 115,
  flightMode: 'ACRO',
  rates: {
    roll: { rcRate: 1.0, superRate: 0.7, expo: 0.3 },
    pitch: { rcRate: 1.0, superRate: 0.7, expo: 0.3 },
    yaw: { rcRate: 1.0, superRate: 0.5, expo: 0.2 }
  },
  pid: {
    roll: { p: 4.2, i: 8.0, d: 2.2 },
    pitch: { p: 4.5, i: 8.5, d: 2.5 },
    yaw: { p: 4.5, i: 8.5, d: 0.5 },
    angleLimit: 45,
    angleP: 6.0
  },
  physics: {
    mass: 0.65,
    gravity: 9.81,
    dragLinear: 0.15,
    dragAngular: 0.08,
    maxThrust: 35.0,
    momentOfInertia: { x: 0.005, y: 0.005, z: 0.008 },
    motorResponseTime: 0.03
  },
  gamepadMapping: null,
  keyboardMapping: {
    throttleUp: 'w',
    throttleDown: 's',
    yawLeft: 'a',
    yawRight: 'd',
    pitchForward: 'arrowup',
    pitchBackward: 'arrowdown',
    rollLeft: 'arrowleft',
    rollRight: 'arrowright',
    reset: 'r',
    changeMode: 'm'
  }
};

const INITIAL_DRONE_STATE: DroneState = {
  position: [0, 0.15, 0],
  velocity: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  angularVelocity: [0, 0, 0],
  motorSpeeds: [0, 0, 0, 0],
  batteryVoltage: 25.2,
  batteryTimer: 0,
  rxRssi: 99,
  armed: false,
  flightMode: 'ACRO',
  lastPassGateId: null,
  passedGatesCount: 0,
  currentLapTime: 0,
  bestLapTime: null
};

export default function App() {
  const [settings, setSettings] = useState<SimulatorSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return DEFAULT_SETTINGS;
        }
      }
    }
    return DEFAULT_SETTINGS;
  });

  const [droneState, setDroneState] = useState<DroneState>(INITIAL_DRONE_STATE);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const [crashed, setCrashed] = useState<boolean>(false);
  const [hideSettings, setHideSettings] = useState<boolean>(false);

  // Save settings on change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Handle crash reset
  const handleCrash = () => {
    setCrashed(true);
  };

  // Process reset action
  const resetFlight = () => {
    setCrashed(false);
    resetKeyboardThrottle(0.1);
    setResetTrigger(prev => prev + 1);
  };

  const handleGatePassed = (gateId: string) => {
    console.log(`Gate passed: ${gateId}`);
  };

  // Keyboard shortcut listener for Reset and Mode Switch in App scope
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === settings.keyboardMapping.reset.toLowerCase()) {
        resetFlight();
      }
      if (key === settings.keyboardMapping.changeMode.toLowerCase()) {
        setSettings(prev => ({
          ...prev,
          flightMode: prev.flightMode === 'ANGLE' ? 'ACRO' : 'ANGLE'
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.keyboardMapping]);

  return (
    <div className="flex flex-col h-screen bg-white text-black select-none overflow-hidden">
      {/* Top Banner (Mini Swiss Style Status Header) */}
      <header className="h-12 border-b border-zinc-200 bg-white px-6 flex items-center justify-between z-20 shrink-0 font-mono text-xs text-black">
        <div className="flex items-center gap-6">
          <span className="font-black text-sm tracking-widest text-black uppercase flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-600 inline-block" />
            ANTIGRAVITY SYSTEMS
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHideSettings(prev => !prev)}
            className="bg-black hover:bg-zinc-800 text-white font-bold uppercase px-3 py-1.5 text-[10px] tracking-wider border border-black rounded-none transition-colors"
          >
            {hideSettings ? 'SHOW CONTROLS' : 'HIDE CONTROLS'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        
        {/* Simulator Section */}
        <div className={`relative min-h-0 transition-all duration-300 ${hideSettings ? 'flex-1' : 'h-[60%] border-b border-zinc-200'}`}>
          <Simulator
            settings={settings}
            droneState={droneState}
            setDroneState={setDroneState}
            onGatePassed={handleGatePassed}
            onCrash={handleCrash}
            resetTrigger={resetTrigger}
          />
          
          {/* Classic OSD Layout */}
          <HUD droneState={droneState} gatesCount={TRACK_GATES.length} />

          {/* Hard Crash Overlay in Swiss style (Red box, bold text, no decoration) */}
          {crashed && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-30 flex items-center justify-center pointer-events-auto">
              <div className="bg-red-600 border-4 border-black text-black max-w-md w-full p-8 text-center rounded-none">
                <h2 className="text-4xl font-black tracking-tighter uppercase mb-4">
                  CRASH DETECTED
                </h2>
                <p className="font-mono text-sm font-bold uppercase mb-6 leading-relaxed">
                  IMPACT FORCE EXCEEDED SAFE STRUCTURAL COEFFICIENT. DRONE IS DISARMED.
                </p>
                <button
                  onClick={resetFlight}
                  className="bg-black hover:bg-zinc-900 text-white font-black uppercase tracking-widest text-xs py-3 px-6 rounded-none transition-colors border-2 border-black"
                >
                  PRESS R OR CLICK HERE TO RESET
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Settings/Controls Dashboard */}
        {!hideSettings && (
          <div className="h-[40%] min-h-[300px] overflow-y-auto flex shrink-0 border-t border-zinc-200">
            <Settings
              settings={settings}
              setSettings={setSettings}
              onResetTrack={resetFlight}
            />
          </div>
        )}
      </div>

    </div>
  );
}
