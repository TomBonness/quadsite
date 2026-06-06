import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { SimulatorSettings, DroneState } from '../types/drone';
import { TRACK_GATES } from '../types/drone';
import { stepPhysics, PIDController } from '../lib/physics';
import { getUnifiedInput } from '../lib/input';


interface SimulatorProps {
  settings: SimulatorSettings;
  droneState: DroneState;
  setDroneState: React.Dispatch<React.SetStateAction<DroneState>>;
  onGatePassed: (gateId: string) => void;
  onCrash: () => void;
  resetTrigger: number; // Increment to trigger reset
}

export const Simulator: React.FC<SimulatorProps> = ({
  settings,
  droneState,
  setDroneState,
  onGatePassed,
  onCrash,
  resetTrigger
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Keep latest props/state in refs for the animation loop to avoid dependency closures
  const settingsRef = useRef(settings);
  const stateRef = useRef(droneState);
  const onCrashRef = useRef(onCrash);
  const onGatePassedRef = useRef(onGatePassed);

  // Sync refs
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { stateRef.current = droneState; }, [droneState]);
  useEffect(() => { onCrashRef.current = onCrash; }, [onCrash]);
  useEffect(() => { onGatePassedRef.current = onGatePassed; }, [onGatePassed]);

  // Handle external reset triggers (e.g. from UI buttons)
  useEffect(() => {
    if (resetTrigger > 0) {
      // Reset position and dynamics
      setDroneState(prev => ({
        ...prev,
        position: [0, 0.15, 0],
        velocity: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
        angularVelocity: [0, 0, 0],
        motorSpeeds: [0, 0, 0, 0],
        batteryVoltage: 25.2,
        batteryTimer: 0,
        armed: false,
        lastPassGateId: null,
        passedGatesCount: 0,
        currentLapTime: 0
      }));
    }
  }, [resetTrigger, setDroneState]);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Setup Three.js Scene, Camera, and Renderer
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f6); // clean light gray Swiss BG
    scene.fog = new THREE.FogExp2(0xf4f4f6, 0.015);

    const camera = new THREE.PerspectiveCamera(settingsRef.current.cameraFov, width / height, 0.05, 1000);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 2. Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 40;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // 3. Ground Grid (Swiss Style)
    // Dark floor plane
    const floorGeo = new THREE.PlaneGeometry(1000, 1000);
    const floorMat = new THREE.MeshStandardMaterial({ 
      color: 0xf4f4f6, 
      roughness: 0.9, 
      metalness: 0.1 
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid overlays (coarse grid + fine grid)
    const gridHelperCoarse = new THREE.GridHelper(500, 50, 0x000000, 0x000000); // sharp black
    gridHelperCoarse.position.y = 0.001; // offset slightly to prevent z-fighting
    scene.add(gridHelperCoarse);
    const gridHelperFine = new THREE.GridHelper(500, 250, 0xe5e7eb, 0xe5e7eb); // subtle gray
    gridHelperFine.position.y = 0.0005;
    scene.add(gridHelperFine);

    // 4. Create Track Gates & Flags
    const gateMeshes: Record<string, THREE.Mesh> = {};
    const gateGroup = new THREE.Group();
    scene.add(gateGroup);

    TRACK_GATES.forEach((gate, index) => {
      const gGroup = new THREE.Group();
      gGroup.position.set(...gate.position);
      gGroup.rotation.set(...gate.rotation);

      // Gate ring geometry (torus)
      const gateOuterRadius = gate.width / 2;
      const ringGeo = new THREE.TorusGeometry(gateOuterRadius, 0.15, 8, 32);
      
      // Swiss style: high contrast fluorescent materials
      // Gate 0 (Start/Finish) is glowing green, others are neon red/orange.
      // Next gate will be highlighted dynamically in the loop.
      const isStart = index === 0;
      const ringMat = new THREE.MeshStandardMaterial({
        color: isStart ? 0x22c55e : 0x000000,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.8
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.castShadow = true;
      ringMesh.receiveShadow = true;
      gGroup.add(ringMesh);
      gateMeshes[gate.id] = ringMesh;

      // Vertical poles holding the gate
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, gate.position[1]);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.8 });
      
      // Left pole
      const leftPole = new THREE.Mesh(poleGeo, poleMat);
      leftPole.position.set(-gateOuterRadius, -gate.position[1]/2, 0);
      leftPole.castShadow = true;
      gGroup.add(leftPole);

      // Right pole
      const rightPole = new THREE.Mesh(poleGeo, poleMat);
      rightPole.position.set(gateOuterRadius, -gate.position[1]/2, 0);
      rightPole.castShadow = true;
      gGroup.add(rightPole);

      // Add simple visual text or banner on top of start/finish
      if (isStart) {
        const bannerGeo = new THREE.BoxGeometry(2.5, 0.5, 0.05);
        const bannerMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.8 });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(0, gateOuterRadius + 0.3, 0);
        gGroup.add(banner);
      }

      gateGroup.add(gGroup);
    });

    // Add some fluorescent corner poles/flags for visual reference
    const flagGeo = new THREE.CylinderGeometry(0.1, 0.1, 5, 8);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.8 });
    const flagPositions: [number, number][] = [
      [50, 50], [50, -50], [-50, 50], [-50, -50],
      [100, 100], [100, -100], [-100, 100], [-100, -100]
    ];
    flagPositions.forEach(([x, z]) => {
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(x, 2.5, z);
      flag.castShadow = true;
      scene.add(flag);
    });

    // 5. Create Drone Visuals (for front props inside camera view)
    const droneGroup = new THREE.Group();
    scene.add(droneGroup);

    // Front Left Prop
    const propGeo = new THREE.BoxGeometry(0.12, 0.005, 0.01);
    const propMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    
    const propFL = new THREE.Mesh(propGeo, propMat);
    // Position props relative to camera so they appear in corners of screen
    // Three.js camera looks down -Z. So forward is -Z.
    // Prop FL: left (-X), down (-Y), forward (-Z)
    propFL.position.set(-0.16, -0.08, -0.15);
    droneGroup.add(propFL);

    // Front Right Prop
    const propFR = new THREE.Mesh(propGeo, propMat);
    propFR.position.set(0.16, -0.08, -0.15);
    droneGroup.add(propFR);

    // 6. Physics Step Loop & Animation Setup
    let animationFrameId: number;
    let lastTime = performance.now();
    let physicsAccumulator = 0;
    const physicsStepSize = 0.002; // 500Hz physics loop

    const pidController = new PIDController();

    const updateLoop = (now: number) => {
      animationFrameId = requestAnimationFrame(updateLoop);

      // Frame delta time in seconds
      let dt = (now - lastTime) / 1000;
      lastTime = now;

      // Cap delta time to prevent spiral of death
      if (dt > 0.1) dt = 0.1;

      // Read current unified raw controls (keyboard or gamepad)
      const rawInput = getUnifiedInput(settingsRef.current, dt);

      // Decoupled physics step loop (500Hz caught up to render frame rate)
      physicsAccumulator += dt;
      let crashedThisFrame = false;
      let passedGateThisFrame: string | null = null;
      let currentState = stateRef.current;

      while (physicsAccumulator >= physicsStepSize) {
        const { nextState, crashed, passedGateId } = stepPhysics(
          currentState,
          rawInput,
          settingsRef.current,
          pidController,
          physicsStepSize,
          TRACK_GATES
        );
        
        currentState = nextState;
        if (crashed) crashedThisFrame = true;
        if (passedGateId) passedGateThisFrame = passedGateId;
        
        physicsAccumulator -= physicsStepSize;
      }

      // Update state ref and push to React state periodically
      if (currentState !== stateRef.current) {
        stateRef.current = currentState;
        
        // Push state update to React. To reduce re-renders, we can just push it directly,
        // or let React batch it. Since React 18+ batches state, this is safe and fast.
        setDroneState(currentState);
      }

      // Trigger actions
      if (crashedThisFrame && currentState.armed) {
        onCrashRef.current();
      }
      if (passedGateThisFrame) {
        onGatePassedRef.current(passedGateThisFrame);
      }

      // 7. Update visual representations
      // Propeller rotations
      const speedFL = currentState.motorSpeeds[3]; // Motor 4 (Front Left)
      const speedFR = currentState.motorSpeeds[1]; // Motor 2 (Front Right)

      // Spin propellers (scale rotation speed with motor speed)
      propFL.rotation.y += speedFL * 0.8;
      propFR.rotation.y -= speedFR * 0.8; // reverse direction

      // Drone model position/rotation
      droneGroup.position.set(...currentState.position);
      droneGroup.quaternion.set(...currentState.quaternion);

      // FPV Camera Placement
      // Camera is offset from drone center, tilted by cameraUptilt.
      const cameraLocalOffset = new THREE.Vector3(0, 0.04, -0.04); // slightly forward (-Z) and up (Y)
      const cameraWorldPos = cameraLocalOffset.applyQuaternion(droneGroup.quaternion).add(droneGroup.position);
      camera.position.copy(cameraWorldPos);

      // Apply camera uptilt: pitch up relative to drone body
      const cameraQuat = droneGroup.quaternion.clone();
      const uptiltRad = (settingsRef.current.cameraUptilt * Math.PI) / 180;
      const uptiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), uptiltRad);
      cameraQuat.multiply(uptiltQuat);
      camera.quaternion.copy(cameraQuat);

      // Highlight the next target gate dynamically
      // Find the index of the next gate we need to pass
      let nextGateIndex = 0;
      if (currentState.lastPassGateId) {
        const lastIndex = TRACK_GATES.findIndex(g => g.id === currentState.lastPassGateId);
        if (lastIndex !== -1) {
          nextGateIndex = (lastIndex + 1) % TRACK_GATES.length;
        }
      }
      
      TRACK_GATES.forEach((gate, idx) => {
        const mesh = gateMeshes[gate.id];
        if (mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
          const isTarget = idx === nextGateIndex;
          const isStart = idx === 0;
          
          if (isTarget) {
            // Target gate is bright red, non-emissive
            mesh.material.color.setHex(0xef4444);
            mesh.material.emissive.setHex(0x000000);
            mesh.material.emissiveIntensity = 0;
          } else if (isStart) {
            // Start gate is green, non-emissive
            mesh.material.color.setHex(0x22c55e);
            mesh.material.emissive.setHex(0x000000);
            mesh.material.emissiveIntensity = 0;
          } else {
            // Other gates are black, non-emissive
            mesh.material.color.setHex(0x000000);
            mesh.material.emissive.setHex(0x000000);
            mesh.material.emissiveIntensity = 0;
          }
        }
      });

      // Render the scene
      renderer.render(scene, camera);
    };

    // Start the loop
    animationFrameId = requestAnimationFrame(updateLoop);

    // 8. Resize Handler
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 9. Clean up on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeChild(renderer.domElement);
      
      // Dispose materials/geometries
      floorGeo.dispose();
      floorMat.dispose();
      gridHelperCoarse.dispose();
      gridHelperFine.dispose();
      flagGeo.dispose();
      flagMat.dispose();
      propGeo.dispose();
      propMat.dispose();
      
      // Dispose gate materials/geometries
      TRACK_GATES.forEach(gate => {
        const mesh = gateMeshes[gate.id];
        if (mesh) {
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      
      renderer.dispose();
    };
  }, [setDroneState]); // Run once to set up context. Settings edits will update via refs.

  return <div ref={containerRef} className="w-full h-full relative overflow-hidden" />;
};
