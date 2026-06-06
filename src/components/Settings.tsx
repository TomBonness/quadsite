import React, { useState, useEffect } from 'react';
import type { SimulatorSettings, RateSettings, GamepadMapping } from '../types/drone';
import { generateRateCurvePoints, calculateMaxRate } from '../lib/rates';
import { PHYSICS_PRESETS } from '../lib/physics';
import { Sliders, Gamepad2, Settings as SettingsIcon } from 'lucide-react';

interface SettingsProps {
  settings: SimulatorSettings;
  setSettings: React.Dispatch<React.SetStateAction<SimulatorSettings>>;
  onResetTrack: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, setSettings, onResetTrack }) => {
  const [activeTab, setActiveTab] = useState<'rates' | 'gamepad' | 'physics'>('rates');
  const [connectedGamepads, setConnectedGamepads] = useState<Gamepad[]>([]);
  const [calibrationAxis, setCalibrationAxis] = useState<string | null>(null);
  const [calibrationVals, setCalibrationVals] = useState<{ min: number; max: number; current: number }>({ min: 0, max: 0, current: 0 });

  // Poll for connected gamepads
  useEffect(() => {
    const checkGamepads = () => {
      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const gps = navigator.getGamepads();
        const active = Array.from(gps).filter(Boolean) as Gamepad[];
        setConnectedGamepads(active);
      }
    };

    checkGamepads();
    const interval = setInterval(checkGamepads, 1000);
    return () => clearInterval(interval);
  }, []);

  // Live monitor for gamepad calibration
  useEffect(() => {
    if (!calibrationAxis) return;

    let animId: number;
    const poll = () => {
      if (typeof navigator !== 'undefined' && navigator.getGamepads && settings.gamepadMapping) {
        const gps = navigator.getGamepads();
        let gp: Gamepad | null = null;
        for (let i = 0; i < gps.length; i++) {
          if (gps[i] && gps[i]?.id.includes(settings.gamepadMapping.id)) {
            gp = gps[i];
            break;
          }
        }
        if (!gp) {
          // fallback to first gamepad
          gp = gps.find(Boolean) || null;
        }

        if (gp) {
          const mapping = settings.gamepadMapping;
          let axisIdx = 0;
          switch (calibrationAxis) {
            case 'throttle': axisIdx = mapping.throttle.axisIndex; break;
            case 'yaw': axisIdx = mapping.yaw.axisIndex; break;
            case 'pitch': axisIdx = mapping.pitch.axisIndex; break;
            case 'roll': axisIdx = mapping.roll.axisIndex; break;
          }

          if (axisIdx < gp.axes.length) {
            const rawVal = gp.axes[axisIdx];
            setCalibrationVals(prev => ({
              current: rawVal,
              min: Math.min(prev.min, rawVal),
              max: Math.max(prev.max, rawVal)
            }));
          }
        }
      }
      animId = requestAnimationFrame(poll);
    };

    animId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animId);
  }, [calibrationAxis, settings.gamepadMapping]);

  // Handle Preset selection
  const selectPreset = (presetName: string) => {
    const preset = PHYSICS_PRESETS.find(p => p.name === presetName);
    if (preset) {
      setSettings(prev => ({
        ...prev,
        physics: { ...preset.physics }
      }));
    }
  };

  // Update specific rate setting
  const updateRate = (axis: 'roll' | 'pitch' | 'yaw', field: keyof RateSettings, value: number) => {
    setSettings(prev => ({
      ...prev,
      rates: {
        ...prev.rates,
        [axis]: {
          ...prev.rates[axis],
          [field]: value
        }
      }
    }));
  };

  // Set up standard default gamepad mapping
  const setupDefaultGamepad = (gp: Gamepad) => {
    const defaultMapping: GamepadMapping = {
      id: gp.id,
      throttle: { axisIndex: 2, invert: true, min: -1.0, max: 1.0, deadband: 0.05 }, // standard RC mapping on Windows/Mac
      yaw: { axisIndex: 3, invert: false, min: -1.0, max: 1.0, deadband: 0.05 },
      pitch: { axisIndex: 1, invert: true, min: -1.0, max: 1.0, deadband: 0.05 },
      roll: { axisIndex: 0, invert: false, min: -1.0, max: 1.0, deadband: 0.05 },
      armSwitch: 0,
      modeSwitch: 1
    };
    
    setSettings(prev => ({
      ...prev,
      gamepadMapping: defaultMapping
    }));
  };

  // Start calibrating an axis
  const startCalibration = (axis: string) => {
    setCalibrationAxis(axis);
    setCalibrationVals({ min: 0.0, max: 0.0, current: 0.0 });
  };

  // Stop calibrating and save values
  const saveCalibration = () => {
    if (!calibrationAxis || !settings.gamepadMapping) return;
    
    const axis = calibrationAxis as 'throttle' | 'yaw' | 'pitch' | 'roll';
    setSettings(prev => {
      if (!prev.gamepadMapping) return prev;
      return {
        ...prev,
        gamepadMapping: {
          ...prev.gamepadMapping,
          [axis]: {
            ...prev.gamepadMapping[axis],
            min: calibrationVals.min,
            max: calibrationVals.max
          }
        }
      };
    });

    setCalibrationAxis(null);
  };

  // Draw rate curve for SVG plotting
  const renderRateCurve = (rateSettings: RateSettings) => {
    const points = generateRateCurvePoints(rateSettings, 30);
    const maxRate = calculateMaxRate(rateSettings);
    
    // Width 200, Height 150
    // Maps inputs [0, 1] to X [0, 200]
    // Maps rates [0, maxRate] to Y [150, 0] (SVG coordinate Y=0 is top)
    const svgWidth = 200;
    const svgHeight = 130;

    let pathD = `M 0 ${svgHeight}`;
    points.filter(p => p.input >= 0).forEach(p => {
      const x = p.input * svgWidth;
      const y = svgHeight - (Math.abs(p.rate) / maxRate) * svgHeight;
      pathD += ` L ${x} ${y}`;
    });

    return (
      <div className="relative border border-black bg-white p-3 rounded-none">
        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 flex justify-between">
          <span>Rate Curve</span>
          <span className="text-red-600">Max: {Math.round(maxRate)}°/s</span>
        </div>
        <svg width="100%" height="130" className="overflow-visible">
          {/* Horizontal grid lines */}
          <line x1="0" y1={svgHeight * 0.25} x2={svgWidth} y2={svgHeight * 0.25} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
          <line x1="0" y1={svgHeight * 0.5} x2={svgWidth} y2={svgHeight * 0.5} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
          <line x1="0" y1={svgHeight * 0.75} x2={svgWidth} y2={svgHeight * 0.75} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
          
          {/* Vertical grid lines */}
          <line x1={svgWidth * 0.25} y1="0" x2={svgWidth * 0.25} y2={svgHeight} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
          <line x1={svgWidth * 0.5} y1="0" x2={svgWidth * 0.5} y2={svgHeight} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
          <line x1={svgWidth * 0.75} y1="0" x2={svgWidth * 0.75} y2={svgHeight} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />

          {/* Curve path */}
          <path d={pathD} fill="none" stroke="#ef4444" strokeWidth="3" />
        </svg>
      </div>
    );
  };

  return (
    <div className="w-full bg-white border-t border-zinc-200 text-black flex flex-col font-sans p-6 z-20 shrink-0">
      {/* Header (Swiss style layout: strict asymmetric columns) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 border-b border-zinc-200 pb-6 mb-6">
        <div className="md:col-span-2">
          <h1 className="text-4xl font-black tracking-tighter uppercase text-black flex items-center gap-3">
            <span className="bg-red-600 text-white px-2 py-0.5 select-none text-2xl font-black">FPV</span>
            SIM CALIBRATION
          </h1>
          <p className="text-zinc-500 font-sans text-xs mt-2 leading-relaxed tracking-wide">
            SWISS GRID STABILIZED FLIGHT SIMULATION FOR LOW LATENCY RADIO CONTROL. 
            GRID MAPPINGS COMPLY WITH THE BETAFLIGHT RATE SPECIFICATION.
          </p>
        </div>
        {/* Quick Toggles */}
        <div className="flex flex-col gap-2 justify-center font-mono text-xs">
          <div className="flex justify-between items-center border-b border-zinc-200 py-1">
            <span className="text-zinc-400 font-bold">FLIGHT MODE</span>
            <button 
              onClick={() => setSettings(prev => ({ ...prev, flightMode: prev.flightMode === 'ANGLE' ? 'ACRO' : 'ANGLE' }))}
              className={`px-3 py-1 font-black rounded-none uppercase transition-all duration-150 border border-black ${settings.flightMode === 'ACRO' ? 'bg-black text-white' : 'bg-white text-black'}`}
            >
              {settings.flightMode}
            </button>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-zinc-400 font-bold">CAMERA UPTILT</span>
            <div className="flex items-center gap-2">
              <input 
                type="range" min="0" max="60" step="5"
                value={settings.cameraUptilt}
                onChange={e => setSettings(prev => ({ ...prev, cameraUptilt: parseInt(e.target.value) }))}
                className="w-20 accent-red-600"
              />
              <span className="text-black font-bold w-8 text-right">{settings.cameraUptilt}°</span>
            </div>
          </div>
        </div>
        {/* Global actions */}
        <div className="flex flex-col gap-2 justify-center font-mono">
          <button 
            onClick={onResetTrack}
            className="w-full bg-white hover:bg-zinc-100 text-black font-black uppercase text-xs py-2 px-4 transition-colors tracking-widest rounded-none border border-black"
          >
            RESET FLIGHT
          </button>
        </div>
      </div>

      {/* Tabs (Swiss Style Typography, high contrast border layout) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        
        {/* Side Tabs navigation */}
        <div className="flex flex-row md:flex-col border border-black bg-white p-1 gap-1">
          <button
            onClick={() => setActiveTab('rates')}
            className={`flex-1 md:flex-initial text-left px-4 py-3 font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all rounded-none border border-transparent ${activeTab === 'rates' ? 'bg-black text-white' : 'bg-white hover:bg-zinc-100 text-black hover:border-black'}`}
          >
            <Sliders size={14} />
            BETAFLIGHT RATES
          </button>
          <button
            onClick={() => setActiveTab('gamepad')}
            className={`flex-1 md:flex-initial text-left px-4 py-3 font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all rounded-none border border-transparent ${activeTab === 'gamepad' ? 'bg-black text-white' : 'bg-white hover:bg-zinc-100 text-black hover:border-black'}`}
          >
            <Gamepad2 size={14} />
            RADIO CONTROLLER
          </button>
          <button
            onClick={() => setActiveTab('physics')}
            className={`flex-1 md:flex-initial text-left px-4 py-3 font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all rounded-none border border-transparent ${activeTab === 'physics' ? 'bg-black text-white' : 'bg-white hover:bg-zinc-100 text-black hover:border-black'}`}
          >
            <SettingsIcon size={14} />
            PHYSICS TUNING
          </button>
        </div>
        {/* Main Tab Window */}
        <div className="md:col-span-3 min-h-[260px] bg-white border border-black p-6">
          
          {/* Tab 1: Rates */}
          {activeTab === 'rates' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
              
              {/* Roll settings */}
              <div className="flex flex-col gap-4 border border-black p-4 text-black bg-white">
                <div className="text-sm font-black text-black uppercase border-b border-zinc-200 pb-2">Roll Rate</div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">RC RATE</span>
                    <input 
                      type="number" min="0.1" max="3.0" step="0.05"
                      value={settings.rates.roll.rcRate}
                      onChange={e => updateRate('roll', 'rcRate', parseFloat(e.target.value) || 1.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">SUPER RATE</span>
                    <input 
                      type="number" min="0.0" max="0.99" step="0.05"
                      value={settings.rates.roll.superRate}
                      onChange={e => updateRate('roll', 'superRate', parseFloat(e.target.value) || 0.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">EXPO</span>
                    <input 
                      type="number" min="0.0" max="0.99" step="0.05"
                      value={settings.rates.roll.expo}
                      onChange={e => updateRate('roll', 'expo', parseFloat(e.target.value) || 0.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                </div>
                {renderRateCurve(settings.rates.roll)}
              </div>
              {/* Pitch settings */}
              <div className="flex flex-col gap-4 border border-black p-4 text-black bg-white">
                <div className="text-sm font-black text-black uppercase border-b border-zinc-200 pb-2">Pitch Rate</div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">RC RATE</span>
                    <input 
                      type="number" min="0.1" max="3.0" step="0.05"
                      value={settings.rates.pitch.rcRate}
                      onChange={e => updateRate('pitch', 'rcRate', parseFloat(e.target.value) || 1.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">SUPER RATE</span>
                    <input 
                      type="number" min="0.0" max="0.99" step="0.05"
                      value={settings.rates.pitch.superRate}
                      onChange={e => updateRate('pitch', 'superRate', parseFloat(e.target.value) || 0.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">EXPO</span>
                    <input 
                      type="number" min="0.0" max="0.99" step="0.05"
                      value={settings.rates.pitch.expo}
                      onChange={e => updateRate('pitch', 'expo', parseFloat(e.target.value) || 0.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                </div>
                {renderRateCurve(settings.rates.pitch)}
              </div>

              {/* Yaw settings */}
              <div className="flex flex-col gap-4 border border-black p-4 text-black bg-white">
                <div className="text-sm font-black text-black uppercase border-b border-zinc-200 pb-2">Yaw Rate</div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">RC RATE</span>
                    <input 
                      type="number" min="0.1" max="3.0" step="0.05"
                      value={settings.rates.yaw.rcRate}
                      onChange={e => updateRate('yaw', 'rcRate', parseFloat(e.target.value) || 1.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">SUPER RATE</span>
                    <input 
                      type="number" min="0.0" max="0.99" step="0.05"
                      value={settings.rates.yaw.superRate}
                      onChange={e => updateRate('yaw', 'superRate', parseFloat(e.target.value) || 0.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold">EXPO</span>
                    <input 
                      type="number" min="0.0" max="0.99" step="0.05"
                      value={settings.rates.yaw.expo}
                      onChange={e => updateRate('yaw', 'expo', parseFloat(e.target.value) || 0.0)}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                </div>
                {renderRateCurve(settings.rates.yaw)}
              </div>

            </div>
          )}

          {/* Tab 2: Gamepad Calibration */}
          {activeTab === 'gamepad' && (
            <div className="flex flex-col gap-6 font-mono text-xs">
              <div className="border border-black p-4 bg-white text-black">
                <div className="text-sm font-black text-black uppercase border-b border-zinc-200 pb-2 mb-4 flex justify-between items-center">
                  <span>Radio Mappings</span>
                  <span className="text-zinc-500 text-xs">GAMEPAD API Integration</span>
                </div>
                {connectedGamepads.length === 0 ? (
                  <div className="text-zinc-500 p-4 border border-dashed border-zinc-200 text-center uppercase tracking-wider">
                    No Gamepad or RC Transmitter detected. Plug in your controller via USB.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-zinc-500 font-bold uppercase">Select Device:</label>
                      <select 
                        className="bg-white text-black border border-black p-2 font-mono"
                        onChange={e => {
                          const gp = connectedGamepads.find(g => g.id === e.target.value);
                          if (gp) setupDefaultGamepad(gp);
                        }}
                        value={settings.gamepadMapping?.id || ''}
                      >
                        <option value="">-- Choose Connected Controller --</option>
                        {connectedGamepads.map(gp => (
                          <option key={gp.id} value={gp.id}>{gp.id}</option>
                        ))}
                      </select>
                    </div>
                    {settings.gamepadMapping && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        {/* Axes Calibration */}
                        <div className="flex flex-col gap-4 border border-black p-4 bg-white">
                          <span className="text-black font-black uppercase tracking-wider mb-2 border-b border-zinc-200 pb-1">Channels Calibration</span>
                          
                          {(['throttle', 'yaw', 'pitch', 'roll'] as const).map(axis => {
                            const map = settings.gamepadMapping![axis];
                            return (
                              <div key={axis} className="flex flex-col gap-1 border-b border-zinc-200 pb-3 last:border-b-0">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-black uppercase">{axis}</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => startCalibration(axis)}
                                      className={`px-3 py-1 font-black text-[10px] uppercase border transition-all ${calibrationAxis === axis ? 'bg-red-600 border-red-600 text-white animate-pulse' : 'bg-white border-black hover:bg-zinc-100 text-black'}`}
                                    >
                                      {calibrationAxis === axis ? 'Calibrating...' : 'Calibrate'}
                                    </button>
                                    <label className="flex items-center gap-1 text-[10px] font-bold text-zinc-500">
                                      <input 
                                        type="checkbox"
                                        checked={map.invert}
                                        onChange={e => setSettings(prev => {
                                          if (!prev.gamepadMapping) return prev;
                                          return {
                                            ...prev,
                                            gamepadMapping: {
                                              ...prev.gamepadMapping,
                                              [axis]: { ...prev.gamepadMapping[axis], invert: e.target.checked }
                                            }
                                          };
                                        })}
                                        className="accent-red-600"
                                      />
                                      INVERT
                                    </label>
                                  </div>
                                </div>
                                <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                                  <span>Min: {map.min.toFixed(2)}</span>
                                  <span>Max: {map.max.toFixed(2)}</span>
                                  <span>Axis Index: {map.axisIndex}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Interactive Axis Monitor */}
                        <div className="flex flex-col gap-4 border border-black p-4 bg-white text-black">
                          <span className="text-black font-black uppercase tracking-wider mb-2 border-b border-zinc-200 pb-1">Live Monitor</span>
                          {calibrationAxis ? (
                            <div className="flex flex-col gap-3 justify-center items-center h-full text-center">
                              <span className="text-red-600 font-bold uppercase animate-pulse">MOVE STICK TO EXTREME ENDS</span>
                              <div className="text-black text-lg font-bold">
                                Current Raw: <span className="text-red-600">{calibrationVals.current.toFixed(4)}</span>
                              </div>
                              <div className="text-zinc-500 text-[10px]">
                                Observed Range: [{calibrationVals.min.toFixed(2)}, {calibrationVals.max.toFixed(2)}]
                              </div>
                              <button 
                                onClick={saveCalibration}
                                className="mt-4 bg-white text-black font-black uppercase tracking-widest px-4 py-2 hover:bg-zinc-100 border border-black"
                              >
                                SAVE CALIBRATION
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 h-full justify-center">
                              <p className="text-zinc-500 leading-normal text-xs mb-2">
                                Verify stick responses. Fully deflection should reach exactly -1.0 to 1.0 (or 0.0 to 1.0 on Throttle).
                              </p>
                              <div className="flex items-center justify-between text-zinc-400">
                                <span>Note: Radio transmitters appear as standard USB gamepads. Windows and Mac may register axes different. Use the Calibrate utility above.</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Physics Configuration */}
          {activeTab === 'physics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
              
              {/* Presets Selection */}
              <div className="flex flex-col gap-4 border border-black p-4 bg-white text-black">
                <span className="text-black font-black uppercase tracking-wider mb-2 border-b border-zinc-200 pb-1">Select Physics Preset</span>
                <div className="flex flex-col gap-2">
                  {PHYSICS_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => selectPreset(preset.name)}
                      className="border border-black bg-white p-3 text-left transition-all hover:bg-zinc-100 flex flex-col gap-1 rounded-none text-black"
                    >
                      <span className="font-bold">{preset.name}</span>
                      <span className="text-zinc-500 text-[10px] leading-relaxed">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Adjust Parameters */}
              <div className="flex flex-col gap-4 border border-black p-4 bg-white text-black">
                <span className="text-black font-black uppercase tracking-wider mb-2 border-b border-zinc-200 pb-1">Rigid Body Constants</span>
                <div className="flex flex-col gap-3 font-mono">
                  
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold uppercase">Weight (Mass)</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" min="0.01" max="5.00" step="0.05"
                        value={settings.physics.mass}
                        onChange={e => setSettings(prev => ({ ...prev, physics: { ...prev.physics, mass: parseFloat(e.target.value) || 0.5 } }))}
                        className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                      />
                      <span className="text-zinc-500 w-6">kg</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold uppercase">Gravity acceleration</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" min="0.00" max="25.00" step="0.5"
                        value={settings.physics.gravity}
                        onChange={e => setSettings(prev => ({ ...prev, physics: { ...prev.physics, gravity: parseFloat(e.target.value) || 9.81 } }))}
                        className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                      />
                      <span className="text-zinc-500 w-6">m/s²</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold uppercase">Propeller Max Thrust</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" min="1.00" max="150.00" step="1.0"
                        value={settings.physics.maxThrust}
                        onChange={e => setSettings(prev => ({ ...prev, physics: { ...prev.physics, maxThrust: parseFloat(e.target.value) || 30 } }))}
                        className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                      />
                      <span className="text-zinc-500 w-6">N</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold uppercase">Linear Aerodynamic Drag</span>
                    <input 
                      type="number" min="0.01" max="2.00" step="0.02"
                      value={settings.physics.dragLinear}
                      onChange={e => setSettings(prev => ({ ...prev, physics: { ...prev.physics, dragLinear: parseFloat(e.target.value) || 0.1 } }))}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold uppercase">Angular Aerodynamic Drag</span>
                    <input 
                      type="number" min="0.01" max="2.00" step="0.02"
                      value={settings.physics.dragAngular}
                      onChange={e => setSettings(prev => ({ ...prev, physics: { ...prev.physics, dragAngular: parseFloat(e.target.value) || 0.1 } }))}
                      className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-bold uppercase">Motor Response Time</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" min="0.005" max="0.500" step="0.005"
                        value={settings.physics.motorResponseTime}
                        onChange={e => setSettings(prev => ({ ...prev, physics: { ...prev.physics, motorResponseTime: parseFloat(e.target.value) || 0.03 } }))}
                        className="w-16 bg-white border border-black text-black font-bold p-1 text-center"
                      />
                      <span className="text-zinc-500 w-6">s</span>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

        </div>
      </div>
      
      {/* Footer copyright / info */}
      <div className="border-t border-zinc-200 mt-6 pt-4 flex justify-between text-[10px] text-zinc-500 font-mono tracking-widest">
        <span>ANTIGRAVITY SIM v1.0.0</span>
        <span>GRID ALIGNED SYSTEM PRESET - MULTIGP VERIFIED</span>
      </div>

    </div>
  );
};
