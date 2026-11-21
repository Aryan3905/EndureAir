# EndureAir — Boeing 787 Dreamliner 3D Scrollytelling & Live MySQL Workbench

A production-quality, scroll-driven 3D WebGL aerospace disassembly experience and live MySQL 8.0 reservation platform inspired by the Boeing 787-9 Dreamliner.

---

## 1. Technology Stack & Architecture

- **Frontend Framework:** React 18 + Vite 6 + TypeScript
- **3D & WebGL Engine:** Three.js + React Three Fiber (`@react-three/fiber`) + Drei (`@react-three/drei`)
- **Scroll Animation Engine:** GSAP 3 (`ScrollTrigger` scrub master timeline) + Lenis smooth scrolling
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`)
- **3D Model Asset:** `public/models/boeing787.glb` (Binary glTF 2.0 with 17 individually separated, named aircraft component nodes)
- **Live Backend & Database:** Node.js (`server.js`) connected live to **MySQL 8.0 (`endure_air_db`)**

### Modular Source Tree

```text
├── public/
│   └── models/
│       └── boeing787.glb              # 17-part articulated Boeing 787-9 3D glTF binary model
├── scripts/
│   └── generate_boeing787_glb.mjs     # Procedural CAD/glTF 2.0 generator for boeing787.glb
├── src/
│   ├── config/
│   │   └── animationConfig.ts         # Camera keyframes, 3D disassembly vectors, scene copy
│   ├── components/
│   │   ├── AircraftScene.tsx          # Pinned R3F Canvas, 3D mountain terrain, dynamic lighting
│   │   ├── AircraftModel.tsx          # GLB loader, deterministic part interpolation, 3D callouts
│   │   ├── AircraftComponents.tsx     # Hierarchy inspector, ComponentRegistry, PBR sub-assemblies
│   │   ├── CabinInterior.tsx          # 3D Sky Interior, C-frames, bins, cockpit, 30 MySQL seats
│   │   ├── ScrollController.tsx       # Lenis + GSAP ScrollTrigger labeled master timeline
│   │   ├── CameraRig.tsx              # Smooth damped camera controller & responsive framing
│   │   ├── SceneOverlay.tsx           # Minimal navbar, scene progress rail, MySQL & Admin modals
│   │   └── LoadingScreen.tsx          # Aerospace telemetry loading & GLB hierarchy verifier
│   ├── App.tsx                        # Main 5-scene scrollytelling experience container
│   ├── main.tsx                       # React DOM root
│   └── index.css                      # Tailwind CSS & typography rules
├── server.js                          # Live MySQL 8.0 API & static production bundle server
└── schema.sql                         # MySQL 8.0 schema, stored procedures, triggers, 30 seats
```

---

## 2. The 5-Scene Continuous Scrollytelling Sequence

The GSAP `ScrollTrigger` master timeline (`ScrollController.tsx`) drives six normalized labels (`intro` → `rotation` → `exploded` → `cutaway` → `cabin` → `final`):

1. **SCENE 01 — THE DREAMLINER (`intro`)**:
   - The complete 3D Boeing 787-9 in blue-and-white livery flies above a 3D Alpine mountain range with warm golden directional sunlight, valley mist, and subtle aerodynamic banking.
   - Copy: *"THE ENGINEERING OF FLIGHT"* / **"Beyond the Surface."** / *"Discover the engineering behind the extraordinary."*
2. **SCENE 02 — THE AIRCRAFT ROTATES (`rotation`)**:
   - The pinned 3D camera transitions from a three-quarter hero angle to an architectural side inspection profile while 3D cyan leader-line callouts identify the CFRP Monocoque Fuselage, Raked Supercritical Wings, GEnx-1B Turbofans, and Swept Empennage.
3. **SCENE 03 — THE EXPLODED VIEW (`exploded`)**:
   - Dismantles the 17 aircraft nodes outward along deterministic 3D vectors aligned with the aircraft's coordinate axes (`+Z` nose/cockpit, `±Z` forward/aft fuselage barrels, `±X` swept wings, `-Z/+Y/±X` tail stabilizers, `±X/-Y` GEnx engines, `-Y` landing gear bogies, `+Y` upper crown shell).
   - Copy: **"Every Detail. By Design."** / *"Precision engineering connects thousands of individual components into one extraordinary aircraft."*
4. **SCENE 04 — THE FUSELAGE OPENS (`cutaway`)**:
   - Transitions from exterior mountain sunlight to controlled studio lighting while separating the upper fuselage crown to reveal the circumferential carbon-fiber C-frame ribs, cockpit flight deck, lower LD3 cargo bay, overhead bins, and 30 passenger seats.
   - Copy: **"Inside the Extraordinary."** / *"Explore the space, structure, and design that shape every journey."*
5. **SCENE 05 — THE CABIN AND SEATS REVEAL (`cabin` → `final`)**:
   - Moves the exterior fuselage shell completely out of the viewing area and transitions the camera inside the Boeing Sky Interior cabin, dollying forward down the center aisle between the **30 interactive PBR passenger seats (`#01`–`#30`)**.
   - Copy: **"Designed Around You."** / *"Every journey begins with thousands of carefully engineered details."*

---

## 3. 3D Model Hierarchy & Replacing / Customizing the `.glb`

`public/models/boeing787.glb` contains 17 separated named nodes inspected at runtime by `inspectAndPrepareAircraftModel()` in `src/components/AircraftComponents.tsx`:

- `Nose_Cockpit_Assembly`
- `Fuselage_Upper_Crown_Forward` & `Fuselage_Upper_Crown_Aft`
- `Fuselage_Lower_Belly_Forward` & `Fuselage_Lower_Belly_Aft`
- `Tail_Cone_Assembly`
- `Wing_Left_Assembly` & `Wing_Right_Assembly`
- `Tail_Vertical_Stabilizer`, `Tail_Horizontal_Stabilizer_L`, `Tail_Horizontal_Stabilizer_R`
- `Engine_GEnx_Left` & `Engine_GEnx_Right`
- `Landing_Gear_Nose`, `Landing_Gear_Main_L`, `Landing_Gear_Main_R`
- `Cabin_Interior_Structure`

To swap in an external CAD/Blender `.glb` model, place it at `public/models/boeing787.glb` and either name its top-level groups using the keys above or update `SEMANTIC_COMPONENT_MAP` in `src/components/AircraftComponents.tsx`. To tune explosion distances or camera angles, edit `PART_DISASSEMBLY_VECTORS` and `CAMERA_KEYFRAMES` in `src/config/animationConfig.ts`.

---

## 4. Running Locally & Live MySQL 8.0 Verification

### Build & Start Production Server (Port 3000)

```powershell
# 1. Regenerate GLB & build Vite production bundle into dist/
npm run build

# 2. Start the Node + MySQL 8.0 server on http://localhost:3000
node server.js
```

### Live MySQL & Admin Console Credentials

- **URL:** `http://localhost:3000`
- **Admin Button (`🔒 Admin` in top-right navbar):**
  - **Username:** `admin`
  - **Password:** `admin123`
- **Interactive 3D Cabin Seats (`#01`–`#30`):**
  - Click any 3D seat in Scene 04/05 or open **Reserve Seat** in the top navigation bar to book or release seats directly in MySQL 8.0 (`endure_air_db`).
