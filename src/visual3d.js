import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class Cardio3D {
  constructor(container) {
    if (!container) {
      throw new Error("3D container tidak ditemukan.");
    }

    this.container = container;

    // ========================================================
    // PHYSIOLOGY
    // ========================================================

    this.HR = 75.0;
    this.CO = 3.04;
    this.Ees = 0.9;
    this.SV = 40.6;

    this.HR0 = 75.0;
    this.CO0 = 3.04;
    this.Ees0 = 0.9;

    // ========================================================
    // TIME
    // ========================================================

    this.clock = new THREE.Clock();
    this.totalTime = 0;

    // ========================================================
    // SCENE
    // ========================================================

    this.scene = new THREE.Scene();

    this.scene.background =
      new THREE.Color(0x0d021d);

    const width =
      Math.max(container.clientWidth, 1);

    const height =
      Math.max(
        container.clientHeight || 550,
        1
      );

    // ========================================================
    // CAMERA
    // ========================================================

    this.camera =
      new THREE.PerspectiveCamera(
        40,
        width / height,
        0.01,
        200
      );

    this.camera.position.set(
      0,
      0,
      7
    );

    // ========================================================
    // RENDERER
    // ========================================================

    this.renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
      });

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        2
      )
    );

    this.renderer.setSize(
      width,
      height
    );

    this.renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    container.innerHTML = "";

    container.appendChild(
      this.renderer.domElement
    );

    // ========================================================
    // CAMERA CONTROL
    // ========================================================

    this.controls =
      new OrbitControls(
        this.camera,
        this.renderer.domElement
      );

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.controls.enableRotate = true;
    this.controls.rotateSpeed = 0.7;

    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1.0;

    this.controls.enablePan = true;
    this.controls.panSpeed = 0.7;

    this.controls.screenSpacePanning = true;

    if ("zoomToCursor" in this.controls) {
      this.controls.zoomToCursor = true;
    }

    // ========================================================
    // GROUPS
    // ========================================================

    this.heartGroup =
      new THREE.Group();

    this.flowGroup =
      new THREE.Group();

    this.scene.add(
      this.heartGroup
    );

    this.scene.add(
      this.flowGroup
    );

    // ========================================================
    // INTERNAL VARIABLES
    // ========================================================

    this.heart = null;

    this.heartParts = [];

    this.heartbeatPivot = null;

    this.flowStreams = [];

    this.mixer = null;

    this.hasGLBAnimation = false;

    // ========================================================
    // INIT
    // ========================================================

    this.createLights();

    this.loadHeart();

    window.addEventListener(
      "resize",
      () => this.onResize()
    );

    // double-click = fokus kembali ke jantung
    this.renderer.domElement.addEventListener(
      "dblclick",
      () => this.focusCameraOnHeart()
    );

    this.animate();
  }

  // ==========================================================
  // LIGHTS
  // ==========================================================

  createLights() {
    this.scene.add(
      new THREE.HemisphereLight(
        0xffffff,
        0x6f5b61,
        2.0
      )
    );

    const key =
      new THREE.DirectionalLight(
        0xffffff,
        2.4
      );

    key.position.set(
      3,
      4,
      5
    );

    this.scene.add(key);

    const fill =
      new THREE.DirectionalLight(
        0xffd0d0,
        1.0
      );

    fill.position.set(
      -4,
      2,
      3
    );

    this.scene.add(fill);

    const rim =
      new THREE.DirectionalLight(
        0xb7c8ff,
        0.6
      );

    rim.position.set(
      0,
      3,
      -5
    );

    this.scene.add(rim);
  }

  // ==========================================================
  // LOAD GLB
  // ==========================================================

  loadHeart() {
    const loader =
      new GLTFLoader();

    loader.load(
      "./assets/heart.glb",

      (gltf) => {
        this.heart =
          gltf.scene;

        // Center model
        let box =
          new THREE.Box3()
            .setFromObject(
              this.heart
            );

        const center =
          box.getCenter(
            new THREE.Vector3()
          );

        this.heart.position.sub(
          center
        );

        this.heart.updateMatrixWorld(
          true
        );

        // Scale full model
        box =
          new THREE.Box3()
            .setFromObject(
              this.heart
            );

        const size =
          box.getSize(
            new THREE.Vector3()
          );

        const maxDimension =
          Math.max(
            size.x,
            size.y,
            size.z
          ) || 1;

        this.heart.scale.setScalar(
          4.3 / maxDimension
        );

        this.heart.rotation.y =
          THREE.MathUtils.degToRad(
            5
          );

        this.heartGroup.add(
          this.heart
        );

        this.heart.updateMatrixWorld(
          true
        );

        this.heartGroup.updateMatrixWorld(
          true
        );

        // Find chambers
        this.prepareHeartParts();

        // Blood path dihitung dulu
        this.createBloodFlow();

        // Kemudian chamber dipindah ke pivot bersama
        this.createSharedHeartbeatPivot();

        // Fokus camera
        this.focusCameraOnHeart();

        // Optional native animation
        if (
          gltf.animations &&
          gltf.animations.length > 0
        ) {
          this.mixer =
            new THREE.AnimationMixer(
              this.heart
            );

          const action =
            this.mixer.clipAction(
              gltf.animations[0]
            );

          action.play();

          this.hasGLBAnimation = true;
        }

        console.log(
          "✅ cardiovascular model loaded"
        );
      },

      undefined,

      (error) => {
        console.error(
          "❌ Gagal load heart.glb",
          error
        );
      }
    );
  }

  // ==========================================================
  // OBJECT FINDER
  // ==========================================================

  findObject(names) {
    if (!Array.isArray(names)) {
      names = [names];
    }

    for (const name of names) {
      const exact =
        this.heartGroup.getObjectByName(
          name
        );

      if (exact) {
        return exact;
      }
    }

    const normalizedTargets =
      names.map(
        name =>
          name
            .toLowerCase()
            .replaceAll("_", " ")
            .trim()
      );

    let result = null;

    this.heartGroup.traverse(
      obj => {
        if (
          result ||
          !obj.name
        ) {
          return;
        }

        const normalized =
          obj.name
            .toLowerCase()
            .replaceAll("_", " ")
            .trim();

        if (
          normalizedTargets.includes(
            normalized
          )
        ) {
          result = obj;
        }
      }
    );

    return result;
  }

  // ==========================================================
  // GET HEART PARTS
  // ==========================================================

  prepareHeartParts() {
    const names = [
      [
        "Left ventricle",
        "Left Ventricle"
      ],

      [
        "Right ventricle",
        "Right Ventricle"
      ],

      [
        "Left atrium",
        "Left Atrium"
      ],

      [
        "Right atrium",
        "Right Atrium"
      ]
    ];

    this.heartParts =
      names
        .map(
          n =>
            this.findObject(n)
        )
        .filter(Boolean);

    if (
      this.heartParts.length === 0
    ) {
      console.warn(
        "Chamber jantung tidak ditemukan."
      );
    }
  }

  // ==========================================================
  // SHARED HEART PIVOT
  //
  // Semua chamber bergerak bersama.
  // Ini mencegah efek "jantung mau copot".
  // ==========================================================

  createSharedHeartbeatPivot() {
    if (
      this.heartParts.length === 0
    ) {
      return;
    }

    const box =
      new THREE.Box3();

    let initialized = false;

    for (
      const part
      of this.heartParts
    ) {
      const partBox =
        new THREE.Box3()
          .setFromObject(part);

      if (
        partBox.isEmpty()
      ) {
        continue;
      }

      if (!initialized) {
        box.copy(
          partBox
        );

        initialized = true;
      } else {
        box.union(
          partBox
        );
      }
    }

    if (!initialized) {
      return;
    }

    const centerWorld =
      box.getCenter(
        new THREE.Vector3()
      );

    this.heartbeatPivot =
      new THREE.Group();

    this.heartbeatPivot.name =
      "HeartbeatPivot";

    this.heartGroup.add(
      this.heartbeatPivot
    );

    this.heartGroup.updateMatrixWorld(
      true
    );

    const centerLocal =
      this.heartGroup.worldToLocal(
        centerWorld.clone()
      );

    this.heartbeatPivot.position.copy(
      centerLocal
    );

    this.heartbeatPivot.updateMatrixWorld(
      true
    );

    // attach() menjaga posisi world tetap sama
    for (
      const part
      of this.heartParts
    ) {
      this.heartbeatPivot.attach(
        part
      );
    }

    this.heartbeatPivot.updateMatrixWorld(
      true
    );
  }

  // ==========================================================
  // GET ANATOMICAL CENTER
  // ==========================================================

  getCenter(names) {
    const obj =
      this.findObject(
        names
      );

    if (!obj) {
      console.warn(
        "Landmark tidak ditemukan:",
        names
      );

      return null;
    }

    this.heartGroup.updateMatrixWorld(
      true
    );

    const box =
      new THREE.Box3()
        .setFromObject(obj);

    if (
      box.isEmpty()
    ) {
      return null;
    }

    return box.getCenter(
      new THREE.Vector3()
    );
  }

  // ==========================================================
  // PARTICLE
  // ==========================================================

  createBloodParticle(color) {
    // Jauh lebih kecil daripada versi sebelumnya
    const geometry =
      new THREE.SphereGeometry(
        0.0045,
        8,
        8
      );

    const material =
      new THREE.MeshStandardMaterial({
        color,

        emissive: color,

        emissiveIntensity: 0.45,

        roughness: 0.35,

        transparent: true,

        opacity: 0.82,

        // Dibuat overlay agar tetap terlihat
        depthTest: false,

        depthWrite: false
      });

    const mesh =
      new THREE.Mesh(
        geometry,
        material
      );

    mesh.renderOrder = 30;

    return mesh;
  }

  // ==========================================================
  // CREATE ONE FLOW STREAM
  // ==========================================================

  createStream({
    landmarks,
    color,
    count = 7,
    phaseType = "inflow"
  }) {
    const points =
      landmarks
        .map(
          names =>
            this.getCenter(
              names
            )
        )
        .filter(Boolean);

    if (
      points.length < 2
    ) {
      return;
    }

    const path =
      new THREE.CatmullRomCurve3(
        points,
        false,
        "centripetal",
        0.5
      );

    const particles = [];

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const mesh =
        this.createBloodParticle(
          color
        );

      const progress =
        i / count;

      mesh.position.copy(
        path.getPointAt(
          progress
        )
      );

      this.flowGroup.add(
        mesh
      );

      particles.push({
        mesh,
        progress
      });
    }

    this.flowStreams.push({
      path,
      particles,
      phaseType
    });
  }

  // ==========================================================
  // BLOOD FLOW
  //
  // Dipisah menjadi:
  // - inflow
  // - outflow
  //
  // Supaya lebih realistis terhadap fase jantung.
  // ==========================================================

  createBloodFlow() {
    this.flowStreams = [];

    for (
      const child
      of [...this.flowGroup.children]
    ) {
      this.flowGroup.remove(
        child
      );

      child.geometry?.dispose?.();

      child.material?.dispose?.();
    }

    const BLUE = 0x2b98ff;
    const RED = 0xff4055;

    // ========================================================
    // BLUE INFLOW
    // SVC -> RA -> RV
    // ========================================================

    this.createStream({
      landmarks: [
        [
          "Superior vena cava"
        ],

        [
          "Right atrium",
          "Right Atrium"
        ],

        [
          "Right ventricle",
          "Right Ventricle"
        ]
      ],

      color: BLUE,

      count: 6,

      phaseType: "inflow"
    });

    // ========================================================
    // BLUE INFLOW
    // IVC -> RA -> RV
    // ========================================================

    this.createStream({
      landmarks: [
        [
          "Inferior vena cava (thoracic part)"
        ],

        [
          "Right atrium",
          "Right Atrium"
        ],

        [
          "Right ventricle",
          "Right Ventricle"
        ]
      ],

      color: BLUE,

      count: 6,

      phaseType: "inflow"
    });

    // ========================================================
    // BLUE OUTFLOW
    // RV -> pulmonary trunk -> RPA
    // ========================================================

    this.createStream({
      landmarks: [
        [
          "Right ventricle",
          "Right Ventricle"
        ],

        [
          "Pulmonary trunk"
        ],

        [
          "Right pulmonary artery"
        ]
      ],

      color: BLUE,

      count: 7,

      phaseType: "outflow"
    });

    // ========================================================
    // BLUE OUTFLOW
    // RV -> pulmonary trunk -> LPA
    // ========================================================

    this.createStream({
      landmarks: [
        [
          "Right ventricle",
          "Right Ventricle"
        ],

        [
          "Pulmonary trunk"
        ],

        [
          "Left pulmonary artery"
        ]
      ],

      color: BLUE,

      count: 7,

      phaseType: "outflow"
    });

    // ========================================================
    // RED INFLOW
    // LSPV -> LA -> LV
    // ========================================================

    this.createStream({
      landmarks: [
        [
          "Left superior pulmonary vein"
        ],

        [
          "Left atrium",
          "Left Atrium"
        ],

        [
          "Left ventricle",
          "Left Ventricle"
        ]
      ],

      color: RED,

      count: 6,

      phaseType: "inflow"
    });

    // ========================================================
    // RED INFLOW
    // RSPV -> LA -> LV
    // ========================================================

    this.createStream({
      landmarks: [
        [
          "Right superior pulmonary vein"
        ],

        [
          "Left atrium",
          "Left Atrium"
        ],

        [
          "Left ventricle",
          "Left Ventricle"
        ]
      ],

      color: RED,

      count: 6,

      phaseType: "inflow"
    });

    // ========================================================
    // RED OUTFLOW
    // LV -> aorta
    // ========================================================

    this.createStream({
      landmarks: [
        [
          "Left ventricle",
          "Left Ventricle"
        ],

        [
          "Ascending aorta"
        ],

        [
          "Aortic arch"
        ]
      ],

      color: RED,

      count: 8,

      phaseType: "outflow"
    });
  }

  // ==========================================================
  // SIMULATION DATA
  // ==========================================================

  setMetrics({
    HR,
    Ees,
    SV,
    CO
  }) {
    if (
      Number.isFinite(HR)
    ) {
      this.HR =
        THREE.MathUtils.clamp(
          HR,
          20,
          220
        );
    }

    if (
      Number.isFinite(Ees)
    ) {
      this.Ees =
        Math.max(
          0.1,
          Ees
        );
    }

    if (
      Number.isFinite(SV)
    ) {
      this.SV =
        Math.max(
          0,
          SV
        );
    }

    if (
      Number.isFinite(CO)
    ) {
      this.CO =
        Math.max(
          0,
          CO
        );
    }
  }

  // Backward compatibility
  setPhysiology({
    hr,
    co,
    ees
  }) {
    this.setMetrics({
      HR: hr,
      CO: co,
      Ees: ees,
      SV: this.SV
    });
  }

  // ==========================================================
  // CARDIAC PHASE
  // ==========================================================

  getCardiacPhase() {
    return (
      this.totalTime *
      (
        this.HR /
        60
      )
    ) % 1;
  }

  // ==========================================================
  // HEARTBEAT
  // ==========================================================

  updateHeartbeat(dt) {
    if (!this.heart) {
      return;
    }

    // Gunakan native animation kalau ada
    if (
      this.hasGLBAnimation &&
      this.mixer
    ) {
      this.mixer.timeScale =
        this.HR /
        this.HR0;

      this.mixer.update(
        dt
      );

      return;
    }

    if (
      !this.heartbeatPivot
    ) {
      return;
    }

    const phase =
      this.getCardiacPhase();

    // Smooth systolic pulse
    const center = 0.20;
    const width = 0.08;

    const direct =
      Math.abs(
        phase -
        center
      );

    const d =
      Math.min(
        direct,
        1 -
        direct
      );

    const systole =
      Math.exp(
        -(
          d *
          d
        )
        /
        (
          2 *
          width *
          width
        )
      );

    // Ees determines contraction strength
    const inotropy =
      THREE.MathUtils.clamp(
        this.Ees /
        this.Ees0,
        0.7,
        1.8
      );

    // Jauh lebih subtle daripada versi sebelumnya
    const radialAmplitude =
      0.018 *
      inotropy;

    const longAmplitude =
      0.020 *
      inotropy;

    const sxz =
      1 -
      radialAmplitude *
      systole;

    const sy =
      1 -
      longAmplitude *
      systole;

    // SATU pivot bersama
    this.heartbeatPivot.scale.set(
      sxz,
      sy,
      sxz
    );
  }

  // ==========================================================
  // BLOOD FLOW ANIMATION
  // ==========================================================

  updateBloodFlow(dt) {
    if (
      this.flowStreams.length === 0
    ) {
      return;
    }

    const phase =
      this.getCardiacPhase();

    const coRatio =
      THREE.MathUtils.clamp(
        this.CO /
        this.CO0,
        0.3,
        2.2
      );

    const systole =
      phase >= 0.05 &&
      phase <= 0.38;

    for (
      const stream
      of this.flowStreams
    ) {
      let phaseFactor;

      // Outflow lebih cepat saat sistol
      if (
        stream.phaseType ===
        "outflow"
      ) {
        phaseFactor =
          systole
            ? 1.8
            : 0.18;
      }

      // Inflow lebih aktif saat diastol/filling
      else {
        phaseFactor =
          systole
            ? 0.45
            : 1.0;
      }

      const speed =
        0.16 *
        coRatio *
        phaseFactor;

      for (
        const particle
        of stream.particles
      ) {
        particle.progress =
          (
            particle.progress +
            dt *
            speed
          ) % 1;

        particle.mesh.position.copy(
          stream.path.getPointAt(
            particle.progress
          )
        );
      }
    }
  }

  // ==========================================================
  // CAMERA FOCUS
  // ==========================================================

  focusCameraOnHeart() {
    if (
      this.heartParts.length === 0
    ) {
      return;
    }

    const box =
      new THREE.Box3();

    let initialized = false;

    for (
      const part
      of this.heartParts
    ) {
      const b =
        new THREE.Box3()
          .setFromObject(
            part
          );

      if (
        b.isEmpty()
      ) {
        continue;
      }

      if (!initialized) {
        box.copy(b);
        initialized = true;
      } else {
        box.union(b);
      }
    }

    if (!initialized) {
      return;
    }

    const center =
      box.getCenter(
        new THREE.Vector3()
      );

    const size =
      box.getSize(
        new THREE.Vector3()
      );

    const heartSize =
      Math.max(
        size.x,
        size.y,
        size.z
      ) || 0.3;

    this.controls.target.copy(
      center
    );

    this.camera.position.set(
      center.x,
      center.y,
      center.z +
        heartSize *
        4.0
    );

    this.camera.lookAt(
      center
    );

    this.controls.minDistance =
      Math.max(
        heartSize * 0.7,
        0.12
      );

    this.controls.maxDistance =
      Math.max(
        heartSize * 25,
        10
      );

    this.controls.update();
  }

  // ==========================================================
  // LOOP
  // ==========================================================

  animate() {
    requestAnimationFrame(
      () =>
        this.animate()
    );

    const dt =
      Math.min(
        this.clock.getDelta(),
        0.05
      );

    this.totalTime += dt;

    this.updateHeartbeat(
      dt
    );

    this.updateBloodFlow(
      dt
    );

    this.controls.update();

    this.renderer.render(
      this.scene,
      this.camera
    );
  }

  // ==========================================================
  // RESIZE
  // ==========================================================

  onResize() {
    const width =
      Math.max(
        this.container.clientWidth,
        1
      );

    const height =
      Math.max(
        this.container.clientHeight ||
          550,
        1
      );

    this.camera.aspect =
      width /
      height;

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(
      width,
      height
    );
  }

  // ==========================================================
  // TEST
  // ==========================================================

  testHeartFailure() {
    this.setMetrics({
      HR: 75,
      Ees: 0.9,
      SV: 40.6,
      CO: 3.04
    });
  }

  testDobutamine() {
    this.setMetrics({
      HR: 80,
      Ees: 1.269,
      SV: 57.7,
      CO: 4.33
    });
  }
}
