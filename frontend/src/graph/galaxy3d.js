import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { nebulaColor, TYPE_COLORS } from "../palette.js";
import { chapterAnchors, chapterClusters, chapterForce } from "./forces.js";
import { SPRITE_SCALE, starCanvas } from "./starSprite.js";

const LABEL_FONT = '"Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif';
// 星座连线统一一种淡蓝白；点亮时换成暖金色。
const LINK_COLORS = { lit: "#ffcf70", normal: "#a9bdf5", dim: "#1b2647" };
const SPACE = "#060b1c";

/** 中心亮、边缘透明的圆形贴图，叠加混合后就是星体的光晕。 */
function radialTexture(stops) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([offset, alpha]) => gradient.addColorStop(offset, `rgba(255,255,255,${alpha})`));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function ringTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  context.strokeStyle = "rgba(255,255,255,0.95)";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(64, 64, 56, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([6, 10]);
  context.lineWidth = 2;
  context.beginPath();
  context.arc(64, 64, 46, 0, Math.PI * 2);
  context.stroke();
  return new THREE.CanvasTexture(canvas);
}

/**
 * 远处的背景星，分布在一个球壳里。band 为 true 时集中在一条倾斜的大圆附近，形成银河光带。
 */
function starfield({ count, size, opacity, band = false }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color("#ffffff"), new THREE.Color("#a9c0ff"), new THREE.Color("#ffe6c2")];
  const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.5, 0, 0.35));
  const point = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const radius = 800 + Math.random() * 900;
    const theta = Math.random() * Math.PI * 2;
    // 银河：纬度按近似正态分布挤在赤道附近；普通星：球面均匀分布。
    const latitude = band
      ? (Math.random() + Math.random() + Math.random() - 1.5) * 0.22
      : Math.asin(2 * Math.random() - 1);
    point.set(
      radius * Math.cos(latitude) * Math.cos(theta),
      radius * Math.sin(latitude),
      radius * Math.cos(latitude) * Math.sin(theta),
    ).applyMatrix4(tilt);
    positions.set([point.x, point.y, point.z], i * 3);
    const color = palette[i % palette.length];
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    size, vertexColors: true, transparent: true, opacity, depthWrite: false, sizeAttenuation: false,
  }));
}

/** 天球坐标环：水平面上的几道同心圆、每 30° 一条经线、外圈每 5° 一个刻度。 */
function celestialGrid(radius) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: "#4a66b0", transparent: true, opacity: 0.28, depthWrite: false });
  const circle = r => {
    const points = Array.from({ length: 181 }, (_, i) => {
      const angle = (i / 180) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    });
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  };
  [0.55, 0.85, 1, 1.06].forEach(k => group.add(circle(radius * k)));
  const segments = [];
  for (let degree = 0; degree < 360; degree += 5) {
    const angle = (degree / 180) * Math.PI;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const inner = degree % 30 === 0 ? radius * 0.55 : radius * (degree % 10 === 0 ? 1 : 1.025);
    segments.push(new THREE.Vector3(cos * inner, 0, sin * inner), new THREE.Vector3(cos * radius * 1.06, 0, sin * radius * 1.06));
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), material));
  // 稍微倾斜，像星图上的黄道环。
  group.rotation.set(0.18, 0, 0.08);
  return group;
}

/**
 * 3D 星系渲染器。callbacks: onSelect(id)、onBackground()、onHover(id | null)、
 * describe(node) → tooltip HTML、onLayoutReady()（首次布局完成，此时才能按节点位置移动镜头）。
 * 返回的方法与 galaxy2d.js 一致，GalaxyCanvas.vue 不区分维度。
 */
export function createGalaxy3D(element, chapters, callbacks) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nebula = radialTexture([[0, 0.45], [0.4, 0.14], [1, 0]]);
  const ring = ringTexture();
  // 每种类型两张贴图：普通星、带星芒的亮星。
  const starTextures = new Map();
  const starTexture = (type, spikes) => {
    const key = `${type}|${spikes}`;
    if (!starTextures.has(key)) starTextures.set(key, new THREE.CanvasTexture(starCanvas(TYPE_COLORS[type], spikes)));
    return starTextures.get(key);
  };
  const objects = new Map();
  let emphasis = null;

  const graph = new ForceGraph3D(element, { controlType: "orbit" })
    .backgroundColor(SPACE)
    .showNavInfo(false)
    .enableNodeDrag(false)
    .warmupTicks(80)
    .cooldownTicks(160)
    .nodeThreeObject(node => {
      const group = new THREE.Group();
      const star = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starTexture(node.type, node.landmark), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      const orbit = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ring, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      orbit.visible = false;
      const label = new SpriteText(node.name, node.landmark ? 5.2 : 4.2, "#eef2ff");
      label.fontFace = LABEL_FONT;
      label.fontWeight = "600";
      label.strokeWidth = 1;
      label.strokeColor = SPACE;
      label.material.depthWrite = false;
      label.position.y = -(node.radius + 5);
      group.add(star, orbit, label);
      const entry = { node, star, orbit, label };
      objects.set(node.id, entry);
      if (emphasis) styleNode(entry);
      return group;
    })
    .nodeLabel(node => callbacks.describe(node))
    .linkOpacity(0.55)
    .linkDirectionalParticleSpeed(0.007)
    .linkDirectionalParticleWidth(2.2)
    .linkDirectionalParticleColor(() => "#fff3d0")
    .linkDirectionalArrowRelPos(0.82)
    .linkDirectionalArrowColor(() => LINK_COLORS.lit)
    .onNodeClick(node => callbacks.onSelect(node.id))
    .onNodeHover(node => {
      element.style.cursor = node ? "pointer" : "";
      callbacks.onHover(node ? node.id : null);
    })
    .onBackgroundClick(() => callbacks.onBackground());

  const anchors = chapterAnchors(chapters, 220, 3);
  graph.d3Force("chapter", chapterForce(anchors, 0.14));
  graph.d3Force("charge").strength(-50);
  graph.d3Force("link").distance(28).strength(link => (link.sameChapter ? 0.45 : 0.015));

  // 星云和章节名放在星团中心，力导向停下后按实际位置校正。
  const scene = graph.scene();
  const sky = new THREE.Group();
  sky.add(
    starfield({ count: 3200, size: 1.2, opacity: 0.7 }),
    starfield({ count: 260, size: 2.4, opacity: 0.9 }),
    starfield({ count: 16000, size: 1.3, opacity: 0.55, band: true }),
  );
  scene.add(sky, celestialGrid(330));
  const chapterDecor = new Map();
  chapters.forEach(chapter => {
    const color = new THREE.Color(nebulaColor(chapter.order));
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebula, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22,
    }));
    const title = new SpriteText(chapter.name, 11, nebulaColor(chapter.order));
    title.fontFace = LABEL_FONT;
    title.fontWeight = "700";
    title.material.depthWrite = false;
    title.material.opacity = 0.9;
    const anchor = anchors.get(chapter.id);
    cloud.position.set(anchor.x, anchor.y, anchor.z);
    cloud.scale.setScalar(150);
    title.position.set(anchor.x, anchor.y + 60, anchor.z);
    scene.add(cloud, title);
    chapterDecor.set(chapter.id, { cloud, title });
  });

  let fitted = false;
  graph.onEngineStop(() => {
    chapterClusters(graph.graphData().nodes).forEach((cluster, chapterId) => {
      const { cloud, title } = chapterDecor.get(chapterId);
      cloud.position.set(cluster.x, cluster.y, cluster.z);
      cloud.scale.setScalar(Math.max(90, cluster.radius * 3.2));
      title.position.set(cluster.x, cluster.y + cluster.radius + 16, cluster.z);
    });
    if (!fitted) {
      fitted = true;
      callbacks.onLayoutReady();
    }
  });

  const controls = graph.controls();
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.35;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  // 选中星体的外环呼吸、背景星缓慢转动。
  let frame = 0;
  const animate = time => {
    frame = requestAnimationFrame(animate);
    if (reduceMotion) return;
    const pulse = 1 + Math.sin(time / 380) * 0.08;
    objects.forEach(({ node, orbit }) => {
      if (orbit.visible) {
        orbit.scale.setScalar(node.radius * 4.4 * pulse);
        orbit.material.rotation = time / 2400;
      }
    });
    sky.rotation.y = time / 240000;
  };
  frame = requestAnimationFrame(animate);

  // 星体对象可能晚于 applyStyle 才创建，所以样式按单个对象应用，创建时补一次。
  function styleNode({ node, star, orbit, label }) {
    const level = emphasis.level(node);
    // 点亮的星换成带星芒的贴图并放大；变暗的星只剩微弱的光点。
    const lit = level === "lit";
    const texture = starTexture(node.type, node.landmark || lit);
    if (star.material.map !== texture) star.material.map = texture;
    star.material.opacity = level === "dim" ? 0.18 : 1;
    star.scale.setScalar(node.radius * SPRITE_SCALE * (lit ? 1.35 : 1));
    orbit.visible = node.id === emphasis.selectedId || emphasis.pathEnds.has(node.id);
    orbit.scale.setScalar(node.radius * 4.4);
    label.visible = emphasis.showLabel(node);
    // 点亮的星镜头往往拉得较远，名字放大才看得清；只在字号变化时重绘文字贴图。
    const height = level === "lit" ? 6.6 : node.landmark ? 5.2 : 4.2;
    if (label.textHeight !== height) label.textHeight = height;
  }

  function restyleLinks() {
    if (!emphasis) return;
    const level = link => emphasis.linkLevel(link);
    graph
      .linkColor(link => LINK_COLORS[level(link)])
      .linkWidth(link => ({ lit: 1.8, normal: 0.75, dim: 0.35 })[level(link)])
      .linkDirectionalParticles(link => (level(link) === "lit" && link.directed ? 3 : 0))
      .linkDirectionalArrowLength(link => (level(link) === "lit" && link.directed ? 4.5 : 0));
  }

  function nodeById(id) {
    return graph.graphData().nodes.find(node => node.id === id);
  }

  // 浮层（章节栏、抽屉、问答栏）挡住的边距。投影中心移到可见区域中央，适配时按可见区域留白。
  let insets = { left: 0, right: 0, top: 0, bottom: 0 };
  let size = { width: element.clientWidth || 1, height: element.clientHeight || 1 };
  function applyViewOffset() {
    const camera = graph.camera();
    camera.setViewOffset(size.width, size.height,
      (insets.right - insets.left) / 2, (insets.bottom - insets.top) / 2, size.width, size.height);
    camera.updateProjectionMatrix();
  }
  function fitPadding() {
    const visible = Math.min(
      (size.width - insets.left - insets.right) / size.width,
      (size.height - insets.top - insets.bottom) / size.height,
    );
    return (size.height * (1 - 0.86 * Math.max(visible, 0.2))) / 2;
  }

  return {
    setData(data) {
      fitted = false;
      objects.clear();
      graph.graphData(data);
    },
    applyStyle(next) {
      emphasis = next;
      objects.forEach(styleNode);
      restyleLinks();
    },
    focusNode(id, durationMs = 1400) {
      const node = nodeById(id);
      if (!node) return;
      controls.autoRotate = false;
      const distance = 150;
      const length = Math.hypot(node.x, node.y, node.z);
      const position = length < 1
        ? { x: 0, y: 0, z: distance }
        : { x: node.x * (1 + distance / length), y: node.y * (1 + distance / length), z: node.z * (1 + distance / length) };
      graph.cameraPosition(position, { x: node.x, y: node.y, z: node.z }, durationMs);
    },
    fitNodes(ids) {
      const set = new Set(ids);
      controls.autoRotate = false;
      graph.zoomToFit(1200, fitPadding(), node => set.has(node.id));
    },
    fitAll() {
      controls.autoRotate = !reduceMotion;
      graph.zoomToFit(1200, fitPadding());
    },
    setInsets(next) {
      insets = next;
      applyViewOffset();
    },
    resize(width, height) {
      size = { width, height };
      graph.width(width).height(height);
      applyViewOffset();
    },
    destroy() {
      cancelAnimationFrame(frame);
      graph._destructor();
      [nebula, ring, ...starTextures.values()].forEach(texture => texture.dispose());
      element.replaceChildren();
    },
  };
}
