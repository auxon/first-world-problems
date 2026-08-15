// @ts-nocheck
/**
 * First World Problems
 * A Sims-like comedy of modern existential crises
 * Built with Three.js + TypeScript
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// ─────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────

type NeedKey = 'caffeine' | 'connectivity' | 'battery' | 'validation' | 'vibe';

interface NeedState {
  value: number;
  drainRate: number; // per second
  color: string;
}

interface Interactable {
  mesh: THREE.Object3D;
  name: string;
  actions: Action[];
  position: THREE.Vector3;
}

interface Action {
  label: string;
  effect: Partial<Record<NeedKey, number>>;
  speech: string[];
  score?: number;
  cooldown?: number;
}

interface ProblemEvent {
  title: string;
  description: string;
  impact: Partial<Record<NeedKey, number>>;
}

// ─────────────────────────────────────────────
// Game State
// ─────────────────────────────────────────────

const needs: Record<NeedKey, NeedState> = {
  caffeine:     { value: 85, drainRate: 1.8, color: '#c4a574' },
  connectivity: { value: 90, drainRate: 1.2, color: '#60a5fa' },
  battery:      { value: 70, drainRate: 2.4, color: '#4ade80' },
  validation:   { value: 60, drainRate: 1.5, color: '#f472b6' },
  vibe:         { value: 80, drainRate: 0.9, color: '#a78bfa' },
};

let score = 0;
let day = 1;
let gameTime = 9 * 60; // minutes from midnight (start 9am)
let isGameOver = false;
let speechTimeout: number | null = null;
let lastEventTime = 0;
let meltdownLevel = 0;

// ─────────────────────────────────────────────
// Three.js Setup
// ─────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a42);
scene.fog = new THREE.Fog(0x2a2a42, 20, 45);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6, 7, 9);
camera.lookAt(0, 1, 0);

// Much brighter lighting so the room is clearly visible
const ambient = new THREE.AmbientLight(0xc0c0e0, 1.25);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xf0f0ff, 0x404050, 0.65);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff8f0, 2.2);
sun.position.set(5, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 30;
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
sun.shadow.bias = -0.001;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xa8b8ff, 0.85);
fill.position.set(-4, 4, -3);
scene.add(fill);

const pointWarm = new THREE.PointLight(0xffcc88, 1.5, 16);
pointWarm.position.set(-2, 2.5, 1);
pointWarm.castShadow = true;
scene.add(pointWarm);

const pointCool = new THREE.PointLight(0xaaccff, 0.85, 12);
pointCool.position.set(3, 2.2, 2);
scene.add(pointCool);

// ─────────────────────────────────────────────
// Room Construction (primitive furniture)
// ─────────────────────────────────────────────

function createMaterial(color: number, roughness = 0.7, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// Floor
const floorGeo = new THREE.PlaneGeometry(14, 12);
const floorMat = createMaterial(0x3a3a4c, 0.8);
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Walls
function makeWall(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = createMaterial(0x4a4a62, 0.85);
  const wall = new THREE.Mesh(geo, mat);
  wall.position.set(x, y, z);
  wall.rotation.y = rotY;
  wall.receiveShadow = true;
  wall.castShadow = true;
  scene.add(wall);
  return wall;
}

makeWall(14, 5, 0.3, 0, 2.5, -6);          // back
makeWall(0.3, 5, 12, -7, 2.5, 0);           // left
makeWall(0.3, 5, 12, 7, 2.5, 0);            // right

// Rug
const rug = new THREE.Mesh(
  new THREE.PlaneGeometry(5, 4),
  createMaterial(0x4a3f6b, 0.95)
);
rug.rotation.x = -Math.PI / 2;
rug.position.set(0, 0.01, 0.5);
rug.receiveShadow = true;
scene.add(rug);

// ── Furniture ──

const interactables: Interactable[] = [];

function addInteractable(
  mesh: THREE.Object3D,
  name: string,
  actions: Action[],
  x: number, y: number, z: number
) {
  mesh.position.set(x, y, z);
  mesh.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  scene.add(mesh);
  interactables.push({ mesh, name, actions, position: new THREE.Vector3(x, y, z) });
  return mesh;
}

// Coffee Station
const coffeeGroup = new THREE.Group();
const machine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.5), createMaterial(0x222228, 0.4, 0.6));
machine.position.y = 0.55;
coffeeGroup.add(machine);
const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 16), createMaterial(0xf5f5f5));
cup.position.set(0.35, 0.85, 0.1);
coffeeGroup.add(cup);
const counter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.8), createMaterial(0x5c4033));
counter.position.y = 0.9;
coffeeGroup.add(counter);
addInteractable(coffeeGroup, 'Espresso Altar', [
  {
    label: 'Brew artisanal oat-milk latte',
    effect: { caffeine: 35, vibe: 5 },
    speech: [
      "Ah. The nectar of the slightly-privileged.",
      "Notes of pretension and crushed dreams.",
      "This better have a perfect microfoam or I'm calling the manager of existence."
    ],
    score: 1
  },
  {
    label: 'Doomscroll while it brews',
    effect: { caffeine: 15, validation: -8, battery: -10 },
    speech: [
      "I waited 3 minutes. That's basically eternity.",
      "Someone posted a better latte than mine. Unfollow."
    ],
    score: 0
  }
], -4.5, 0, -3.5);

// Laptop Desk
const deskGroup = new THREE.Group();
const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.9), createMaterial(0x3d2b1f));
desk.position.y = 0.75;
deskGroup.add(desk);
const legs = [[-0.8, 0.35, -0.35], [0.8, 0.35, -0.35], [-0.8, 0.35, 0.35], [0.8, 0.35, 0.35]];
legs.forEach(([lx, ly, lz]) => {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), createMaterial(0x2a2a2a));
  leg.position.set(lx, ly, lz);
  deskGroup.add(leg);
});
const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.5), createMaterial(0x1a1a1a, 0.3, 0.8));
laptop.position.set(0, 0.82, 0);
deskGroup.add(laptop);
const screen = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.4, 0.02), createMaterial(0x111122));
screen.position.set(0, 1.05, -0.2);
screen.rotation.x = -0.15;
deskGroup.add(screen);
addInteractable(deskGroup, 'Standing Desk of Ambition', [
  {
    label: 'Reply to all Slack messages',
    effect: { connectivity: 10, validation: 8, caffeine: -5 },
    speech: [
      "I am a productive member of society. Allegedly.",
      "Sent 14 messages. Received 2. The algorithm of life."
    ],
    score: 2
  },
  {
    label: 'Doomscroll LinkedIn',
    effect: { validation: -15, vibe: -10, battery: -8 },
    speech: [
      "Everyone is getting promoted except me.",
      "This guy who posts motivational quotes just closed a Series B. I hate it here."
    ],
    score: 0
  },
  {
    label: 'Actually do deep work for 25 minutes',
    effect: { validation: 5, vibe: 12, connectivity: -5 },
    speech: [
      "Wow. Focus. I almost remember what this feels like.",
      "I solved a real problem. My ancestors are proud... of their first-world descendant."
    ],
    score: 3
  }
], 3.5, 0, -3.2);

// Couch / Netflix Zone
const couchGroup = new THREE.Group();
const couchBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 1.1), createMaterial(0x4a5568));
couchBase.position.y = 0.3;
couchGroup.add(couchBase);
const couchBack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.25), createMaterial(0x4a5568));
couchBack.position.set(0, 0.7, -0.4);
couchGroup.add(couchBack);
const cushion1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.8), createMaterial(0x6b7280));
cushion1.position.set(-0.55, 0.55, 0.05);
couchGroup.add(cushion1);
const cushion2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.8), createMaterial(0x6b7280));
cushion2.position.set(0.55, 0.55, 0.05);
couchGroup.add(cushion2);
addInteractable(couchGroup, 'Netflix Throne', [
  {
    label: 'Binge the show everyone is talking about',
    effect: { vibe: 15, validation: 10, battery: -12, caffeine: -5 },
    speech: [
      "I am culturally relevant for the next 48 hours.",
      "Finished the season. Now I have nothing. Absolute void."
    ],
    score: 1
  },
  {
    label: 'Scroll TikTok until 3am',
    effect: { validation: 5, battery: -25, caffeine: -15, vibe: -8 },
    speech: [
      "Just one more video. It's educational. About cats.",
      "Why is the algorithm showing me my ex's cousin's wedding?"
    ],
    score: 0
  }
], -2.5, 0, 2.5);

// Phone Charging Dock
const phoneGroup = new THREE.Group();
const dock = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.15, 16), createMaterial(0x1f1f1f, 0.3, 0.7));
dock.position.y = 0.1;
phoneGroup.add(dock);
const phone = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.02), createMaterial(0x111111, 0.2, 0.9));
phone.position.set(0, 0.35, 0);
phoneGroup.add(phone);
addInteractable(phoneGroup, 'Sacred Charging Altar', [
  {
    label: 'Charge phone (watch the percentage rise)',
    effect: { battery: 40 },
    speech: [
      "23%... 24%... This is better than meditation.",
      "I feel whole again. My digital soul is restored."
    ],
    score: 1
  },
  {
    label: 'Check notifications obsessively',
    effect: { validation: 12, battery: -15, connectivity: -5 },
    speech: [
      "Three likes. One from my mom. Peak validation.",
      "No new messages. I am alone in the universe."
    ],
    score: 1
  }
], 4.2, 0, 1.5);

// Fiddle Leaf Fig (the plant that judges you)
const plantGroup = new THREE.Group();
const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.4, 12), createMaterial(0xc4a484));
pot.position.y = 0.2;
plantGroup.add(pot);
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.2, 8), createMaterial(0x5c4033));
trunk.position.y = 0.9;
plantGroup.add(trunk);
for (let i = 0; i < 7; i++) {
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    createMaterial(0x2d5a27, 0.8)
  );
  leaf.scale.set(1, 0.3, 0.7);
  const angle = (i / 7) * Math.PI * 2;
  leaf.position.set(Math.cos(angle) * 0.3, 1.4 + Math.sin(i) * 0.2, Math.sin(angle) * 0.3);
  plantGroup.add(leaf);
}
addInteractable(plantGroup, 'Judgmental Fiddle Leaf Fig', [
  {
    label: 'Water it perfectly (and talk to it)',
    effect: { vibe: 20, validation: 5 },
    speech: [
      "You're thriving. Unlike my other relationships.",
      "I saw a brown tip. I am a failure as a plant parent."
    ],
    score: 2
  },
  {
    label: 'Ignore it and hope for the best',
    effect: { vibe: -12 },
    speech: [
      "It looks fine. I'm sure that yellow leaf is normal.",
      "Plants are supposed to be low-maintenance, right? RIGHT?"
    ],
    score: 0
  }
], 5.5, 0, -2);

// Mirror / Selfie corner
const mirrorGroup = new THREE.Group();
const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.08), createMaterial(0xd4af37, 0.3, 0.7));
mirrorFrame.position.y = 1.6;
mirrorGroup.add(mirrorFrame);
const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.6), createMaterial(0x88aacc, 0.1, 0.9));
mirrorGlass.position.set(0, 1.6, 0.05);
mirrorGroup.add(mirrorGlass);
addInteractable(mirrorGroup, 'Mirror of Self-Worth', [
  {
    label: 'Take 47 selfies for the perfect angle',
    effect: { validation: 18, battery: -10, vibe: 5 },
    speech: [
      "This one has main character energy.",
      "Deleted 46. Posted the 47th. Caption: 'just a vibe'."
    ],
    score: 1
  },
  {
    label: 'Existential stare into your own eyes',
    effect: { vibe: -10, validation: -5 },
    speech: [
      "Who even am I without my notifications?",
      "The lighting is wrong. Everything is wrong."
    ],
    score: 0
  }
], -5.5, 0, 1);

// ─────────────────────────────────────────────
// Character (simple low-poly humanoid)
// ─────────────────────────────────────────────

const character = new THREE.Group();
const bodyMat = createMaterial(0x6b8afd);
const skinMat = createMaterial(0xf5c6a0);

const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 8), bodyMat);
torso.position.y = 1.0;
character.add(torso);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
head.position.y = 1.55;
character.add(head);

// Simple eyes
const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
const eyeMat = createMaterial(0x111111);
const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
leftEye.position.set(-0.08, 1.58, 0.18);
character.add(leftEye);
const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
rightEye.position.set(0.08, 1.58, 0.18);
character.add(rightEye);

// Arms
const armGeo = new THREE.CapsuleGeometry(0.08, 0.35, 4, 8);
const leftArm = new THREE.Mesh(armGeo, bodyMat);
leftArm.position.set(-0.4, 1.05, 0);
leftArm.rotation.z = 0.3;
character.add(leftArm);
const rightArm = new THREE.Mesh(armGeo, bodyMat);
rightArm.position.set(0.4, 1.05, 0);
rightArm.rotation.z = -0.3;
character.add(rightArm);

// Legs
const legGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 8);
const leftLeg = new THREE.Mesh(legGeo, createMaterial(0x334155));
leftLeg.position.set(-0.15, 0.35, 0);
character.add(leftLeg);
const rightLeg = new THREE.Mesh(legGeo, createMaterial(0x334155));
rightLeg.position.set(0.15, 0.35, 0);
character.add(rightLeg);

character.position.set(0, 0, 0);
character.traverse((c) => {
  if ((c as THREE.Mesh).isMesh) {
    c.castShadow = true;
    c.receiveShadow = true;
  }
});
scene.add(character);

// ─────────────────────────────────────────────
// Controls
// ─────────────────────────────────────────────

const keys: Record<string, boolean> = {};
const direction = new THREE.Vector3();
let isMoving = false;

window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Mouse look (simple orbit around character)
let isDragging = false;
let prevMouse = { x: 0, y: 0 };
let cameraAngle = Math.PI / 4;
let cameraHeight = 6.5;
let cameraDist = 11;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0) {
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('pointerup', () => { isDragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - prevMouse.x;
  const dy = e.clientY - prevMouse.y;
  cameraAngle -= dx * 0.005;
  cameraHeight = Math.max(3, Math.min(12, cameraHeight + dy * 0.02));
  prevMouse = { x: e.clientX, y: e.clientY };
});

// Click to interact
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', (e) => {
  if (isGameOver) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const allMeshes: THREE.Object3D[] = [];
  interactables.forEach(i => {
    i.mesh.traverse(c => { if ((c as any).isMesh) allMeshes.push(c); });
  });

  const hits = raycaster.intersectObjects(allMeshes, true);
  if (hits.length > 0) {
    let hitObj = hits[0].object;
    while (hitObj.parent && !interactables.find(i => i.mesh === hitObj)) {
      hitObj = hitObj.parent;
    }
    const target = interactables.find(i => i.mesh === hitObj);
    if (target) {
      const dist = character.position.distanceTo(target.position);
      if (dist > 2.8) {
        showSpeech("Too far. My first-world legs refuse to walk that far without motivation.");
        return;
      }
      openActionPanel(target);
    }
  }
});

// ─────────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────────

function updateNeedBars() {
  (Object.keys(needs) as NeedKey[]).forEach(key => {
    const n = needs[key];
    const bar = document.getElementById(`bar-${key}`) as HTMLElement;
    const val = document.getElementById(`val-${key}`) as HTMLElement;
    if (!bar || !val) return;
    const pct = Math.max(0, Math.min(100, n.value));
    bar.style.width = pct + '%';
    val.textContent = Math.round(pct).toString();

    if (pct > 60) bar.style.background = 'var(--good)';
    else if (pct > 30) bar.style.background = 'var(--warn)';
    else bar.style.background = 'var(--bad)';
  });
}

function showSpeech(text: string, duration = 3500) {
  const bubble = document.getElementById('speech-bubble')!;
  const p = document.getElementById('speech-text')!;
  p.textContent = text;
  bubble.classList.remove('hidden');
  if (speechTimeout) clearTimeout(speechTimeout);
  speechTimeout = window.setTimeout(() => {
    bubble.classList.add('hidden');
  }, duration);
}

function openActionPanel(item: Interactable) {
  const panel = document.getElementById('action-panel')!;
  const title = document.getElementById('action-title')!;
  const buttons = document.getElementById('action-buttons')!;
  title.textContent = item.name;
  buttons.innerHTML = '';

  item.actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.onclick = () => performAction(action);
    buttons.appendChild(btn);
  });

  panel.classList.remove('hidden');
}

function closeActionPanel() {
  document.getElementById('action-panel')!.classList.add('hidden');
}

document.getElementById('close-actions')!.onclick = closeActionPanel;

function performAction(action: Action) {
  closeActionPanel();
  if (isGameOver) return;

  (Object.keys(action.effect) as NeedKey[]).forEach(key => {
    needs[key].value = Math.max(0, Math.min(100, needs[key].value + (action.effect[key] || 0)));
  });

  if (action.score) score += action.score;
  document.getElementById('score-value')!.textContent = score.toString();

  const line = action.speech[Math.floor(Math.random() * action.speech.length)];
  showSpeech(line);

  updateNeedBars();
  checkMeltdown();
}

// ─────────────────────────────────────────────
// Random First World Problems
// ─────────────────────────────────────────────

const problemPool: ProblemEvent[] = [
  {
    title: "The Wi-Fi is... fine?",
    description: "Your download speed dropped from 940 Mbps to 870 Mbps. You can feel the difference in your soul.",
    impact: { connectivity: -18, vibe: -5 }
  },
  {
    title: "Someone liked your 3-year-old photo",
    description: "An acquaintance just liked a photo from 2023. The algorithm is mocking your past self.",
    impact: { validation: -12, vibe: -8 }
  },
  {
    title: "Oat milk is slightly warm",
    description: "You left the oat milk out for 7 minutes. It is no longer refrigerator-cold. Crisis.",
    impact: { caffeine: -10, vibe: -15 }
  },
  {
    title: "Battery anxiety",
    description: "Your phone is at 19%. You are now operating under emergency protocols.",
    impact: { battery: -20 }
  },
  {
    title: "The plant has a brown tip",
    description: "One leaf on the fiddle leaf fig has a microscopic brown edge. You have failed as a caretaker.",
    impact: { vibe: -22, validation: -5 }
  },
  {
    title: "No new notifications for 11 minutes",
    description: "The silence is deafening. Does anyone even know you exist?",
    impact: { validation: -18 }
  },
  {
    title: "Coffee order was 'almost' perfect",
    description: "They used the wrong alternative milk. You said oat. They heard almond. Everything is ruined.",
    impact: { caffeine: -15, vibe: -12 }
  },
  {
    title: "Your story only got 14 views",
    description: "You carefully curated a 15-second moment of your life. 14 people saw it. One of them was you.",
    impact: { validation: -20, vibe: -10 }
  },
  {
    title: "The lighting is off",
    description: "Golden hour is over. Your apartment now looks like a fluorescent waiting room.",
    impact: { vibe: -18 }
  },
  {
    title: "An influencer posted the exact same outfit",
    description: "You thought you were unique. You were not. The algorithm has spoken.",
    impact: { validation: -15, vibe: -10 }
  },
  {
    title: "Delivery is 8 minutes late",
    description: "The app said 22-32 minutes. It has been 33. You are considering writing a review.",
    impact: { caffeine: -8, vibe: -12 }
  },
  {
    title: "Your AirPods case is at 12%",
    description: "You have approximately 40 minutes of wireless freedom remaining. Choose wisely.",
    impact: { battery: -10, connectivity: -5 }
  }
];

function triggerRandomEvent() {
  if (isGameOver) return;
  const event = problemPool[Math.floor(Math.random() * problemPool.length)];

  (Object.keys(event.impact) as NeedKey[]).forEach(key => {
    needs[key].value = Math.max(0, Math.min(100, needs[key].value + (event.impact[key] || 0)));
  });

  document.getElementById('event-title')!.textContent = '🚨 ' + event.title;
  document.getElementById('event-desc')!.textContent = event.description;
  document.getElementById('event-modal')!.classList.remove('hidden');

  updateNeedBars();
}

document.getElementById('event-dismiss')!.onclick = () => {
  document.getElementById('event-modal')!.classList.add('hidden');
  showSpeech("I will survive this. I have survived worse. (I haven't.)");
  checkMeltdown();
};

// ─────────────────────────────────────────────
// Meltdown & Game Over
// ─────────────────────────────────────────────

function checkMeltdown() {
  const critical = (Object.values(needs) as NeedState[]).filter(n => n.value < 15).length;

  if (critical >= 2 || (Object.values(needs) as NeedState[]).some(n => n.value <= 0)) {
    triggerGameOver();
  } else if ((Object.values(needs) as NeedState[]).filter(n => n.value < 30).length >= 3) {
    meltdownLevel = Math.min(3, meltdownLevel + 1);
    if (meltdownLevel === 1) showSpeech("I am one inconvenience away from a full spiral.");
    if (meltdownLevel === 2) showSpeech("Why is everything so HARD? I just wanted a normal day!");
  } else {
    meltdownLevel = Math.max(0, meltdownLevel - 0.02);
  }
}

function triggerGameOver() {
  isGameOver = true;
  const reasons = [];
  if (needs.caffeine.value <= 5) reasons.push("caffeine deficiency");
  if (needs.battery.value <= 5) reasons.push("phone battery trauma");
  if (needs.validation.value <= 5) reasons.push("validation starvation");
  if (needs.vibe.value <= 5) reasons.push("catastrophic vibe collapse");
  if (needs.connectivity.value <= 5) reasons.push("Wi-Fi related existential dread");

  const reasonText = reasons.length
    ? `You succumbed to ${reasons.join(' and ')}.`
    : "The weight of modern existence finally crushed you.";

  document.getElementById('game-over-text')!.textContent = reasonText;
  document.getElementById('final-days')!.textContent = day.toString();
  document.getElementById('final-score')!.textContent = score.toString();
  document.getElementById('game-over')!.classList.remove('hidden');

  showSpeech("I can't do this anymore. The oat milk was the final straw.");
}

document.getElementById('restart-btn')!.onclick = () => {
  needs.caffeine.value = 85;
  needs.connectivity.value = 90;
  needs.battery.value = 70;
  needs.validation.value = 60;
  needs.vibe.value = 80;
  score = 0;
  day = 1;
  gameTime = 9 * 60;
  isGameOver = false;
  meltdownLevel = 0;
  lastEventTime = 0;
  character.position.set(0, 0, 0);
  document.getElementById('score-value')!.textContent = '0';
  document.getElementById('day-value')!.textContent = '1';
  document.getElementById('game-over')!.classList.add('hidden');
  updateNeedBars();
  showSpeech("New day. Same fragile psyche. Let's do this.");
};

// ─────────────────────────────────────────────
// Time & Needs Drain
// ─────────────────────────────────────────────

function updateTimeDisplay() {
  const hours = Math.floor(gameTime / 60) % 24;
  const mins = Math.floor(gameTime % 60);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  document.getElementById('time-value')!.textContent =
    `${h12}:${mins.toString().padStart(2, '0')} ${ampm}`;
  document.getElementById('day-value')!.textContent = day.toString();
}

// ─────────────────────────────────────────────
// Animation Loop
// ─────────────────────────────────────────────

const clock = new THREE.Clock();
let bobPhase = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!isGameOver) {
    (Object.keys(needs) as NeedKey[]).forEach(key => {
      needs[key].value = Math.max(0, needs[key].value - needs[key].drainRate * dt);
    });

    gameTime += dt * 2;
    if (gameTime >= 24 * 60) {
      gameTime -= 24 * 60;
      day++;
    }
    updateTimeDisplay();

    lastEventTime += dt;
    if (lastEventTime > 50 + Math.random() * 40) {
      lastEventTime = 0;
      triggerRandomEvent();
    }

    updateNeedBars();
    checkMeltdown();
  }

  // Character movement — camera-relative so W/S/A/D feel natural
  const sinA = Math.sin(cameraAngle);
  const cosA = Math.cos(cameraAngle);
  // Forward = opposite of camera offset (into the view)
  const fx = -sinA;
  const fz = -cosA;
  // Right relative to camera
  const rx = cosA;
  const rz = -sinA;

  let moveX = 0;
  let moveZ = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    { moveX += fx; moveZ += fz; }
  if (keys['KeyS'] || keys['ArrowDown'])  { moveX -= fx; moveZ -= fz; }
  if (keys['KeyD'] || keys['ArrowRight']) { moveX += rx; moveZ += rz; }
  if (keys['KeyA'] || keys['ArrowLeft'])  { moveX -= rx; moveZ -= rz; }

  if (moveX !== 0 || moveZ !== 0) {
    const len = Math.hypot(moveX, moveZ) || 1;
    moveX = (moveX / len) * 3.5 * dt;
    moveZ = (moveZ / len) * 3.5 * dt;
    character.position.x += moveX;
    character.position.z += moveZ;

    character.rotation.y = Math.atan2(moveX, moveZ);

    character.position.x = Math.max(-6, Math.min(6, character.position.x));
    character.position.z = Math.max(-5, Math.min(5, character.position.z));

    isMoving = true;
    bobPhase += dt * 12;
    character.position.y = Math.abs(Math.sin(bobPhase)) * 0.08;
  } else {
    isMoving = false;
    character.position.y = 0;
  }

  if (meltdownLevel > 1.5 && !isGameOver) {
    character.rotation.y += dt * 4;
    torso.rotation.z = Math.sin(clock.elapsedTime * 8) * 0.15;
  } else {
    torso.rotation.z *= 0.9;
  }

  // Camera follow
  const targetX = character.position.x + Math.sin(cameraAngle) * cameraDist;
  const targetZ = character.position.z + Math.cos(cameraAngle) * cameraDist;
  camera.position.x += (targetX - camera.position.x) * 0.08;
  camera.position.z += (targetZ - camera.position.z) * 0.08;
  camera.position.y += (cameraHeight - camera.position.y) * 0.08;
  camera.lookAt(character.position.x, 1.2, character.position.z);

  leftArm.rotation.x = Math.sin(clock.elapsedTime * 1.5) * 0.08;
  rightArm.rotation.x = Math.sin(clock.elapsedTime * 1.5 + 1) * 0.08;

  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────
// Resize & Start
// ─────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateNeedBars();
showSpeech("Welcome to your beautifully curated, deeply fragile existence. Try not to spiral.");
animate();

console.log('%c☕ First World Problems loaded', 'color:#ff6b9d;font-size:14px;font-weight:bold');
console.log('Click objects to interact. Survive the privilege.');
