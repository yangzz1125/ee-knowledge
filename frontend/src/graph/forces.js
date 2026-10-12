/**
 * 章节锚点：六章均匀排成一圈，3D 时上下错开，形成六个星团。
 * radius 为圈的半径（世界坐标），返回 chapterId → {x, y, z}。
 */
export function chapterAnchors(chapters, radius, dimensions) {
  const anchors = new Map();
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  sorted.forEach((chapter, index) => {
    const angle = (index / sorted.length) * Math.PI * 2 - Math.PI / 2;
    anchors.set(chapter.id, dimensions === 3
      ? { x: Math.cos(angle) * radius, y: (index % 2 ? 1 : -1) * radius * 0.22, z: Math.sin(angle) * radius }
      : { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 });
  });
  return anchors;
}

/** 把节点拉向所属章节的锚点；跨章节的关系只给弱弹簧，星团才能分开。 */
export function chapterForce(anchors, strength) {
  let nodes = [];
  const force = alpha => {
    nodes.forEach(node => {
      const anchor = anchors.get(node.chapterId);
      node.vx += (anchor.x - node.x) * strength * alpha;
      node.vy += (anchor.y - node.y) * strength * alpha;
      if (node.vz !== undefined) node.vz += (anchor.z - node.z) * strength * alpha;
    });
  };
  force.initialize = initialNodes => { nodes = initialNodes; };
  return force;
}

/** 每章节点的中心和半径，用来放星云和章节名。 */
export function chapterClusters(nodes) {
  const groups = new Map();
  nodes.forEach(node => {
    if (!groups.has(node.chapterId)) groups.set(node.chapterId, []);
    groups.get(node.chapterId).push(node);
  });
  const clusters = new Map();
  groups.forEach((members, chapterId) => {
    const center = ["x", "y", "z"].map(axis =>
      members.reduce((sum, node) => sum + (node[axis] || 0), 0) / members.length);
    const radius = Math.max(...members.map(node =>
      Math.hypot(node.x - center[0], node.y - center[1], (node.z || 0) - center[2])));
    clusters.set(chapterId, { x: center[0], y: center[1], z: center[2], radius });
  });
  return clusters;
}
