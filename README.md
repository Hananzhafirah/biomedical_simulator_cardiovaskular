# Biomedical Cardiovascular Simulator — 3-page web edition

This package contains a scroll-first three-page website built from the supplied simulator and visual reference.

- `index.html` — Beranda / overview
- `detail.html` — detailed theory, equations, failure modes and references
- `simulation.html` — original interactive simulator, now wrapped in the shared navigation and failure-demo guide

The existing simulator source remains in `src/`, and the 3D heart remains in `assets/heart.glb`.

Because JavaScript modules are used, serve the folder over HTTP:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

> Educational simulation only. Not a clinical dosing calculator or decision-support system.

---

# Dobutamine Cardiovascular Control Simulator

A static browser-based educational simulator for a **human HFrEF cardiovascular plant controlled by a dobutamine infusion pump**. The project was designed for a biomedical control-systems assignment and is intentionally bounded so every block can be explained mathematically.

## What is included

- Human HFrEF baseline calibrated from an adult dilated-cardiomyopathy model.
- Dobutamine one-compartment pharmacokinetics.
- Dobutamine pharmacodynamic mapping to ventricular contractility / arterial load.
- Infusion-pump actuator dynamics.
- Closed-loop PID controller targeting cardiac output.
- Failure modes: 50% delivery and pump occlusion.
- Live outputs: HR, BP, MAP, SV, CO, EF, dose, plasma concentration, Ees.
- Local state-space linearization shown inside the web page.
- Procedural 3D beating heart visualization, with optional `heart.glb` support.
- Fully static: suitable for **GitHub Pages**.

> Educational simulation only. It is not a dosing calculator or clinical decision-support system.

## Architecture

```text
CO target
   |
   v
PID controller
   |
   v
Infusion pump  ---- failure factor α
   |
   v
Dobutamine PK: dCp/dt = u/Vd - ke Cp
   |
   v
Normalized exposure z = Cp/Css,5
   |
   +--> Ees = Ees0(1 + 0.41z)
   +--> Ea  = Ea0 (1 - 0.23z)
   +--> EDV = EDV0(1 - 0.04z)
   |
   v
Human LV model
   |
   +--> SV / EF / CO / estimated BP-MAP
   |
   +-------------------------- feedback CO
```

The conceptual organization is inspired by the supplied `cardio.zip` lumped cardiovascular simulator: plant, sensor, comparator, controller, actuator and feedback are kept separate. This repository intentionally uses a smaller left-ventricular plant rather than copying the full eight-compartment circulation, because the assignment focus is dobutamine infusion control.

## Run locally

Because the 3D code uses JavaScript modules, serve the directory over HTTP instead of opening `index.html` directly:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deploy on GitHub Pages

1. Create a new GitHub repository.
2. Upload the **contents** of this folder to the repository root.
3. Commit and push to `main`.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch `main` and folder `/ (root)`.
7. Save. GitHub will provide the public Pages URL after deployment.

No Python server is required in production; Three.js and Plotly are loaded from public CDNs.

## Optional 3D heart model

The app first tries to load:

```text
assets/heart.glb
```

If the file is not present, it automatically uses the built-in procedural four-chamber visualization.

If you use a Sketchfab or other external model, verify its download permission/license and fill in `assets/ATTRIBUTION.md`.

## State-space model

The nonlinear simulation uses pump dynamics, pharmacokinetics and nonlinear ventricular-arterial coupling. For control analysis it is linearized around the HFrEF baseline.

Define:

- `z = Cp / Css,5`
- `u_actual` = delivered infusion rate
- `u_command` = controller output

with time in minutes:

```text
dz/dt        = -ke z + (ke/uRef) u_actual
du_actual/dt = -(1/tauPump) u_actual + (1/tauPump) u_command
ΔCO          ≈ kCO z
```

Thus

```text
x = [z, u_actual]^T
xdot = A x + B u_command
ΔCO = C x + D u_command
```

The page computes the local `C`/`kCO` term numerically from the same nonlinear equations used by the simulator, so the documentation and running model stay consistent.

## PID controller

```text
e(t) = CO_target - CO_measured
u_command = sat(Kp e + Ki ∫e dt + Kd de/dt)
```

The default `Kd = 0`, so the starting configuration behaves as a PI controller. The integral term uses conditional anti-windup when the dose command hits its bounds.

## Main model files

- `src/model.js` — physiology, PK/PD, pump state-space and PID-ready plant.
- `src/visual3d.js` — procedural 3D visualization + optional GLB loader.
- `src/app.js` — UI, simulation loop, plots and PID controller interaction.
- `MODEL.md` — equations and assumptions in report-ready form.
- `REFERENCES.md` — scientific sources.

## Important modeling limits

- The baseline model represents **HFrEF/DCM**, not all forms of heart failure.
- The human dobutamine study provides responses at a reference infusion of 5 µg/kg/min. Interpolation between zero and this reference exposure is a modeling assumption.
- HR is held fixed at 75 bpm in the bounded model. Human studies show dobutamine responses are variable; the model is not a general patient simulator.
- BP/MAP are educational display estimates based on a simplified systemic resistance/compliance mapping. They are not used as the main controlled variable.
- The 3D heart is a visualization layer, not an anatomical/finite-element model.

## License

Project code: MIT (see `LICENSE`). Scientific references retain their original copyrights/licenses.

## Penyesuaian gaya halaman simulasi
Versi ini menggunakan tema ungu gelap/glassmorphism pada halaman `simulation.html` agar konsisten dengan halaman Beranda dan Lihat Detail. Logika model, PID, PK/PD, failure mode, grafik, dan visualisasi 3D tidak diubah; yang disesuaikan adalah presentasi visual, warna plot, serta latar 3D.
