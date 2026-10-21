import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Chess } from 'chess.js';
import { advanceHeroMotion, IDLE_SPEED } from './heroMotion';

gsap.registerPlugin(ScrollTrigger);
// Pieces: Poly Haven "Chess Set" (Riley Queen, CC0) - see public/models/staunton/NOTICE.md.
// The board is a procedural maple/walnut wooden board (user-selected Staunton + wood direction).
// Uncompressed source glTF + 1k JPEG textures (user preference: no compression).
const PIECE_URL = '/models/staunton/chess_pieces_1k.gltf';
useLoader.preload(GLTFLoader, PIECE_URL);
// Entrance: board rises/sweeps in, then pieces drop file-by-file.
const ENTRANCE = { board: 1.4, pieceDelay: .45, stagger: .028, drop: .55, height: 2.2 };
const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeBack = t => { t = Math.min(1, Math.max(0, t)); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const MODEL_SQUARE = 0.0578817; // source grid pitch in metres; scene square = 1 unit
const TYPE_NAMES = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };
// Some glTF exports store normalized int attributes; transforming them in place
// clamps to [-1, 1] and flattens tall pieces, so expand to float32 first.
function toFloatGeometry(source) {
  const geometry = new THREE.BufferGeometry(); geometry.setIndex(source.index ? source.index.clone() : null);
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  return geometry;
}
function extractPieces(gltf) {
  const result = {};
  gltf.scene.traverse(node => {
    const match = node.isMesh && /^piece_(\w+)_(white|black)/.exec(node.name || node.parent?.name || '');
    if (!match) return;
    const type = Object.keys(TYPE_NAMES).find(key => TYPE_NAMES[key] === match[1]), key = match[2][0] + type;
    if (result[key]) return;
    // Bake the node's rotation/scale (quantization stores scale on nodes), then centre on its own base.
    node.updateWorldMatrix(true, false);
    const geometry = toFloatGeometry(node.geometry).applyMatrix4(node.matrixWorld); geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox; geometry.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
    geometry.scale(1 / MODEL_SQUARE, 1 / MODEL_SQUARE, 1 / MODEL_SQUARE);
    const material = node.material.clone(); material.envMapIntensity = 1;
    result[key] = { geometry, material };
  });
  return result;
}
function woodTexture(base, grain, seed, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  let r = seed; const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const y = rand() * size, amp = 2 + rand() * 6, freq = .01 + rand() * .03, phase = rand() * 6;
    ctx.strokeStyle = grain; ctx.globalAlpha = .05 + rand() * .14; ctx.lineWidth = .6 + rand() * 2.2; ctx.beginPath();
    for (let x = 0; x <= size; x += 8) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
function Instances({ geometry, material, positions, entrance }) {
  const ref = useRef(null);
  const write = (progress) => { const matrix = new THREE.Matrix4(); positions.forEach(([x, y, z, rotation = 0, order = 0], index) => { const t = entrance ? easeBack((progress - ENTRANCE.pieceDelay - order * ENTRANCE.stagger) / ENTRANCE.drop) : 1; const s = Math.max(.001, t); matrix.makeRotationY(rotation); matrix.scale(new THREE.Vector3(s, s, s)); matrix.setPosition(x, y + (1 - Math.min(1, t)) * ENTRANCE.height, z); ref.current.setMatrixAt(index, matrix); }); ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere(); };
  useLayoutEffect(() => { write(entrance ? entrance.current : 1); }, [positions]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => { if (entrance && entrance.current < ENTRANCE.pieceDelay + 32 * ENTRANCE.stagger + ENTRANCE.drop + .1) write(entrance.current); });
  return <instancedMesh ref={ref} args={[geometry, material, positions.length]} castShadow receiveShadow />;
}
function Scene({ fen, active, host, motion, onFailure }) {
  const group = useRef(null), stage = useRef(null), entrance = useRef(0), particles = useRef(null), frames = useRef(0), { gl, scene, size, invalidate } = useThree();
  const gltf = useLoader(GLTFLoader, PIECE_URL);
  const assets = useMemo(() => {
    const pieces = extractPieces(gltf);
    const light = woodTexture('#d9b98a', '#8a6236', 11), dark = woodTexture('#5a3520', '#24130a', 29), rim = woodTexture('#3b2214', '#140904', 47, 512);
    const materials = { light: new THREE.MeshStandardMaterial({ map: light, roughness: .42 }), dark: new THREE.MeshStandardMaterial({ map: dark, roughness: .45 }), frame: new THREE.MeshStandardMaterial({ map: rim, roughness: .35 }), inlay: new THREE.MeshStandardMaterial({ color: '#c9a45c', roughness: .3, metalness: .6 }), particles: new THREE.PointsMaterial({ color: '#f5cf49', size: .035, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }) };
    const tile = new THREE.BoxGeometry(1, .06, 1), frame = new THREE.BoxGeometry(9.2, .32, 9.2), inlay = new THREE.BoxGeometry(8.16, .3, 8.16), particleGeometry = new THREE.BufferGeometry(), points = [];
    for (let i = 0; i < 80; i++) { const a = i * 2.39996, radius = 5.5 + (i % 9) * .27; points.push(Math.cos(a) * radius, -.2 + i % 7 * .3, Math.sin(a) * radius); }
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return { pieces, materials, textures: [light, dark, rim], tile, frame, inlay, particleGeometry };
  }, [gltf]);
  useEffect(() => { const pmrem = new THREE.PMREMGenerator(gl), env = pmrem.fromScene(new RoomEnvironment(), .04); scene.environment = env.texture; scene.environmentIntensity = .55; return () => { scene.environment = null; env.dispose(); pmrem.dispose(); }; }, [gl, scene]);
  useEffect(() => () => { Object.values(assets.pieces).forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); }); Object.values(assets.materials).forEach(value => value.dispose()); assets.textures.forEach(value => value.dispose()); [assets.tile, assets.frame, assets.inlay, assets.particleGeometry].forEach(value => value.dispose()); }, [assets]);
  useEffect(() => { assets.particleGeometry.setDrawRange(0, size.width < 600 ? 24 : 80); }, [assets, size.width]);
  useEffect(() => {
    if (!active) return;
    let frame, last = 0;
    const tick = time => { if (time - last >= 1000 / 30) { last = time; invalidate(); } frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, invalidate]);
  useEffect(() => { const lost = event => { event.preventDefault(); onFailure(); }; gl.domElement.addEventListener('webglcontextlost', lost); return () => gl.domElement.removeEventListener('webglcontextlost', lost); }, [gl, onFailure]);
  const tiles = useMemo(() => {
    const result = [[], []]; for (let row = 0; row < 8; row++) for (let file = 0; file < 8; file++) result[(row + file) % 2].push([file - 3.5, .03, row - 3.5, (row * 8 + file) % 4 * Math.PI / 2]); return result;
  }, []);
  const pieces = useMemo(() => {
    const result = {}; new Chess(fen).board().flat().filter(Boolean).forEach(piece => { const key = piece.color + piece.type; (result[key] ||= []).push([piece.square.charCodeAt(0) - 97 - 3.5, .06, 8 - Number(piece.square[1]) - 3.5, Math.PI, (piece.square.charCodeAt(0) - 97) * 4 + (Number(piece.square[1]) - 1) / 2]); }); return result;
  }, [fen]);
  useFrame((_, delta) => {
    if (!active) return;
    entrance.current += Math.min(delta, 1 / 20);
    const b = easeOut(entrance.current / ENTRANCE.board); stage.current.position.y = (1 - b) * -2.4; stage.current.rotation.y = (1 - b) * -1.1; stage.current.scale.setScalar(.82 + .18 * b);
    motion.current = advanceHeroMotion(motion.current, delta); group.current.rotation.y = motion.current.angle;
    if (particles.current) particles.current.rotation.y = -motion.current.angle * .35;
    frames.current++;
    if (frames.current === 2 && host.current) host.current.dataset.ready = 'true';
    if (frames.current % 10 === 0 && host.current) { host.current.dataset.frames = String(frames.current); host.current.dataset.angle = String(motion.current.angle); host.current.dataset.speed = String(motion.current.speed); }
  });
  return <group dispose={null}>
    <ambientLight intensity={.35} /><directionalLight position={[5, 9, 6]} intensity={2.6} color="#fff1d6" /><directionalLight position={[-6, 5, -7]} intensity={1.6} color="#c9d4ff" /><pointLight position={[0, 4, -6]} intensity={18} color="#f5cf49" distance={14} />
    <group ref={stage}><group ref={group} rotation={[.03, .5, -.02]}><mesh geometry={assets.frame} material={assets.materials.frame} position={[0, -.16, 0]} /><mesh geometry={assets.inlay} material={assets.materials.inlay} position={[0, -.13, 0]} /><Instances geometry={assets.tile} material={assets.materials.light} positions={tiles[0]} /><Instances geometry={assets.tile} material={assets.materials.dark} positions={tiles[1]} />{Object.entries(pieces).filter(([key]) => assets.pieces[key]).map(([key, positions]) => <Instances key={key} geometry={assets.pieces[key].geometry} material={assets.pieces[key].material} positions={positions} entrance={entrance} />)}</group></group>
    <points ref={particles} geometry={assets.particleGeometry} material={assets.materials.particles} />
  </group>;
}
export default function HeroChessScene({ fen, container, onFailure, paused }) {
  const host = useRef(null), motion = useRef({ angle: .5, speed: IDLE_SPEED, impulse: 0 });
  const [intersecting, setIntersecting] = useState(true), [visible, setVisible] = useState(!document.hidden);
  const active = intersecting && visible && !paused;
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setIntersecting(entries[0].isIntersecting), { threshold: .05 }); observer.observe(host.current);
    const visibility = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', visibility);
    const context = gsap.context(() => { ScrollTrigger.create({ trigger: container.current, start: 'top bottom', end: 'bottom top', onUpdate: self => { if (!document.hidden) motion.current.impulse = Math.abs(self.getVelocity()) * self.direction; } }); }, container);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); context.revert(); };
  }, [container]);
  return <div className="hero-scene" ref={host} data-active={active} aria-hidden="true"><Canvas frameloop="demand" dpr={[1, 1.25]} camera={{ position: [4.6, 6.2, 6.4], fov: 46 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power', toneMapping: THREE.ACESFilmicToneMapping }}><Scene fen={fen} active={active} host={host} motion={motion} onFailure={onFailure} /></Canvas></div>;
}
