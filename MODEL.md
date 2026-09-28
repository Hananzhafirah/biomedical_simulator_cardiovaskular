# Mathematical Model Notes

## 1. Scope

The model is a deliberately reduced human HFrEF cardiovascular control system. The controlled variable is **cardiac output (CO)** and the manipulated variable is **dobutamine infusion rate**.

The complete causal chain is:

```text
CO target → PID → infusion pump → Cp → Ees/Ea/EDV → ESV → SV → CO → feedback
```

This is smaller than the eight-compartment `cardio.zip` model, but preserves its control-system decomposition: sensor/comparator/controller/actuator/plant/feedback.

---

## 2. Human HFrEF baseline

Baseline parameters used in the simulator:

| Parameter | Value | Meaning |
|---|---:|---|
| HR0 | 75 bpm | baseline heart rate; model adds a bounded exposure-dependent chronotropic term |
| Ees0 | 0.9 mmHg/mL | baseline LV end-systolic elastance |
| EDV0 | 173 mL | end-diastolic volume |
| V0 | 25 mL | zero-pressure volume |
| SV0 | 40.6 mL/beat | baseline stroke volume |

The baseline effective arterial elastance is derived from

```text
SV = Ees/(Ees + Ea) · (EDV - V0)
```

so

```text
Ea0 = Ees0(EDV0 - V0)/SV0 - Ees0
```

---

## 3. Ventricular-arterial coupling

At end systole:

```text
Pes = Ees(ESV - V0)
```

and arterial load is represented by

```text
Pes = Ea·SV
SV = EDV - ESV
```

Equating the two gives

```text
ESV = (Ea·EDV + Ees·V0)/(Ea + Ees)
```

Then

```text
SV = EDV - ESV
EF = 100·SV/EDV
CO = HR·SV/1000
```

---

## 4. Dobutamine pharmacokinetics

A one-compartment IV-infusion model is used:

```text
dCp/dt = u_actual/Vd - ke·Cp
```

with

```text
ke = ln(2)/t1/2
```

Human severe-heart-failure PK values:

```text
Vd = 0.202 L/kg
t1/2 = 2.37 min
```

At the reference dose `uRef = 5 µg/kg/min`,

```text
Css,5 = uRef/(Vd·ke)
```

and normalized drug exposure is

```text
z = Cp/Css,5
```

---

## 5. Dobutamine pharmacodynamics

The human cardiac-dysfunction study used as the reference reports, at 5 µg/kg/min:

- Ees: +41%
- Ea: −23%
- EDV: −4%

The simulator interpolates these effects linearly with normalized exposure `z`:

```text
Ees = Ees0(1 + 0.41z)
Ea  = Ea0 (1 - 0.23z)
EDV = EDV0(1 - 0.04z)
```

This continuous interpolation is a **modeling assumption**, not a published universal dose-response equation. The cardiovascular response is capped at normalized exposure z = 1.5 to limit extrapolation. z = 1 remains the reference exposure, not a toxicity threshold.

---

### Heart-rate mapping

The current implementation also uses a deliberately bounded educational chronotropic term:

```text
HR = clamp(HR0 + 8 z, 55, 95) bpm
```

The +8 bpm at z = 1 relationship is a simulation assumption, not a universal clinical dose-response law.

---

## 6. Infusion pump

The commanded dose is not assumed to appear instantaneously. A short first-order actuator is used:

```text
du_actual/dt = (α·u_command - u_actual)/tauPump
```

where

```text
alpha = 1.0  normal
alpha = 0.5  partial delivery failure
alpha = 0.0  occlusion
alpha = 1.5  over-delivery failure
```

`tauPump = 0.05 min` (3 s) is a **simulation assumption** chosen to represent a pump actuator that is much faster than the pharmacokinetic response.

---

## 7. State-space model

Use the state vector

```text
x1 = z = Cp/Css,5
x2 = u_actual
```

Then, with time in minutes,

```text
x1_dot = -ke x1 + (ke/uRef) x2
x2_dot = -(1/tauPump)x2 + (1/tauPump)u_command
```

The nonlinear cardiovascular mapping is locally linearized at the HFrEF baseline:

```text
DeltaCO ≈ kCO x1
```

Therefore

```text
A = [ -ke          ke/uRef      ]
    [  0           -1/tauPump  ]

B = [ 0         ]
    [ 1/tauPump ]

C = [ kCO   0 ]
D = [ 0 ]
```

The application calculates `kCO` numerically from its own nonlinear equations at startup.

---

## 8. PID control

The feedback error is

```text
e(t) = CO_target - CO_measured
```

The controller is

```text
u_command = sat[Kp e + Ki integral(e dt) + Kd de/dt]
```

with saturation

```text
0 <= u_command <= u_max
```

Conditional integration is used as an anti-windup mechanism.

The default `Kd = 0`, so the initial controller is effectively PI. The derivative term is exposed for control-system experiments.

---

## 9. BP/MAP display model

BP/MAP are shown because they are useful hemodynamic indicators, but they are not the controller target in this bounded project.

The display approximation uses

```text
MAP = CVP + CO·Rsys
PP = SV/Ca
DBP = MAP - PP/3
SBP = DBP + PP
```

with baseline `Rsys` and `Ca` calibrated to the chosen HFrEF display baseline. Reduction in arterial load is mapped approximately to `Rsys` for visualization. This section should be described as an approximation in a report.

---

## 10. 3D visualization

The 3D layer does not alter the equations. It visualizes:

- beat frequency from HR,
- contraction amplitude from Ees,
- aortic flow-particle speed from CO.

If `assets/heart.glb` exists, the web app loads it. Otherwise it renders a procedural four-chamber model.
