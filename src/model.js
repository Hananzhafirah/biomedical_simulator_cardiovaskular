/*
  model.js
  --------------------------------------------------------------------------
  Educational HFrEF + dobutamine infusion model.

  Causal chain:
    CO target/manual command -> controller -> infusion pump -> dobutamine PK
    -> exposure z -> Ees/Ea/EDV/HR -> SV/EF/CO -> feedback + 3D visualization

  IMPORTANT:
  Educational simulator only. Not a clinical dosing or treatment tool.
*/

export const PARAMS = Object.freeze({
  // Baseline HFrEF operating point
  HR0: 75.0,         // bpm
  HRGainRef: 8.0,    // bpm increase at z=1; bounded educational assumption
  HRMin: 55.0,
  HRMax: 95.0,
  Ees0: 0.9,         // mmHg/mL
  EDV0: 173.0,       // mL
  V0: 25.0,          // mL
  SV0: 40.6,         // mL/beat

  // Dobutamine PK
  Vd: 0.202,         // L/kg
  halfLife: 2.37,    // min
  uRef: 5.0,         // µg/kg/min reference

  // Exposure / failure simulation domain
  zMax: 1.50,        // dimensionless; model cap, NOT a clinical toxicity threshold
  overDeliveryFactor: 1.50, // 150% actuator over-delivery failure

  // Infusion-pump actuator
  tauPump: 0.05,     // min = 3 s simulation assumption

  // Pressure display approximation
  CVP: 5.0,          // mmHg
  MAP0: 80.0,        // mmHg
  PP0: 35.0          // mmHg
});

export function derivedConstants() {
  const p = PARAMS;
  const ke = Math.log(2) / p.halfLife;

  // SV = Ees/(Ees+Ea) * (EDV-V0), solved for Ea.
  const Ea0 = p.Ees0 * (p.EDV0 - p.V0) / p.SV0 - p.Ees0;
  const CO0 = p.HR0 * p.SV0 / 1000.0;
  const CssRef = p.uRef / (p.Vd * ke);

  const Rsys0 = (p.MAP0 - p.CVP) / CO0;
  const Ca = p.SV0 / p.PP0;

  return { ke, Ea0, CO0, CssRef, Rsys0, Ca };
}

const D = derivedConstants();

export function heartFromExposure(zRaw) {
  const p = PARAMS;

  // zRaw is the PK-derived normalized exposure.
  // z = 1.0 means reference exposure, NOT a toxicity threshold.
  // The heart-response model is capped at zMax to avoid unlimited extrapolation.
  const zUnclamped = Math.max(0, zRaw);
  const z = Math.min(p.zMax, zUnclamped);

  // Dobutamine response model around the reference exposure.
  const Ees = p.Ees0 * (1 + 0.41 * z);
  const Ea = D.Ea0 * (1 - 0.23 * z);
  const EDV = p.EDV0 * (1 - 0.04 * z);

  // Mild chronotropic contribution for visualization/model coupling.
  // This term is deliberately bounded and is an educational assumption.
  const HR = Math.max(
    p.HRMin,
    Math.min(p.HRMax, p.HR0 + p.HRGainRef * z)
  );

  // Ventricular-arterial coupling
  const ESV = (Ea * EDV + Ees * p.V0) / (Ea + Ees);
  const SV = EDV - ESV;
  const EF = 100 * SV / EDV;
  const CO = HR * SV / 1000.0;

  // Display-only pressure approximation
  const Rsys = D.Rsys0 * (1 - 0.23 * z);
  const MAP = p.CVP + CO * Rsys;
  const PP = SV / D.Ca;
  const DBP = MAP - PP / 3;
  const SBP = DBP + PP;

  return { z, zRaw: zUnclamped, HR, Ees, Ea, EDV, ESV, SV, EF, CO, MAP, SBP, DBP, Rsys };
}

export function linearizedPlant() {
  const h = 1e-5;
  const co0 = heartFromExposure(0).CO;
  const kCO = (heartFromExposure(h).CO - co0) / h;

  // x = [z, u_actual]^T
  const A = [
    [-D.ke, D.ke / PARAMS.uRef],
    [0, -1 / PARAMS.tauPump]
  ];
  const B = [[0], [1 / PARAMS.tauPump]];
  const C = [[kCO, 0]];
  const Dm = [[0]];

  const dcGain = kCO / PARAMS.uRef;
  return { A, B, C, D: Dm, kCO, dcGain };
}

export function deliveryFactor(failure = 'normal') {
  if (failure === 'partial') return 0.50;
  if (failure === 'occlusion') return 0.00;
  if (failure === 'overdelivery') return PARAMS.overDeliveryFactor;
  return 1.00;
}

export function steadyStateAtDose(commandDose, failure = 'normal') {
  const alpha = deliveryFactor(failure);
  const delivered = Math.max(0, commandDose) * alpha;
  const zRaw = delivered / PARAMS.uRef;
  return { delivered, ...heartFromExposure(zRaw) };
}

export class DobutamineCardioSim {
  constructor() {
    this.reset();
  }

  reset() {
    this.t = 0;
    this.Cp = 0;
    this.uActual = 0;
    this.integral = 0;
    this.prevError = 0;
    this.last = heartFromExposure(0);
    this.last.uCommand = 0;
    this.last.uActual = 0;
    this.last.Cp = 0;
    this.last.error = 0;
    this.last.alpha = 1;
    this.last.saturated = false;
  }

  step(dt, cfg) {
    const alpha = deliveryFactor(cfg.failure);

    const minDose = Math.max(0, Math.min(cfg.minDose, cfg.maxDose));
    const maxDose = Math.max(minDose, cfg.maxDose);
    const measuredCO = this.last.CO;
    const error = cfg.targetCO - measuredCO;
    let uCommand;

    if (cfg.mode === 'manual') {
      // Open-loop comparison mode: user sets the command directly.
      uCommand = cfg.manualDose;
      this.integral = 0;
    } else {
      // Closed-loop PID mode
      const derivative = dt > 0 ? (error - this.prevError) / dt : 0;
      const provisional =
        cfg.Kp * error +
        cfg.Ki * this.integral +
        cfg.Kd * derivative;

      uCommand = Math.max(minDose, Math.min(maxDose, provisional));

      // Conditional integration anti-windup
      const atUpper = provisional > maxDose;
      const atLower = provisional < minDose;
      if (
        (!atUpper && !atLower) ||
        (atUpper && error < 0) ||
        (atLower && error > 0)
      ) {
        this.integral += error * dt;
      }
    }

    uCommand = Math.max(minDose, Math.min(maxDose, uCommand));

    // First-order pump dynamics + delivery failure multiplier
    const uTarget = alpha * uCommand;
    this.uActual += dt * (uTarget - this.uActual) / PARAMS.tauPump;
    this.uActual = Math.max(0, this.uActual);

    // One-compartment PK
    this.Cp += dt * (this.uActual / PARAMS.Vd - D.ke * this.Cp);
    this.Cp = Math.max(0, this.Cp);

    const zRaw = this.Cp / D.CssRef;
    this.last = heartFromExposure(zRaw);
    this.last.uCommand = uCommand;
    this.last.uActual = this.uActual;
    this.last.Cp = this.Cp;
    this.last.error = error;
    this.last.alpha = alpha;
    this.last.saturated =
      uCommand >= maxDose - 1e-3 ||
      uCommand <= minDose + 1e-3;

    this.prevError = error;
    this.t += dt;
    return this.last;
  }
}

export const CONSTANTS = D;
