# Low Latency Web-Based FPV Drone Flight Simulator

An ultra-low latency, lightweight, browser-based quadcopter simulator designed for FPV pilots and RC hobbyists. Supports USB Radio Transmitters (via the Gamepad API) and standard keyboard layout controls. Runs smoothly at maximum frame rate using raw WebGL/Three.js rendering and a decoupled 500Hz physics engine.

The dashboard overlays, calibration panels, and configurations are styled in **Swiss Style Web Design** (bold high-contrast sans-serif typography, asymmetric grid layouts, strict vertical alignments, and fluorescent/neon accents).

---

## Key Features

1. **Decoupled 500Hz Physics Loop**
   - The rigid body flight dynamics model runs at a deterministic 500Hz (2ms step size) inside the render animation frame loop to eliminate integration drift and ensure stability.
   - Computes linear forces (motor thrust, gravity, linear aerodynamic drag) and rotational torques (differential motor thrust, angular drag) in the drone's local coordinate frame.

2. **Stabilization & Flight Modes**
   - **Acro Mode (Rate)**: Stick inputs map to target angular rotation rates. Uses a custom gyroscope-driven PID loop (Betaflight-style, with D-term on measurement to prevent setpoint kicks).
   - **Angle Mode (Stabilized)**: Pitch and Roll stick inputs map to absolute target angles (up to 45°). Uses a cascade loop (outer proportional angle loop feeding the inner rate PID controller).

3. **Gamepad & Radio Controller Support**
   - Standard Web Gamepad API polling.
   - Built-in interactive **Axes Calibration Dashboard** to map and calibrate endpoints (min, max, center, deadbands, and channels inversion). Works with RadioMaster (TX16S, Boxer, Zorro), FrSky, and other RC transmitters.

4. **Monospaced Betaflight-Style OSD HUD**
   - Emulates real Betaflight telemetry: armed state, flight mode, simulated RSSI, battery voltage (voltage drop scaled to motor thrust output), flight timer.
   - Real-time **Artificial Horizon** ladder that translates and rotates matching the drone's spatial attitude.
   - **Racing lap timer & gate counter**: tracks checkpoints and best lap times.

5. **MultiGP Race Track**
   - Emissive glow-in-the-dark racing gates arranged in a figure-eight loop.
   - Visual guidance: next target gate automatically highlights in neon cyan, while the Start/Finish gate glows green.
   - Bounding sphere collision volumes detect gate crossings and frame impacts.

6. **Propellers visual feedback**
   - Front propeller visual models spin dynamically in the bottom corners of the FPV camera view to replicate real quadcopter FPV camera feeds.

---

## Controls

### Keyboard Controls (Fallback)
- **Arm / Disarm**: `SPACEBAR` (Drone must be armed to fly!)
- **Throttle Up**: `W` (Increases motor thrust percentage)
- **Throttle Down**: `S` (Decreases motor thrust percentage)
- **Yaw Left / Right**: `A` / `D`
- **Roll Left / Right**: `LEFT ARROW` / `RIGHT ARROW`
- **Pitch Forward / Backward**: `UP ARROW` / `DOWN ARROW` (Nose down / Nose up)
- **Reset Position**: `R` (Resets position, velocity, and disarms)
- **Change Flight Mode**: `M` (Toggles between ACRO and ANGLE modes)

*Note: Keyboard throttle is incremental (holds its level when keys are released). Yaw, Pitch, and Roll return to center when keys are released.*

---

## Radio Controller USB Setup & Calibration

1. Turn on your radio transmitter (e.g. RadioMaster Boxer, TX16S, Zorro) and make sure it is in USB Joystick/HID mode.
2. Plug the transmitter into your computer via USB.
3. Open the simulator in the browser, scroll down to the settings panel, and select **RADIO CONTROLLER**.
4. Select your device from the dropdown menu (e.g., "FrSky Joystick" or similar).
5. Map the channels by clicking **Calibrate** for Throttle, Yaw, Pitch, and Roll:
   - For each channel, click **Calibrate** and move the corresponding stick to its absolute extremes (minimum and maximum).
   - Click **Save Calibration** to store endpoints in local storage.
   - Use the **Invert** checkbox if a channel response is backwards.
6. The live monitor shows the active stick positions. Toggle the **Arm Switch** button or use the keyboard `SPACEBAR` to arm the motors.

---

## Project Structure

```
quadsite/
├── amplify.yml             # AWS Amplify CI/CD configuration
├── tailwind.config.js      # Utility styling config
├── vite.config.ts          # Vite configuration
├── src/
│   ├── main.tsx            # Entry point
│   ├── App.tsx             # Master application container
│   ├── index.css           # Global Tailwind base styles
│   ├── types/
│   │   └── drone.ts        # Simulator, Physics, Settings, Input types
│   ├── lib/
│   │   ├── input.ts        # Keyboard and Gamepad API handlers
│   │   ├── physics.ts      # Quadcopter FDM, PID control, collision engine
│   │   └── rates.ts        # Betaflight rates, Super Rates, and Expo calculators
│   └── components/
│       ├── Simulator.tsx   # Three.js context, track layout, render loop
│       ├── HUD.tsx         # Betaflight-style OSD overlay & HUD SVG
│       └── Settings.tsx    # Calibration, Rates curves visualizer, Physics dashboard
```

---

## Build & Local Development

Install the workspace dependencies:
```bash
npm install
```

Start the local development server:
```bash
npm run dev
```

Build the optimized production bundle:
```bash
npm run build
```

Preview the build locally:
```bash
npm run preview
```

---

## CI/CD Deployment: AWS Amplify

This project is configured for one-click deployment to **AWS Amplify Console**.

### Step 1: Push code to GitHub/GitLab/Bitbucket
Create a new remote repository and push the local commits:
```bash
git remote add origin https://github.com/yourusername/your-fpv-sim-repo.git
git branch -M main
git push -u origin main
```

### Step 2: Connect Repository to AWS Amplify
1. Log in to the [AWS Management Console](https://aws.amazon.com/) and navigate to **AWS Amplify**.
2. Click **Deploy an app** or **New App** > **Host web app**.
3. Select **GitHub** (or your chosen Git provider) and authorize AWS Amplify to access your repositories.
4. Select your repository name and select the `main` branch.
5. Amplify will automatically detect the `amplify.yml` build specification included in the repository root.
6. Click **Save and Deploy**.

Amplify will compile the Vite React bundle and host the assets on an Amazon CloudFront CDN, serving it under SSL with automatic branch deploys on every subsequent git push.
