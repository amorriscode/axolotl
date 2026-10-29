import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  QuadraticBezierCurve3,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const SEGMENTS = 72;
const RADIAL = 24;

const RADIUS: [number, number, number][] = [
  [0, 0.2, 1.05],
  [0.045, 0.24, 1.42],
  [0.11, 0.27, 1.72],
  [0.18, 0.22, 1.4],
  [0.26, 0.15, 1.1],
  [0.4, 0.175, 1.05],
  [0.56, 0.16, 1.02],
  [0.7, 0.11, 0.96],
  [0.84, 0.045, 0.82],
  [1, 0.012, 0.5],
];

interface Frame {
  p: Vector3;
  n: Vector3;
  b: Vector3;
  t: Vector3;
}

interface Ribbon {
  geo: BufferGeometry;
  pos: Float32Array;
  i0: number;
  count: number;
  sign: number;
}

export interface SceneOptions {
  reduced: boolean;
  onReady: () => void;
}

export class AxolotlScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly root = new Group();
  private readonly frames: Frame[];
  private readonly ry: Float32Array;
  private readonly rz: Float32Array;
  private readonly bodyPos: BufferAttribute;
  private readonly bodyGeo: BufferGeometry;
  private readonly pos: Float32Array;
  private readonly ribbons: Ribbon[];
  private readonly gills: { seg: number; side: 1 | -1; lift: number; phase: number; group: Group }[];
  private readonly eyes: { side: 1 | -1; group: Group }[];
  private readonly legs: { seg: number; side: 1 | -1; phase: number; group: Group }[];
  private readonly mouth: Group;
  private readonly water: ShaderMaterial;
  private readonly dustPos: Float32Array;
  private readonly motePos: Float32Array;
  private dust!: Points;
  private motes!: Points;
  private readonly dustT: Float32Array;
  private readonly dustSpeed: Float32Array;
  private readonly dustAng: Float32Array;
  private readonly dustRad: Float32Array;
  private readonly moteSeed: Float32Array;
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: Material[] = [];
  private readonly pmrem: PMREMGenerator;
  private readonly ro: ResizeObserver;
  private readonly look = new Vector3();
  private readonly lookTarget = new Vector3();
  private readonly _up = new Vector3();
  private readonly _z = new Vector3(0, 0, 1);
  private readonly _v1 = new Vector3();
  private readonly _v2 = new Vector3();
  private readonly _v3 = new Vector3();
  private readonly _pp = new Vector3();
  private readonly _nn = new Vector3();
  private readonly _bb = new Vector3();
  private readonly _basis = new Matrix4();
  private time = 0.85;
  private last = 0;
  private raf = 0;
  private ready = false;
  private disposed = false;
  private hidden = false;
  private offscreen = false;
  private readonly reduced: boolean;
  private readonly onReady: () => void;

  constructor(canvas: HTMLCanvasElement, options: SceneOptions) {
    this.reduced = options.reduced;
    this.onReady = options.onReady;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x07060b, 1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.camera = new PerspectiveCamera(30, 1, 0.08, 40);
    this.scene.background = new Color("#07060b");
    this.scene.fog = new FogExp2(0x07060b, 0.045);
    this.pmrem = new PMREMGenerator(this.renderer);
    const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;

    this.scene.add(new HemisphereLight(0xffece8, 0x140c18, 0.62));
    const key = new DirectionalLight(0xfff4ea, 3.4);
    key.position.set(3.4, 4.6, 4.2);
    this.scene.add(key);
    const rim = new DirectionalLight(0x8ef6ff, 2.6);
    rim.position.set(-4.2, 1.6, -3.2);
    this.scene.add(rim);
    const fill = new DirectionalLight(0xffb4c4, 0.85);
    fill.position.set(-1.5, -0.4, 3.4);
    this.scene.add(fill);

    this.frames = Array.from({ length: SEGMENTS + 1 }, () => ({
      p: new Vector3(),
      n: new Vector3(),
      b: new Vector3(),
      t: new Vector3(),
    }));
    this.ry = new Float32Array(SEGMENTS + 1);
    this.rz = new Float32Array(SEGMENTS + 1);
    for (let i = 0; i <= SEGMENTS; i++) {
      const r = radiiAt(i / SEGMENTS);
      this.ry[i] = r.y;
      this.rz[i] = r.z;
    }

    const grid = (SEGMENTS + 1) * RADIAL;
    const count = grid + 2;
    this.pos = new Float32Array(count * 3);
    const along = new Float32Array(count);
    this.bodyGeo = new BufferGeometry();
    this.bodyPos = new BufferAttribute(this.pos, 3);
    this.bodyGeo.setAttribute("position", this.bodyPos);
    this.bodyGeo.setAttribute("aAlong", new BufferAttribute(along, 1));
    const indices: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * RADIAL + j;
        const b = i * RADIAL + ((j + 1) % RADIAL);
        const c = (i + 1) * RADIAL + j;
        const d = (i + 1) * RADIAL + ((j + 1) % RADIAL);
        indices.push(a, c, b, b, c, d);
      }
    }
    const noseI = grid;
    const tailI = grid + 1;
    for (let j = 0; j < RADIAL; j++) {
      const j2 = (j + 1) % RADIAL;
      indices.push(noseI, j, j2);
      indices.push(tailI, SEGMENTS * RADIAL + j2, SEGMENTS * RADIAL + j);
    }
    this.bodyGeo.setIndex(indices);
    this.geos.push(this.bodyGeo);

    const bodyMat = this.track(makeSkin(0.22));
    const body = new Mesh(this.bodyGeo, bodyMat);
    this.root.add(body);

    const finMat = this.track(new MeshPhysicalMaterial({
      color: new Color("#f0b7c0"),
      roughness: 0.42,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      side: 2,
      depthWrite: false,
      vertexColors: true,
      emissive: new Color("#5a2430"),
      emissiveIntensity: 0.35,
      envMapIntensity: 0.2,
    }));
    this.ribbons = [
      this.buildRibbon(0.5, 1, finMat),
      this.buildRibbon(0.78, -1, finMat),
    ];

    const limbMat = this.track(makeSkin(0.28));
    limbMat.side = 2;
    this.legs = [
      { seg: Math.round(0.34 * SEGMENTS), side: 1, phase: 0.2, group: this.buildLeg(limbMat) },
      { seg: Math.round(0.34 * SEGMENTS), side: -1, phase: 1.4, group: this.buildLeg(limbMat) },
      { seg: Math.round(0.52 * SEGMENTS), side: 1, phase: 2.1, group: this.buildLeg(limbMat) },
      { seg: Math.round(0.52 * SEGMENTS), side: -1, phase: 0.7, group: this.buildLeg(limbMat) },
    ];
    for (const leg of this.legs) this.root.add(leg.group);

    const rachis = this.trackGeo(rachisGeometry(0.5));
    const fils = [0.15, 0.2, 0.25, 0.32].map((len, index) => this.trackGeo(filamentGeometry(len, 0.0042 + index * 0.0004)));
    const gillMats = [
      this.track(gillMaterial("#ff4d6d", "#ffe4c8")),
      this.track(gillMaterial("#ff2d55", "#ffd0cc")),
      this.track(gillMaterial("#e31248", "#ffb3ae")),
    ];
    const lifts = [0.95, 0.28, -0.08];
    const ts = [0.145, 0.182, 0.218];
    this.gills = [];
    ts.forEach((t, index) => {
      ([1, -1] as const).forEach((side, s) => {
        const group = buildGill(rachis, fils, gillMats[index]!);
        const glow = new PointLight(0xff4466, side === 1 ? 0.55 : 0.2, 1.8, 2);
        glow.position.set(0.22, 0, 0);
        group.add(glow);
        this.root.add(group);
        this.gills.push({
          seg: Math.round(t * SEGMENTS),
          side,
          lift: lifts[index]!,
          phase: index * 1.3 + s,
          group,
        });
      });
    });

    const sclera = this.track(new MeshStandardMaterial({ color: "#140c10", roughness: 0.16, metalness: 0.28 }));
    const gold = this.track(new MeshStandardMaterial({ color: "#e2a15a", roughness: 0.32, metalness: 0.55, emissive: "#5a3010", emissiveIntensity: 0.25 }));
    const pupil = this.track(new MeshBasicMaterial({ color: "#070406" }));
    const catchMat = this.track(new MeshBasicMaterial({ color: "#fff8f4" }));
    this.eyes = ([1, -1] as const).map((side) => {
      const group = new Group();
      group.add(new Mesh(new SphereGeometry(0.046, 28, 18), sclera));
      const ring = new Mesh(new TorusGeometry(0.03, 0.0065, 8, 24), gold);
      ring.position.z = 0.028;
      group.add(ring);
      const pupilMesh = new Mesh(new SphereGeometry(0.02, 16, 12), pupil);
      pupilMesh.position.z = 0.032;
      group.add(pupilMesh);
      const catchLight = new Mesh(new SphereGeometry(0.008, 10, 8), catchMat);
      catchLight.position.set(0.014, 0.016, 0.04);
      group.add(catchLight);
      this.root.add(group);
      return { side, group };
    });
    this.geos.push(
      (this.eyes[0]!.group.children[0] as Mesh).geometry,
      (this.eyes[0]!.group.children[1] as Mesh).geometry,
      (this.eyes[0]!.group.children[2] as Mesh).geometry,
      (this.eyes[0]!.group.children[3] as Mesh).geometry,
    );

    this.mouth = new Group();
    const smile = new QuadraticBezierCurve3(
      new Vector3(-0.075, 0, 0),
      new Vector3(0, -0.028, 0.015),
      new Vector3(0.075, 0, 0),
    );
    const smileGeo = this.trackGeo(new TubeGeometry(smile, 10, 0.0045, 4, false));
    this.mouth.add(new Mesh(smileGeo, this.track(new MeshBasicMaterial({ color: "#6a3040" }))));
    this.root.add(this.mouth);

    this.root.rotation.y = -0.62;
    this.root.rotation.z = 0.05;
    this.root.rotation.x = 0.14;
    this.scene.add(this.root);

    const dustCount = 48;
    this.dustT = new Float32Array(dustCount);
    this.dustSpeed = new Float32Array(dustCount);
    this.dustAng = new Float32Array(dustCount);
    this.dustRad = new Float32Array(dustCount);
    this.dustPos = new Float32Array(dustCount * 3);
    const dustColor = new Float32Array(dustCount * 3);
    const dustSize = new Float32Array(dustCount);
    const gill = new Color("#ff6b86");
    const goldC = new Color("#ffd0ae");
    const code = new Color("#dff56a");
    for (let i = 0; i < dustCount; i++) {
      this.dustT[i] = Math.random();
      this.dustSpeed[i] = 0.015 + Math.random() * 0.035;
      this.dustAng[i] = Math.random() * Math.PI * 2;
      this.dustRad[i] = 1.01 + Math.random() * 0.12;
      dustSize[i] = 0.45 + Math.random() * 0.55;
      const pick = Math.random();
      const c = pick > 0.96 ? code : pick > 0.55 ? goldC : gill;
      dustColor[i * 3] = c.r;
      dustColor[i * 3 + 1] = c.g;
      dustColor[i * 3 + 2] = c.b;
    }
    const dustGeo = new BufferGeometry();
    dustGeo.setAttribute("position", new BufferAttribute(this.dustPos, 3));
    dustGeo.setAttribute("aColor", new BufferAttribute(dustColor, 3));
    dustGeo.setAttribute("aSize", new BufferAttribute(dustSize, 1));
    this.geos.push(dustGeo);
    this.dust = new Points(dustGeo, this.track(pointMaterial(0.8, 10)));
    this.root.add(this.dust);

    const moteCount = 42;
    this.motePos = new Float32Array(moteCount * 3);
    this.moteSeed = new Float32Array(moteCount * 3);
    const moteColor = new Float32Array(moteCount * 3);
    const moteSize = new Float32Array(moteCount);
    const moteCol = new Color("#f0b8c4");
    for (let i = 0; i < moteCount; i++) {
      this.moteSeed[i * 3] = (Math.random() - 0.5) * 3.2;
      this.moteSeed[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
      this.moteSeed[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      moteSize[i] = 0.35 + Math.random() * 0.7;
      moteColor[i * 3] = moteCol.r;
      moteColor[i * 3 + 1] = moteCol.g;
      moteColor[i * 3 + 2] = moteCol.b;
    }
    const moteGeo = new BufferGeometry();
    moteGeo.setAttribute("position", new BufferAttribute(this.motePos, 3));
    moteGeo.setAttribute("aColor", new BufferAttribute(moteColor, 3));
    moteGeo.setAttribute("aSize", new BufferAttribute(moteSize, 1));
    this.geos.push(moteGeo);
    this.motes = new Points(moteGeo, this.track(pointMaterial(0.45, 7)));
    this.scene.add(this.motes);

    this.water = this.track(waterMaterial()) as ShaderMaterial;
    const water = new Mesh(this.trackGeo(new PlaneGeometry(16, 10)), this.water);
    water.position.set(0.4, 0, -1.7);
    this.scene.add(water);

    this.onPointer = this.onPointer.bind(this);
    this.onVis = this.onVis.bind(this);
    this.resize = this.resize.bind(this);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVis);
    this.ro = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this.ro.observe(canvas.parentElement);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setOffscreen(off: boolean) {
    this.offscreen = off;
    this.sync();
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("visibilitychange", this.onVis);
    this.ro.disconnect();
    for (const geo of this.geos) geo.dispose();
    for (const mat of this.mats) mat.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }

  private track<T extends Material>(material: T): T {
    this.mats.push(material);
    return material;
  }

  private trackGeo<T extends BufferGeometry>(geo: T): T {
    this.geos.push(geo);
    return geo;
  }

  private buildRibbon(t0: number, sign: number, material: Material): Ribbon {
    const i0 = Math.round(t0 * SEGMENTS);
    const count = SEGMENTS - i0 + 1;
    const pos = new Float32Array(count * 2 * 3);
    const col = new Float32Array(count * 2 * 3);
    const root = new Color("#f7ddd8");
    const tip = new Color("#c4536c");
    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
      const u = i / Math.max(1, count - 1);
      const c = root.clone().lerp(tip, u * u);
      for (let row = 0; row < 2; row++) {
        const k = (i * 2 + row) * 3;
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
    }
    for (let i = 0; i < count - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("color", new BufferAttribute(col, 3));
    geo.setIndex(indices);
    this.geos.push(geo);
    const mesh = new Mesh(geo, material);
    mesh.renderOrder = 2;
    this.root.add(mesh);
    return { geo, pos, i0, count, sign };
  }

  private buildLeg(material: Material) {
    const group = new Group();
    const curve = new QuadraticBezierCurve3(
      new Vector3(0, 0, 0),
      new Vector3(0.04, -0.12, 0.05),
      new Vector3(0.08, -0.22, 0.12),
    );
    group.add(new Mesh(this.trackGeo(new TubeGeometry(curve, 7, 0.02, 5, false)), material));
    const origin = new Vector3(0.08, -0.22, 0.12);
    const toes = [
      new Vector3(0.12, -0.24, 0.16),
      new Vector3(0.09, -0.25, 0.18),
      new Vector3(0.06, -0.245, 0.15),
      new Vector3(0.1, -0.23, 0.19),
    ];
    for (const tip of toes) {
      const mid = origin.clone().lerp(tip, 0.5);
      const toe = new QuadraticBezierCurve3(origin.clone(), mid, tip);
      group.add(new Mesh(this.trackGeo(new TubeGeometry(toe, 3, 0.0065, 4, false)), material));
    }
    return group;
  }

  private onPointer(event: PointerEvent) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.lookTarget.set(((event.clientX / w) * 2 - 1) * 0.9, -((event.clientY / h) * 2 - 1) * 0.7, 0);
    if (this.reduced && !this.raf && !this.disposed) this.raf = requestAnimationFrame(this.loop);
  }

  private onVis() {
    this.hidden = document.hidden;
    this.sync();
  }

  private sync() {
    const run = !this.hidden && !this.offscreen && !this.disposed && !this.reduced;
    if (run && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  private resize = () => {
    const parent = this.canvasParent();
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 800 ? 1.25 : 1.6);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    this.camera.aspect = w / Math.max(1, h);
    const mobile = w < 900;
    this.root.position.set(mobile ? 0 : 0.62, mobile ? 0.02 : 0.12, 0);
    this.camera.position.set(0, mobile ? 0.1 : 0.14, mobile ? 6.6 : 5.55);
    this.camera.lookAt(mobile ? 0 : 0.12, -0.02, 0);
    this.camera.updateProjectionMatrix();
    try {
      this.updatePose();
      this.renderer.render(this.scene, this.camera);
      this.markReady();
    } catch (error) {
      console.error(error);
      this.renderer.domElement.dataset.error = error instanceof Error ? error.message : String(error);
    }
  };

  private markReady() {
    if (this.ready || this.disposed) return;
    this.ready = true;
    this.onReady();
  }

  private canvasParent() {
    return this.renderer.domElement.parentElement;
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = Math.min(0.033, (now - this.last) / 1000 || 0.016);
    this.last = now;
    if (!this.reduced && !this.hidden && !this.offscreen) this.time += dt;
    const follow = this.reduced ? 1 : 1 - Math.pow(0.0016, dt);
    this.look.lerp(this.lookTarget, Math.min(1, follow));
    this.updatePose();
    this.water.uniforms.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
    this.markReady();
    if (!this.disposed && !this.hidden && !this.offscreen && !this.reduced) {
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private sampleSpine(t: number, out: Vector3) {
    const x = 1.32 - t * 3.05;
    let y = Math.sin(t * Math.PI) * 0.035;
    let z = 0;
    const tail = t * t;
    y += Math.sin(this.time * 1.12 - t * 6.1) * 0.22 * tail;
    z += Math.cos(this.time * 0.82 - t * 4.3) * 0.12 * tail;
    const head = Math.exp(-t * 6.2);
    y += this.look.y * 0.34 * head;
    z += this.look.x * 0.46 * head;
    out.set(x, y, z);
  }

  private updateFrames() {
    const n = SEGMENTS;
    for (let i = 0; i <= n; i++) this.sampleSpine(i / n, this.frames[i]!.p);
    for (let i = 0; i <= n; i++) {
      const f = this.frames[i]!;
      const prev = this.frames[Math.max(0, i - 1)]!.p;
      const next = this.frames[Math.min(n, i + 1)]!.p;
      f.t.subVectors(next, prev);
      if (f.t.lengthSq() < 1e-8) f.t.set(-1, 0, 0);
      else f.t.normalize();
      this._up.set(0, 1, 0);
      f.n.copy(this._up).addScaledVector(f.t, -this._up.dot(f.t));
      if (f.n.lengthSq() < 1e-6) f.n.set(0, 0, 1);
      f.n.normalize();
      f.b.crossVectors(f.n, f.t).normalize();
    }
  }

  private updatePose() {
    this.updateFrames();
    const seg = SEGMENTS;
    const rad = RADIAL;
    const noseI = (seg + 1) * rad;
    const tailI = noseI + 1;
    for (let i = 0; i <= seg; i++) {
      const f = this.frames[i]!;
      const ry = this.ry[i]!;
      const rz = this.rz[i]!;
      const along = i / seg;
      for (let j = 0; j < rad; j++) {
        const ang = (j / rad) * Math.PI * 2;
        const cy = Math.cos(ang);
        const sy = Math.sin(ang);
        const belly = cy < 0 ? 1 + cy * 0.22 : 1;
        const k = (i * rad + j) * 3;
        const yy = ry * belly;
        this.pos[k] = f.p.x + f.n.x * cy * yy + f.b.x * sy * rz;
        this.pos[k + 1] = f.p.y + f.n.y * cy * yy + f.b.y * sy * rz;
        this.pos[k + 2] = f.p.z + f.n.z * cy * yy + f.b.z * sy * rz;
        (this.bodyGeo.getAttribute("aAlong") as BufferAttribute).setX(i * rad + j, along);
      }
    }
    const nose = this.frames[0]!;
    const tail = this.frames[seg]!;
    this.pos[noseI * 3] = nose.p.x - nose.t.x * 0.08;
    this.pos[noseI * 3 + 1] = nose.p.y - nose.t.y * 0.08 + nose.n.y * 0.03;
    this.pos[noseI * 3 + 2] = nose.p.z - nose.t.z * 0.08;
    this.pos[tailI * 3] = tail.p.x + tail.t.x * 0.04;
    this.pos[tailI * 3 + 1] = tail.p.y + tail.t.y * 0.04;
    this.pos[tailI * 3 + 2] = tail.p.z + tail.t.z * 0.04;
    (this.bodyGeo.getAttribute("aAlong") as BufferAttribute).setX(noseI, 0);
    (this.bodyGeo.getAttribute("aAlong") as BufferAttribute).setX(tailI, 1);
    this.bodyPos.needsUpdate = true;
    (this.bodyGeo.getAttribute("aAlong") as BufferAttribute).needsUpdate = true;
    this.bodyGeo.computeVertexNormals();

    for (const ribbon of this.ribbons) {
      for (let i = 0; i < ribbon.count; i++) {
        const s = ribbon.i0 + i;
        const f = this.frames[s]!;
        const t = s / seg;
        const h = ribbon.sign > 0 ? dorsal(t) : ventral(t);
        const ry = this.ry[s]!;
        const k0 = i * 6;
        const lift = ribbon.sign;
        ribbon.pos[k0] = f.p.x + f.n.x * lift * (ry + 0.006);
        ribbon.pos[k0 + 1] = f.p.y + f.n.y * lift * (ry + 0.006);
        ribbon.pos[k0 + 2] = f.p.z + f.n.z * lift * (ry + 0.006);
        ribbon.pos[k0 + 3] = f.p.x + f.n.x * lift * (ry + h);
        ribbon.pos[k0 + 4] = f.p.y + f.n.y * lift * (ry + h);
        ribbon.pos[k0 + 5] = f.p.z + f.n.z * lift * (ry + h);
      }
      (ribbon.geo.getAttribute("position") as BufferAttribute).needsUpdate = true;
      ribbon.geo.computeVertexNormals();
    }

    for (const gill of this.gills) {
      const f = this.frames[gill.seg]!;
      const rz = this.rz[gill.seg]!;
      this._v1.copy(f.b).multiplyScalar(gill.side);
      this._v2.copy(f.t).addScaledVector(this._v1, 0.95).addScaledVector(f.n, gill.lift).normalize();
      gill.group.position.copy(f.p).addScaledVector(this._v1, rz * 0.82);
      gill.group.quaternion.setFromUnitVectors(this._z.set(1, 0, 0), this._v2);
      gill.group.rotateX(Math.sin(this.time * 1.45 + gill.phase) * 0.14);
    }

    const eyeSeg = Math.round(0.1 * seg);
    const eyeFrame = this.frames[eyeSeg]!;
    for (const eye of this.eyes) {
      const ry = this.ry[eyeSeg]!;
      const rz = this.rz[eyeSeg]!;
      eye.group.position.copy(eyeFrame.p)
        .addScaledVector(eyeFrame.n, ry * 0.36)
        .addScaledVector(eyeFrame.b, eye.side * rz * 0.8);
      this._v1.copy(eyeFrame.b).multiplyScalar(eye.side)
        .addScaledVector(eyeFrame.n, 0.38)
        .addScaledVector(eyeFrame.t, -0.4);
      this._v1.x += this.look.x * 0.3;
      this._v1.y += this.look.y * 0.3;
      this._v1.normalize();
      eye.group.quaternion.setFromUnitVectors(this._z.set(0, 0, 1), this._v1);
    }

    const mouthSeg = Math.round(0.055 * seg);
    const mf = this.frames[mouthSeg]!;
    this.mouth.position.copy(mf.p)
      .addScaledVector(mf.n, -this.ry[mouthSeg]! * 0.42)
      .addScaledVector(mf.t, -0.06);
    this._basis.makeBasis(mf.b, mf.n, mf.t);
    this.mouth.quaternion.setFromRotationMatrix(this._basis);

    for (const leg of this.legs) {
      const f = this.frames[leg.seg]!;
      const ry = this.ry[leg.seg]!;
      const rz = this.rz[leg.seg]!;
      leg.group.position.copy(f.p)
        .addScaledVector(f.b, leg.side * rz * 0.58)
        .addScaledVector(f.n, -ry * 0.25);
      leg.group.rotation.set(
        Math.sin(this.time * 1.25 + leg.phase) * 0.16,
        leg.side * 0.2,
        leg.side * 0.45,
      );
      leg.group.scale.z = leg.side;
    }

    for (let i = 0; i < this.dustT.length; i++) {
      let t = this.dustT[i]! + this.time * this.dustSpeed[i]!;
      t -= Math.floor(t);
      const fpos = t * seg;
      const i0 = Math.min(seg - 1, Math.floor(fpos));
      const u = fpos - i0;
      const a = this.frames[i0]!;
      const b = this.frames[i0 + 1]!;
      this._pp.lerpVectors(a.p, b.p, u);
      this._nn.lerpVectors(a.n, b.n, u).normalize();
      this._bb.lerpVectors(a.b, b.b, u).normalize();
      const ang = this.dustAng[i]! + this.time * 0.18;
      const ry = (this.ry[i0]! * (1 - u) + this.ry[i0 + 1]! * u) * this.dustRad[i]!;
      const rz = (this.rz[i0]! * (1 - u) + this.rz[i0 + 1]! * u) * this.dustRad[i]!;
      const k = i * 3;
      this.dustPos[k] = this._pp.x + this._nn.x * Math.cos(ang) * ry + this._bb.x * Math.sin(ang) * rz;
      this.dustPos[k + 1] = this._pp.y + this._nn.y * Math.cos(ang) * ry + this._bb.y * Math.sin(ang) * rz;
      this.dustPos[k + 2] = this._pp.z + this._nn.z * Math.cos(ang) * ry + this._bb.z * Math.sin(ang) * rz;
    }
    (this.dust.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;

    for (let i = 0; i < this.moteSeed.length / 3; i++) {
      const k = i * 3;
      const s0 = this.moteSeed[k]!;
      const s1 = this.moteSeed[k + 1]!;
      const s2 = this.moteSeed[k + 2]!;
      this.motePos[k] = s0 + Math.sin(this.time * 0.25 + s1) * 0.18;
      this.motePos[k + 1] = s1 + Math.cos(this.time * 0.2 + s0) * 0.12;
      this.motePos[k + 2] = s2 + Math.sin(this.time * 0.18 + s2) * 0.1;
    }
    (this.motes.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
  }
}

function radiiAt(t: number) {
  let i = 0;
  while (i < RADIUS.length - 2 && t > RADIUS[i + 1]![0]) i += 1;
  const a = RADIUS[i]!;
  const b = RADIUS[i + 1]!;
  const u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  const s = u * u * (3 - 2 * u);
  const y = a[1] + (b[1] - a[1]) * s;
  const w = a[2] + (b[2] - a[2]) * s;
  return { y, z: y * w };
}

function dorsal(t: number) {
  if (t < 0.52) return 0.02;
  if (t < 0.74) return 0.02 + ((t - 0.52) / 0.22) * 0.06;
  const u = Math.min(1, (t - 0.74) / 0.26);
  return 0.08 + Math.sin(u * Math.PI) * 0.38;
}

function ventral(t: number) {
  if (t < 0.8) return 0.012;
  const u = Math.min(1, (t - 0.8) / 0.18);
  return 0.012 + Math.sin(u * Math.PI) * 0.2;
}

function makeSkin(envMapIntensity: number) {
  return new MeshPhysicalMaterial({
    color: new Color("#f3cec9"),
    roughness: 0.36,
    metalness: 0,
    sheen: 1,
    sheenColor: new Color("#ffc4cc"),
    sheenRoughness: 0.42,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    specularIntensity: 0.6,
    specularColor: new Color("#fff6f4"),
        emissive: new Color("#3a1520"),
    emissiveIntensity: 0.12,
    envMapIntensity,
  });
}

function gillMaterial(deep: string, tip: string) {
  return new ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uDeep: { value: new Color(deep) },
      uTip: { value: new Color(tip) },
    },
    vertexShader: `
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vAlong = uv.y;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      uniform vec3 uDeep;
      uniform vec3 uTip;
      void main() {
        float fres = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 1.45);
        vec3 col = mix(uDeep, uTip, smoothstep(0.12, 1.0, vAlong));
        col += vec3(1.0, 0.78, 0.72) * fres * 0.38;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function filamentGeometry(length: number, radius: number) {
  const curve = new QuadraticBezierCurve3(
    new Vector3(0, 0, 0),
    new Vector3(length * 0.45, length * 0.22, 0),
    new Vector3(length, length * 0.02, length * 0.2),
  );
  return new TubeGeometry(curve, 5, radius, 4, false);
}

function rachisGeometry(length: number) {
  const curve = new QuadraticBezierCurve3(
    new Vector3(0, 0, 0),
    new Vector3(length * 0.5, length * 0.04, 0),
    new Vector3(length, -length * 0.06, 0),
  );
  return new TubeGeometry(curve, 8, 0.015, 5, false);
}

function buildGill(rachis: BufferGeometry, fils: BufferGeometry[], material: Material) {
  const group = new Group();
  group.add(new Mesh(rachis, material));
  const curve = new QuadraticBezierCurve3(
    new Vector3(0, 0, 0),
    new Vector3(0.25, 0.02, 0),
    new Vector3(0.5, -0.03, 0),
  );
  for (let i = 0; i < 7; i++) {
    const u = 0.18 + (i / 6) * 0.72;
    const fil = new Mesh(fils[i % fils.length]!, material);
    fil.position.copy(curve.getPoint(u));
    fil.rotation.set((i - 3) * 0.34, 0.15, 0.2);
    group.add(fil);
  }
  return group;
}

function waterMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vec2 p = vUv * vec2(5.2, 3.1);
        float t = uTime * 0.32;
        float a = sin(p.x * 1.7 + t) * cos(p.y * 1.9 - t * 0.75);
        float b = sin((p.x + p.y) * 1.15 - t * 0.5) * cos((p.x - p.y) * 0.9 + t * 0.35);
        float c = pow(abs(a * b), 1.3);
        vec2 q = vUv - vec2(0.64, 0.52);
        float glow = exp(-dot(q, q) * 7.5);
        vec3 col = vec3(0.45, 0.1, 0.16) * c * 0.06;
        col += vec3(0.05, 0.16, 0.18) * c * 0.05;
        col += vec3(1.0, 0.22, 0.34) * glow * 0.035;
        col *= smoothstep(1.05, 0.2, length(vUv - 0.5));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function pointMaterial(alpha: number, size: number) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uAlpha: { value: alpha },
      uSize: { value: size },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      uniform float uSize;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uSize * (18.0 / max(2.0, -mv.z)), 1.0, 7.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vColor;
      uniform float uAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.08, d) * uAlpha;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });
}
