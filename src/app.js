import {
  DobutamineCardioSim,
  PARAMS,
  CONSTANTS,
  heartFromExposure,
  steadyStateAtDose,
  deliveryFactor,
  linearizedPlant
} from './model.js';

const $ = id => document.getElementById(id);
const sim = new DobutamineCardioSim();

// ---------------------------------------------------------------------------
// 3D visualization safe fallback
// ---------------------------------------------------------------------------
let visual = { setMetrics() {} };

async function initVisual3D() {
  const container = $('threeContainer');
  try {
    const module = await import('./visual3d.js');
    visual = new module.Cardio3D(container);
    if (sim.last) sendTo3D(sim.last);
  } catch (error) {
    console.error('Kesalahan visualisasi 3D:', error);
    if (container) {
      container.innerHTML = `
        <div style="padding:24px;color:#9f3e39;background:#fff4f2;height:100%;box-sizing:border-box">
          <strong>Kesalahan visualisasi 3D</strong><br><br>${error.message}
        </div>`;
    }
  }
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------
let running = false;
let lastFrame = performance.now();
let responseAccumulator = 0;
let ecgAccumulator = 0;
let responsePlotReady = false;
let ecgPlotReady = false;

let history = {
  t: [],
  co: [],
  target: [],
  command: [],
  dose: [],
  cp: [],
  hr: []
};

function cfg() {
  return {
    mode: $('controlMode').value,
    targetCO: +$('targetCo').value,
    manualDose: +$('manualDose').value,
    Kp: +$('kp').value,
    Ki: +$('ki').value,
    Kd: +$('kd').value,
    minDose: +$('minDose').value,
    maxDose: +$('maxDose').value,
    failure: $('failureMode').value
  };
}

function alphaFromFailure(failure) {
  return deliveryFactor(failure);
}

// ---------------------------------------------------------------------------
// UI / mode explanation
// ---------------------------------------------------------------------------
function syncLabels() {
  const c = cfg();

  $('targetCoValue').textContent = `${c.targetCO.toFixed(2)} L/min`;
  $('manualDoseValue').textContent = `${c.manualDose.toFixed(2)} µg/kg/min`;
  $('minDoseValue').textContent = `${c.minDose.toFixed(1)} µg/kg/min`;
  $('maxDoseValue').textContent = `${c.maxDose.toFixed(1)} µg/kg/min`;
  $('speedValue').textContent = `${$('simSpeed').value}×`;

  // Keep bounds logically ordered.
  if (c.minDose > c.maxDose) {
    $('maxDose').value = c.minDose;
  }

  $('manualDose').min = String(+$('minDose').value);
  $('manualDose').max = String(+$('maxDose').value);

  const pidMode = $('controlMode').value === 'pid';
  $('manualDose').disabled = pidMode;
  for (const id of ['kp', 'ki', 'kd', 'targetCo']) {
    $(id).disabled = !pidMode;
  }

  $('modeHelp').innerHTML = pidMode
    ? '<strong>PID closed-loop:</strong> pengendali otomatis mengubah dosis perintah untuk memperkecil error CO. Output selalu dibatasi oleh minimum dan maximum dose.'
    : '<strong>Manual open-loop:</strong> dosis ditentukan langsung oleh pengguna. Mode ini dipakai sebagai pembanding untuk mengevaluasi manfaat feedback PID; Kp, Ki, Kd, dan target CO tidak mengendalikan pump.';
}

function sendTo3D(o) {
  visual.setMetrics({
    HR: o.HR,
    Ees: o.Ees,
    SV: o.SV,
    CO: o.CO,
    Dose: o.uActual,
    Cp: o.Cp
  });
}

function updateMetrics(o) {
  $('mHR').textContent = o.HR.toFixed(0);
  $('mBP').textContent = `${o.SBP.toFixed(0)}/${o.DBP.toFixed(0)}`;
  $('mMAP').textContent = o.MAP.toFixed(0);
  $('mCO').textContent = o.CO.toFixed(2);
  $('mSV').textContent = o.SV.toFixed(1);
  $('mEF').textContent = o.EF.toFixed(1);
  $('mDoseCmd').textContent = o.uCommand.toFixed(2);
  $('mDoseActual').textContent = o.uActual.toFixed(2);
  $('mCp').textContent = o.Cp.toFixed(1);
  $('mZ').textContent = (o.zRaw ?? o.z).toFixed(2);
  $('mEes').textContent = o.Ees.toFixed(3);

  sendTo3D(o);

  const c = cfg();
  const alarm = $('alarmBox');
  alarm.className = 'alarm';

  if (c.failure === 'occlusion') {
    alarm.textContent =
      'Occlusion pump: dosis perintah dapat meningkat, tetapi dosis aktual menuju 0; Cp dan exposure z kemudian turun.';
    alarm.classList.add('danger');

  } else if (c.failure === 'partial') {
    alarm.textContent =
      'Partial delivery: hanya 50% dosis perintah menjadi target delivery pump sehingga Cp dan exposure z lebih rendah.';
    alarm.classList.add('warn');

  } else if (c.failure === 'overdelivery') {
    const factor = alphaFromFailure(c.failure);
    alarm.textContent =
      `Failure over-delivery: pump menargetkan ${(factor * 100).toFixed(0)}% dosis perintah. ` +
      `Exposure z saat ini ${(o.zRaw ?? o.z).toFixed(2)} (z = 1.00 adalah exposure referensi, bukan ambang toksisitas).`;
    alarm.classList.add('danger');

  } else if ((o.zRaw ?? o.z) > 1.0) {
    alarm.textContent =
      `Exposure di atas referensi: z = ${(o.zRaw ?? o.z).toFixed(2)}. ` +
      `Ini menunjukkan exposure di atas referensi model, bukan otomatis ambang toksisitas klinis.`;
    alarm.classList.add('warn');

  } else if (c.mode === 'pid' && o.saturated && Math.abs(o.error) > 0.05) {
    alarm.textContent =
      'Pengendali berada pada batas dosis (saturation). Target mungkin berada di luar rentang yang dapat dicapai model.';
    alarm.classList.add('warn');

  } else {
    alarm.textContent =
      `${c.mode === 'pid' ? 'Closed-loop' : 'Open-loop'} · ` +
      `Error CO ${(c.targetCO - o.CO).toFixed(2)} L/min · ` +
      `z ${(o.zRaw ?? o.z).toFixed(2)}.`;
  }

  updateControlEvaluation(o);
}

// ---------------------------------------------------------------------------
// Closed-loop / open-loop response chart
// ---------------------------------------------------------------------------
function responseLayout() {
  return {
    autosize: true,
    margin: { l: 58, r: 62, t: 28, b: 48 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, system-ui, sans-serif', color: '#c9b8dc', size: 11 },
    xaxis: {
      title: 'Waktu (min)',
      gridcolor: 'rgba(255,255,255,0.085)',
      zeroline: false,
      autorange: true
    },
    yaxis: {
      title: 'Cardiac output (L/min)',
      range: [2.7, 4.8],
      gridcolor: 'rgba(255,255,255,0.085)',
      zeroline: false
    },
    yaxis2: {
      title: 'Dosis (µg/kg/min)',
      overlaying: 'y',
      side: 'right',
      autorange: true,
      rangemode: 'tozero',
      showgrid: false,
      zeroline: false
    },
    legend: { orientation: 'h', x: 0, y: 1.15 },
    hovermode: 'x unified'
  };
}

function responseTraces() {
  return [
    {
      x: [0], y: [sim.last.CO],
      type: 'scatter', mode: 'lines+markers', name: 'CO', yaxis: 'y',
      line: { width: 2.5, color: '#e14c9a' }, marker: { size: 4 }
    },
    {
      x: [0], y: [cfg().targetCO],
      type: 'scatter', mode: 'lines', name: 'Target CO', yaxis: 'y',
      line: { width: 1.4, dash: 'dash', color: '#91e9ff' }
    },
    {
      x: [0], y: [0],
      type: 'scatter', mode: 'lines', name: 'Dosis perintah', yaxis: 'y2',
      line: { width: 1.3, dash: 'dot', color: '#c784ff' }
    },
    {
      x: [0], y: [0],
      type: 'scatter', mode: 'lines+markers', name: 'Dosis aktual', yaxis: 'y2',
      line: { width: 2.0, color: '#4fd7ff' }, marker: { size: 3 }
    }
  ];
}

function initResponsePlot() {
  if (!window.Plotly) {
    $('responseChart').textContent = 'Plotly gagal dimuat. Periksa koneksi internet/CDN.';
    return;
  }
  Plotly.purge('responseChart');
  Plotly.newPlot(
    'responseChart',
    responseTraces(),
    responseLayout(),
    { responsive: true, displaylogo: false, scrollZoom: false }
  );
  responsePlotReady = true;
}

function appendResponsePlot(o) {
  if (!responsePlotReady || !window.Plotly) return;

  const t = sim.t;
  history.t.push(t);
  history.co.push(o.CO);
  history.target.push(cfg().targetCO);
  history.command.push(o.uCommand);
  history.dose.push(o.uActual);
  history.cp.push(o.Cp);
  history.hr.push(o.HR);

  const MAX_POINTS = 1200;
  if (history.t.length > MAX_POINTS) {
    for (const key of Object.keys(history)) history[key].shift();
  }

  Plotly.extendTraces(
    'responseChart',
    {
      x: [[t], [t], [t], [t]],
      y: [[o.CO], [cfg().targetCO], [o.uCommand], [o.uActual]]
    },
    [0, 1, 2, 3],
    MAX_POINTS
  );
}

// ---------------------------------------------------------------------------
// Synthetic ECG P-QRS-T visualization (educational, not diagnostic)
// ---------------------------------------------------------------------------
function gaussian(x, mu, sigma, amp) {
  const d = (x - mu) / sigma;
  return amp * Math.exp(-0.5 * d * d);
}

function ecgValue(phase, t) {
  // Composite educational P-QRS-T morphology.
  const P = gaussian(phase, 0.18, 0.035, 0.12);
  const Q = gaussian(phase, 0.355, 0.012, -0.16);
  const R = gaussian(phase, 0.390, 0.010, 1.05);
  const S = gaussian(phase, 0.425, 0.014, -0.28);
  const T = gaussian(phase, 0.650, 0.055, 0.32);
  const baseline = 0.015 * Math.sin(2 * Math.PI * 0.25 * t);
  return P + Q + R + S + T + baseline;
}

function buildECG(hr, nowSec) {
  const windowSec = 4.0;
  const n = 520;
  const x = [];
  const y = [];
  const bpm = Math.max(35, Math.min(180, hr));

  for (let i = 0; i < n; i++) {
    const rel = -windowSec + (windowSec * i) / (n - 1);
    const absT = nowSec + rel;
    const rawPhase = absT * bpm / 60;
    const phase = ((rawPhase % 1) + 1) % 1;
    x.push(rel);
    y.push(ecgValue(phase, absT));
  }
  return { x, y };
}

function ecgLayout() {
  return {
    autosize: true,
    margin: { l: 50, r: 22, t: 18, b: 42 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, system-ui, sans-serif', color: '#c9b8dc', size: 10 },
    xaxis: {
      title: 'Time (s)',
      range: [-4, 0],
      gridcolor: 'rgba(255,255,255,0.075)',
      zeroline: false
    },
    yaxis: {
      title: 'Relative amplitude',
      range: [-0.45, 1.25],
      gridcolor: 'rgba(255,255,255,0.075)',
      zeroline: true,
      zerolinecolor: 'rgba(255,255,255,0.14)'
    },
    showlegend: false
  };
}

function initECGPlot() {
  if (!window.Plotly) return;
  const e = buildECG(sim.last.HR, performance.now() / 1000);
  Plotly.purge('ecgChart');
  Plotly.newPlot(
    'ecgChart',
    [{
      x: e.x,
      y: e.y,
      type: 'scatter',
      mode: 'lines',
      line: { width: 2, color: '#61e2ff' },
      hoverinfo: 'skip'
    }],
    ecgLayout(),
    { responsive: true, displaylogo: false, staticPlot: true }
  );
  ecgPlotReady = true;
}

function updateECGPlot(nowSec) {
  if (!ecgPlotReady || !window.Plotly) return;
  const e = buildECG(sim.last.HR, nowSec);
  Plotly.restyle('ecgChart', { x: [e.x], y: [e.y] }, [0]);
  $('ecgHR').textContent = `${sim.last.HR.toFixed(0)} bpm`;
}

// ---------------------------------------------------------------------------
// Control evaluation
// ---------------------------------------------------------------------------
function calculateSettlingTime(target) {
  if (history.t.length < 8) return null;
  const tol = Math.max(0.03, Math.abs(target) * 0.02); // ±2%

  for (let i = 0; i < history.t.length; i++) {
    const span = history.t[history.t.length - 1] - history.t[i];
    if (span < 0.5) continue;

    let allInside = true;
    for (let j = i; j < history.co.length; j++) {
      if (Math.abs(history.co[j] - target) > tol) {
        allInside = false;
        break;
      }
    }
    if (allInside) return history.t[i];
  }
  return null;
}

function updateControlEvaluation(o) {
  const c = cfg();
  const low = steadyStateAtDose(c.minDose, c.failure);
  const high = steadyStateAtDose(c.maxDose, c.failure);
  const reachableMin = Math.min(low.CO, high.CO);
  const reachableMax = Math.max(low.CO, high.CO);

  const peak = history.co.length ? Math.max(...history.co, o.CO) : o.CO;
  const overshoot = Math.max(0, ((peak - c.targetCO) / Math.max(c.targetCO, 0.1)) * 100);
  const settling = calculateSettlingTime(c.targetCO);
  const absError = Math.abs(c.targetCO - o.CO);

  $('evalError').textContent = `${(c.targetCO - o.CO).toFixed(2)} L/min`;
  $('evalPeak').textContent = `${peak.toFixed(2)} L/min`;
  $('evalOvershoot').textContent = `${overshoot.toFixed(1)} %`;
  $('evalSettling').textContent = settling == null ? '—' : `${settling.toFixed(2)} min`;
  $('evalDoseRange').textContent = `${c.minDose.toFixed(1)}–${c.maxDose.toFixed(1)} µg/kg/min`;
  $('evalReachable').textContent = `${reachableMin.toFixed(2)}–${reachableMax.toFixed(2)} L/min`;

  let state = 'MELACAK';
  if (c.mode === 'manual') state = 'OPEN LOOP';
  else if (o.saturated && absError > 0.05) state = 'SATURASI';
  else if (absError <= Math.max(0.03, c.targetCO * 0.02)) state = 'DALAM ±2%';
  $('evalStatus').textContent = state;
}

// ---------------------------------------------------------------------------
// State-space / PID display
// ---------------------------------------------------------------------------
function renderStateSpace() {
  const ss = linearizedPlant();
  const f = x => Number(x).toFixed(4).replace('-0.0000', '0.0000');

  $('a11').textContent = f(ss.A[0][0]);
  $('a12').textContent = f(ss.A[0][1]);
  $('a21').textContent = f(ss.A[1][0]);
  $('a22').textContent = f(ss.A[1][1]);
  $('b11').textContent = f(ss.B[0][0]);
  $('b21').textContent = f(ss.B[1][0]);
  $('c11').textContent = f(ss.C[0][0]);
  $('c12').textContent = f(ss.C[0][1]);
  $('d11').textContent = f(ss.D[0][0]);

  $('displayDCGain').textContent = ss.dcGain.toFixed(3);
  $('displayKe').textContent = CONSTANTS.ke.toFixed(3);
  $('displayCss').textContent = CONSTANTS.CssRef.toFixed(1);

  const c = cfg();
  $('displayKp').textContent = c.Kp.toFixed(2);
  $('displayKi').textContent = c.Ki.toFixed(2);
  $('displayKd').textContent = c.Kd.toFixed(2);
}

// ---------------------------------------------------------------------------
// Reset / animation frame
// ---------------------------------------------------------------------------
function reset() {
  sim.reset();
  history = { t: [], co: [], target: [], command: [], dose: [], cp: [], hr: [] };
  responseAccumulator = 0;
  ecgAccumulator = 0;
  updateMetrics(sim.last);
  initResponsePlot();
  initECGPlot();
}

function frame(now) {
  requestAnimationFrame(frame);

  const realSec = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  // ECG is a visual waveform and remains animated even when simulation is paused.
  ecgAccumulator += realSec;
  if (ecgAccumulator >= 0.10) {
    updateECGPlot(now / 1000);
    ecgAccumulator = 0;
  }

  if (!running) return;

  const speed = +$('simSpeed').value;
  let simMin = realSec * speed / 60;
  const dtMax = 0.0025;

  while (simMin > 1e-9) {
    const dt = Math.min(dtMax, simMin);
    sim.step(dt, cfg());
    simMin -= dt;
  }

  updateMetrics(sim.last);

  responseAccumulator += realSec;
  if (responseAccumulator >= 0.18) {
    appendResponsePlot(sim.last);
    responseAccumulator = 0;
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
$('startBtn').addEventListener('click', () => {
  running = !running;
  $('startBtn').textContent = running ? 'Jeda' : 'Mulai';
  $('runStatus').textContent = running ? 'BERJALAN' : 'DIJEDA';
  $('runStatus').classList.toggle('running', running);
});

$('resetBtn').addEventListener('click', reset);

for (const id of [
  'controlMode',
  'targetCo',
  'manualDose',
  'kp',
  'ki',
  'kd',
  'minDose',
  'maxDose',
  'failureMode',
  'simSpeed'
]) {
  $(id).addEventListener('input', () => {
    syncLabels();
    renderStateSpace();
    updateControlEvaluation(sim.last);
  });
  $(id).addEventListener('change', () => {
    syncLabels();
    renderStateSpace();
    updateControlEvaluation(sim.last);
  });
}

window.addEventListener('resize', () => {
  if (!window.Plotly) return;
  if (responsePlotReady) Plotly.Plots.resize($('responseChart'));
  if (ecgPlotReady) Plotly.Plots.resize($('ecgChart'));
});

// ---------------------------------------------------------------------------
// Start application
// ---------------------------------------------------------------------------
syncLabels();
renderStateSpace();
reset();
initVisual3D();
requestAnimationFrame(frame);
