import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

// Celestial Body Definitions
const ASTRO_TYPES = {
    SUN: { mass: 150, color: '#ffaa00', glow: 'rgba(255, 170, 0, 0.15)', radius: 8, name: 'Yellow Dwarf' },
    RED_GIANT: { mass: 300, color: '#ff3300', glow: 'rgba(255, 50, 0, 0.15)', radius: 24, name: 'Red Supergiant' },
    BLUE_GIANT: { mass: 450, color: '#0088ff', glow: 'rgba(0, 136, 255, 0.2)', radius: 14, name: 'Blue Giant' },
    WHITE_DWARF: { mass: 120, color: '#e8f0ff', glow: 'rgba(200, 220, 255, 0.2)', radius: 4, name: 'White Dwarf' },
    NEUTRON_STAR: { mass: 900, color: '#aaff88', glow: 'rgba(100, 255, 80, 0.25)', radius: 3, name: 'Neutron Star' },
    PULSAR: { mass: 700, color: '#00ffff', glow: 'rgba(0, 255, 255, 0.3)', radius: 4, name: 'Pulsar (Gamma)' },
    BLACK_HOLE: { mass: 1800, color: '#000000', glow: 'rgba(168, 85, 247, 0.4)', radius: 6, type: 'BLACK_HOLE', horizon: 25, name: 'Black Hole' },
    WORMHOLE: { mass: 250, color: '#00ffcc', glow: 'rgba(0, 255, 204, 0.2)', radius: 10, type: 'WORMHOLE', horizon: 15, name: 'Wormhole' },
    DARK_MATTER: { mass: 600, color: 'transparent', glow: 'rgba(80, 0, 200, 0.12)', radius: 2, type: 'DARK_MATTER', name: 'Dark Matter Halo' },
    ANTIMATTER: { mass: -400, color: '#ff00ff', glow: 'rgba(255, 0, 255, 0.25)', radius: 7, type: 'ANTIMATTER', name: 'Antimatter (Repulsive)' },
};

export default function AstrophysicsEngine() {
    const canvasRef = useRef(null);

    const [showDocs, setShowDocs] = useState(false);
    const [mode, setMode] = useState('STAR');
    const [starType, setStarType] = useState('SUN');
    const [gravityG, setGravityG] = useState(5.0);
    const [cameraZoom, setCameraZoom] = useState(1.0);
    const [trailLength, setTrailLength] = useState(150);
    const [simSpeed, setSimSpeed] = useState(1.0);
    const [planetMass, setPlanetMass] = useState(1.0);
    const [paused, setPaused] = useState(false);
    const [planetCount, setPlanetCount] = useState(0);
    const [starCount, setStarCount] = useState(0);

    const gravityRef = useRef(gravityG);
    const zoomRef = useRef(cameraZoom);
    const trailRef = useRef(trailLength);
    const simSpeedRef = useRef(simSpeed);
    const planetMassRef = useRef(planetMass);
    const pausedRef = useRef(paused);
    const modeRef = useRef(mode);

    useEffect(() => { gravityRef.current = gravityG; }, [gravityG]);
    useEffect(() => { zoomRef.current = cameraZoom; }, [cameraZoom]);
    useEffect(() => { trailRef.current = trailLength; }, [trailLength]);
    useEffect(() => { simSpeedRef.current = simSpeed; }, [simSpeed]);
    useEffect(() => { planetMassRef.current = planetMass; }, [planetMass]);
    useEffect(() => { pausedRef.current = paused; }, [paused]);
    useEffect(() => { modeRef.current = mode; }, [mode]);

    const memRef = useRef({
        stars: [],
        planets: [],
        shockwaves: [],
        explosions: [],
        camera: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        dragStart: null,
        dragCurrent: null,
    });

    const getNeonHue = () => {
        const hues = [0, 30, 60, 120, 180, 240, 280, 320];
        return hues[Math.floor(Math.random() * hues.length)];
    };

    // --- 3D CAMERA PROJECTION ---
    const project3D = (wx, wy, wz, camX, camY, zoom, cx, cy) => {
        const focalLength = 600;
        const relX = (wx - camX) * zoom;
        const relY = (wy - camY) * zoom;
        const relZ = wz * zoom;
        const safeZ = Math.min(relZ, focalLength - 10);
        const scale = focalLength / (focalLength - safeZ);
        return { x: cx + relX * scale, y: cy + relY * scale, scale };
    };

    const unproject3D = (cssX, cssY, camX, camY, zoom, cx, cy) => {
        return {
            x: (cssX - cx) / zoom + camX,
            y: (cssY - cy) / zoom + camY,
        };
    };

    const getScreenXY = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    // --- MAIN PHYSICS + RENDER LOOP ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        let frameId;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.scale(dpr, dpr);
        };
        window.addEventListener('resize', resize);
        resize();

        const render = () => {
            frameId = requestAnimationFrame(render);

            const { stars, planets, shockwaves, explosions, dragStart, dragCurrent, camera } = memRef.current;
            const zoom = zoomRef.current;
            const G = gravityRef.current;
            const maxH = trailRef.current;
            const speed = simSpeedRef.current;
            const isPaused = pausedRef.current;
            const currentMode = modeRef.current;

            const W = window.innerWidth;
            const H = window.innerHeight;
            const cx = W / 2;
            const cy = H / 2;

            ctx.fillStyle = '#010103';
            ctx.fillRect(0, 0, W, H);

            if (!isPaused) {
                // --- 1. SHOCKWAVE EXPANSION & BLAST ---
                for (let i = shockwaves.length - 1; i >= 0; i--) {
                    const sw = shockwaves[i];
                    sw.prevRadius = sw.radius;
                    sw.radius += 8 * speed;

                    for (let j = 0; j < planets.length; j++) {
                        const p = planets[j];
                        if (p.dead) continue;
                        const dx = p.x - sw.x;
                        const dy = p.y - sw.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist <= sw.radius && dist >= sw.prevRadius && dist > 0.001) {
                            const blastForce = 6.0 / p.mass;
                            p.vx += (dx / dist) * blastForce;
                            p.vy += (dy / dist) * blastForce;
                            p.vz += (Math.random() - 0.5) * blastForce;
                        }
                    }
                    if (sw.radius > sw.maxRadius) shockwaves.splice(i, 1);
                }

                // --- 2. PHYSICS: High-Precision Symplectic Euler ---
                const subSteps = Math.round(20 * speed);
                const dt = 0.025;

                for (let step = 0; step < subSteps; step++) {
                    for (let i = 0; i < planets.length; i++) {
                        const p = planets[i];
                        if (p.dead) continue;

                        let ax = 0, ay = 0, az = 0;

                        // PLANET COLLISION FIX: Dynamic hitbox
                        for (let k = i + 1; k < planets.length; k++) {
                            const p2 = planets[k];
                            if (p2.dead) continue;
                            const dx = p.x - p2.x;
                            const dy = p.y - p2.y;
                            const dz = p.z - p2.z;
                            const distSq = dx * dx + dy * dy + dz * dz;

                            const collisionRadius = Math.max(1.5, (p.mass + p2.mass) * 0.8);
                            if (distSq < collisionRadius * collisionRadius) {
                                p.dead = true;
                                p2.dead = true;
                                explosions.push({ x: (p.x + p2.x) / 2, y: (p.y + p2.y) / 2, z: (p.z + p2.z) / 2, radius: 0, maxRadius: 35, color: '#ffcc00' });
                            }
                        }
                        if (p.dead) continue;

                        // STAR GRAVITY & COLLISION
                        for (let j = 0; j < stars.length; j++) {
                            const s = stars[j];
                            const astro = ASTRO_TYPES[s.type];

                            const dx = s.x - p.x;
                            const dy = s.y - p.y;
                            const dz = s.z - p.z;

                            const distSq = dx * dx + dy * dy + dz * dz + 10;
                            const dist = Math.sqrt(distSq);

                            // STAR COLLISION FIX: 50% grazing tolerance so planets can do extreme slingshots safely
                            if (dist < astro.radius * 0.5) {
                                p.dead = true;
                                explosions.push({ x: p.x, y: p.y, z: p.z, radius: 0, maxRadius: 40, color: '#ff3300' });
                                break;
                            }

                            // BLACK HOLE EVENT HORIZON
                            if (astro.type === 'BLACK_HOLE') {
                                if (dist < astro.horizon) {
                                    p.dead = true;
                                    break;
                                }
                                if (dist < 200) {
                                    const proximity = 1 - (dist / 200);
                                    const drag = 1 - (0.005 * proximity);
                                    p.vx *= drag; p.vy *= drag; p.vz *= drag;
                                }
                            }

                            // WORMHOLE TELEPORTATION
                            if (astro.type === 'WORMHOLE' && dist < astro.horizon) {
                                explosions.push({ x: p.x, y: p.y, z: p.z, radius: 0, maxRadius: 50, color: '#00ffcc' });
                                p.x = camera.x + (Math.random() - 0.5) * W * 0.8;
                                p.y = camera.y + (Math.random() - 0.5) * H * 0.8;
                                p.z = (Math.random() - 0.5) * 400;
                                p.history = [];
                                explosions.push({ x: p.x, y: p.y, z: p.z, radius: 0, maxRadius: 50, color: '#00ffcc' });
                                break;
                            }

                            // DARK MATTER & ANTIMATTER GRAVITY
                            if (astro.type === 'DARK_MATTER' || astro.type === 'ANTIMATTER') {
                                const force = (G * astro.mass) / distSq;
                                ax += (dx / dist) * force;
                                ay += (dy / dist) * force;
                                az += (dz / dist) * force;
                                continue;
                            }

                            // PULSAR KICK
                            if (astro.type === 'PULSAR' && dist < 80 && Math.random() < 0.002) {
                                const kick = 0.5 / p.mass;
                                p.vx += (-(dx / dist)) * kick;
                                p.vy += (-(dy / dist)) * kick;
                            }

                            // STANDARD GRAVITY (Newtonian)
                            const force = (G * astro.mass) / distSq;
                            ax += (dx / dist) * force;
                            ay += (dy / dist) * force;
                            az += (dz / dist) * force;
                        }

                        if (p.dead) continue;

                        p.vx += ax * dt;
                        p.vy += ay * dt;
                        p.vz += az * dt;

                        p.x += p.vx * dt;
                        p.y += p.vy * dt;
                        p.z += p.vz * dt;

                        p.z = Math.max(-600, Math.min(600, p.z));

                        if (!isFinite(p.x) || !isFinite(p.y)) { p.dead = true; continue; }
                    }
                }

                // Record trail history
                for (let i = 0; i < planets.length; i++) {
                    const p = planets[i];
                    if (!p.dead) {
                        p.history.push({ x: p.x, y: p.y, z: p.z });
                        if (p.history.length > maxH) p.history.shift();
                    }
                }

                memRef.current.planets = planets.filter(p => !p.dead);
            }

            // --- 3. RENDER ---

            // Trails
            for (let i = 0; i < memRef.current.planets.length; i++) {
                const p = memRef.current.planets[i];
                if (p.history.length < 2) continue;

                ctx.beginPath();
                const currentProj = project3D(p.x, p.y, p.z, camera.x, camera.y, zoom, cx, cy);
                ctx.lineWidth = Math.max(0.5, currentProj.scale * 1.2);

                for (let h = 0; h < p.history.length; h++) {
                    const alpha = h / p.history.length;
                    const pt = project3D(p.history[h].x, p.history[h].y, p.history[h].z, camera.x, camera.y, zoom, cx, cy);
                    if (h === 0) {
                        ctx.strokeStyle = `hsla(${p.hue}, 100%, 70%, 0)`;
                        ctx.moveTo(pt.x, pt.y);
                    } else {
                        ctx.strokeStyle = `hsla(${p.hue}, 100%, 70%, ${alpha * 0.7})`;
                        ctx.lineTo(pt.x, pt.y);
                    }
                }
                ctx.stroke();
            }

            // Explosions
            for (let i = explosions.length - 1; i >= 0; i--) {
                const exp = explosions[i];
                exp.radius += 2.5 * (simSpeedRef.current || 1);
                const proj = project3D(exp.x, exp.y, exp.z, camera.x, camera.y, zoom, cx, cy);
                const alpha = Math.max(0, 1 - exp.radius / exp.maxRadius);
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, exp.radius * zoom * proj.scale, 0, Math.PI * 2);
                ctx.fillStyle = exp.color;
                ctx.globalAlpha = alpha;
                ctx.fill();
                ctx.globalAlpha = 1;
                if (exp.radius > exp.maxRadius) explosions.splice(i, 1);
            }

            // Shockwaves
            for (let i = 0; i < shockwaves.length; i++) {
                const sw = shockwaves[i];
                const proj = project3D(sw.x, sw.y, 0, camera.x, camera.y, zoom, cx, cy);
                const alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, sw.radius * zoom * proj.scale, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 0, 60, ${alpha})`;
                ctx.lineWidth = 4 * zoom;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(proj.x, proj.y, (sw.radius - 12) * zoom * proj.scale, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 120, 0, ${alpha * 0.4})`;
                ctx.lineWidth = 2 * zoom;
                ctx.stroke();
            }

            // Stars
            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                const astro = ASTRO_TYPES[s.type];
                const proj = project3D(s.x, s.y, s.z, camera.x, camera.y, zoom, cx, cy);
                const r = astro.radius * zoom * proj.scale;

                if (s.type === 'DARK_MATTER') {
                    const grad = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, r * 10);
                    grad.addColorStop(0, 'rgba(80, 0, 200, 0.18)');
                    grad.addColorStop(0.5, 'rgba(40, 0, 120, 0.08)');
                    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r * 10, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r * 2, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(130, 50, 255, 0.5)';
                    ctx.lineWidth = 1 * zoom;
                    ctx.setLineDash([4, 6]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else if (s.type === 'BLACK_HOLE' || s.type === 'WORMHOLE' || s.type === 'ANTIMATTER') {
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r + (12 * zoom), 0, Math.PI * 2);
                    ctx.strokeStyle = astro.glow;
                    ctx.lineWidth = 5 * zoom;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = astro.color === 'transparent' ? 'rgba(0,0,0,0)' : astro.color;
                    ctx.fill();
                } else if (s.type === 'PULSAR' || s.type === 'NEUTRON_STAR') {
                    const t = Date.now() * 0.003;
                    ctx.save();
                    ctx.globalAlpha = 0.18;
                    ctx.beginPath();
                    ctx.moveTo(proj.x, proj.y);
                    const bx = Math.cos(t) * 80 * zoom;
                    const by = Math.sin(t) * 80 * zoom;
                    ctx.lineTo(proj.x + bx, proj.y + by);
                    ctx.strokeStyle = astro.color;
                    ctx.lineWidth = 6 * zoom;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(proj.x, proj.y);
                    ctx.lineTo(proj.x - bx, proj.y - by);
                    ctx.stroke();
                    ctx.restore();

                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r * 3, 0, Math.PI * 2);
                    ctx.fillStyle = astro.glow;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = astro.color;
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r * 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = astro.glow;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = astro.color;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r * 1.5 + Math.sin(Date.now() * 0.005 + i) * r * 0.3, 0, Math.PI * 2);
                    ctx.strokeStyle = astro.glow.replace('0.15', '0.08');
                    ctx.lineWidth = 1 * zoom;
                    ctx.stroke();
                }
            }

            // Planets
            for (let i = 0; i < memRef.current.planets.length; i++) {
                const p = memRef.current.planets[i];
                const proj = project3D(p.x, p.y, p.z, camera.x, camera.y, zoom, cx, cy);
                const r = Math.max(1, (1 + (p.mass - 1) * 0.4) * proj.scale * zoom);

                ctx.beginPath();
                ctx.arc(proj.x, proj.y, r + 1, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, 0.2)`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
                ctx.fillStyle = `hsl(${p.hue}, 100%, 75%)`;
                ctx.fill();
            }

            // Slingshot drag vector
            if (currentMode === 'PLANET' && dragStart && dragCurrent) {
                const projStart = project3D(dragStart.x, dragStart.y, 0, camera.x, camera.y, zoom, cx, cy);
                const projCurrent = project3D(dragCurrent.x, dragCurrent.y, 0, camera.x, camera.y, zoom, cx, cy);

                const launchX = projStart.x + (projStart.x - projCurrent.x);
                const launchY = projStart.y + (projStart.y - projCurrent.y);

                ctx.beginPath();
                ctx.moveTo(projStart.x, projStart.y);
                ctx.lineTo(projCurrent.x, projCurrent.y);
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.moveTo(projStart.x, projStart.y);
                ctx.lineTo(launchX, launchY);
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(projStart.x, projStart.y, 5 * zoom, 0, Math.PI * 2);
                ctx.fillStyle = '#00f0ff';
                ctx.fill();
            }

            if (Math.random() < 0.033) {
                setPlanetCount(memRef.current.planets.length);
                setStarCount(memRef.current.stars.length);
            }
        };

        frameId = requestAnimationFrame(render);
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(frameId);
        };
    }, []);


    // --- INPUT HANDLERS ---
    const onPointerDown = (e) => {
        if (e.target.closest('.hud-panel')) return;
        const canvas = canvasRef.current;
        if (canvas) canvas.setPointerCapture(e.pointerId);

        const screen = getScreenXY(e);
        const { camera } = memRef.current;
        const zoom = zoomRef.current;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        const world = unproject3D(screen.x, screen.y, camera.x, camera.y, zoom, cx, cy);
        const currentMode = modeRef.current;

        if (currentMode === 'STAR') {
            memRef.current.stars.push({ x: world.x, y: world.y, z: 0, type: starType });
        } else if (currentMode === 'SUPERNOVA') {
            memRef.current.shockwaves.push({ x: world.x, y: world.y, radius: 0, prevRadius: 0, maxRadius: 4000 });
        } else if (currentMode === 'ASTEROID') {
            const count = 12;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const spread = 40 + Math.random() * 20;
                const spd = 1.5 + Math.random() * 1.0;
                memRef.current.planets.push({
                    x: world.x + Math.cos(angle) * spread,
                    y: world.y + Math.sin(angle) * spread,
                    z: (Math.random() - 0.5) * 20,
                    vx: Math.cos(angle + Math.PI / 2) * spd,
                    vy: Math.sin(angle + Math.PI / 2) * spd,
                    vz: (Math.random() - 0.5) * 0.2,
                    history: [], hue: 30 + Math.random() * 20, dead: false, mass: 0.5,
                });
            }
        } else if (currentMode === 'SOLAR_SYSTEM') {
            // TRUE KEPLER VELOCITY CALCULATOR
            memRef.current.stars.push({ x: world.x, y: world.y, z: 0, type: 'SUN' });
            for (let i = 1; i <= 6; i++) {
                const r = 50 * i + Math.random() * 5;
                const v = Math.sqrt((gravityG * ASTRO_TYPES.SUN.mass * r) / (r * r + 10));
                const angle = Math.random() * Math.PI * 2;
                memRef.current.planets.push({
                    x: world.x + Math.cos(angle) * r,
                    y: world.y + Math.sin(angle) * r,
                    z: (Math.random() - 0.5) * 10,
                    vx: Math.cos(angle + Math.PI / 2) * v,
                    vy: Math.sin(angle + Math.PI / 2) * v,
                    vz: (Math.random() - 0.5) * 0.1,
                    history: [], hue: getNeonHue(), dead: false, mass: 1.0,
                });
            }
        } else if (currentMode === 'PLANET') {
            memRef.current.dragStart = world;
            memRef.current.dragCurrent = world;
        } else if (currentMode === 'CAMERA') {
            memRef.current.dragStart = screen;
        }
    };

    const onPointerMove = (e) => {
        const screen = getScreenXY(e);
        const { camera } = memRef.current;
        const zoom = zoomRef.current;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const currentMode = modeRef.current;

        if (currentMode === 'PLANET' && memRef.current.dragStart) {
            memRef.current.dragCurrent = unproject3D(screen.x, screen.y, camera.x, camera.y, zoom, cx, cy);
        } else if (currentMode === 'CAMERA' && memRef.current.dragStart) {
            const dx = screen.x - memRef.current.dragStart.x;
            const dy = screen.y - memRef.current.dragStart.y;
            memRef.current.camera.x -= dx / zoom;
            memRef.current.camera.y -= dy / zoom;
            memRef.current.dragStart = screen;
        }
    };

    const onPointerUp = (e) => {
        const canvas = canvasRef.current;
        if (canvas && canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }

        const currentMode = modeRef.current;
        if (currentMode === 'PLANET' && memRef.current.dragStart && memRef.current.dragCurrent) {
            const start = memRef.current.dragStart;
            const end = memRef.current.dragCurrent;
            const mass = planetMassRef.current;
            const dragDist = Math.hypot(start.x - end.x, start.y - end.y);

            let vx = 0, vy = 0, vz = (Math.random() - 0.5) * 0.5;

            // ORBITAL ASSIST: If you just tap without dragging, the engine mathematically calculates 
            // the exact velocity needed for a perfect orbit and launches it for you.
            if (dragDist < 5) {
                let bestStar = null;
                let maxForce = 0;

                memRef.current.stars.forEach(s => {
                    const dx = start.x - s.x;
                    const dy = start.y - s.y;
                    const dz = start.z - s.z || 0;
                    const distSq = dx * dx + dy * dy + dz * dz + 10;
                    const force = Math.abs(ASTRO_TYPES[s.type].mass) / distSq;
                    if (force > maxForce) { maxForce = force; bestStar = s; }
                });

                if (bestStar) {
                    const dx = start.x - bestStar.x;
                    const dy = start.y - bestStar.y;
                    const r = Math.sqrt(dx * dx + dy * dy);
                    const v = Math.sqrt((gravityG * Math.abs(ASTRO_TYPES[bestStar.type].mass) * r) / (r * r + 10));

                    const angle = Math.atan2(dy, dx);
                    vx = Math.cos(angle + Math.PI / 2) * v;
                    vy = Math.sin(angle + Math.PI / 2) * v;
                }
            } else {
                // MANUAL SLINGSHOT (Multiplier boosted to 0.12 so you don't have to drag off the screen)
                vx = (start.x - end.x) * 0.12;
                vy = (start.y - end.y) * 0.12;
            }

            memRef.current.planets.push({
                x: start.x, y: start.y, z: 0,
                vx, vy, vz,
                history: [], hue: getNeonHue(), dead: false, mass,
            });
        }

        memRef.current.dragStart = null;
        memRef.current.dragCurrent = null;
    };

    const onWheel = (e) => {
        e.preventDefault();
        setCameraZoom(prev => Math.max(0.1, Math.min(5.0, prev - e.deltaY * 0.001)));
    };

    const clearUniverse = () => {
        memRef.current.stars = [];
        memRef.current.planets = [];
        memRef.current.shockwaves = [];
        memRef.current.explosions = [];
        setPlanetCount(0);
        setStarCount(0);
    };

    const modeHint = {
        STAR: 'Tap to place a gravitational body.',
        PLANET: 'Tap for Auto-Orbit. Drag backward to slingshot.',
        SUPERNOVA: 'Tap to detonate a kinetic shockwave.',
        CAMERA: 'Drag to pan the universe.',
        ASTEROID: 'Tap to spawn an asteroid belt ring.',
        SOLAR_SYSTEM: 'Tap to spawn a pre-balanced Solar System.'
    };

    return (
        <div className="app-container">
            <canvas
                ref={canvasRef}
                className="spirograph-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
            />

            <div className="hud-panel">
                <div style={{ textAlign: 'center', marginBottom: '0.2rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1rem', color: '#ffaa00', textTransform: 'uppercase', letterSpacing: '2px' }}>
                        Andy Space Lab
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.6rem', color: '#888' }}>
                        {modeHint[mode]}
                        <span style={{ marginLeft: '0.8rem', color: '#555' }}>
                            ★ {starCount} &nbsp;● {planetCount}
                        </span>
                        {paused && <span style={{ marginLeft: '0.6rem', color: '#ff3300' }}>⏸ PAUSED</span>}
                    </p>
                </div>

                <div className="btn-group" style={{ marginBottom: '0.4rem' }}>
                    <button className={`btn ${mode === 'STAR' ? 'btn-star' : ''}`} onClick={() => setMode('STAR')}>Stars</button>
                    <button className={`btn ${mode === 'PLANET' ? 'btn-planet' : ''}`} onClick={() => setMode('PLANET')}>Launch</button>
                    <button className={`btn ${mode === 'SOLAR_SYSTEM' ? 'btn-star' : ''}`} onClick={() => setMode('SOLAR_SYSTEM')}>System</button>
                    <button className={`btn ${mode === 'ASTEROID' ? 'btn-planet' : ''}`} onClick={() => setMode('ASTEROID')}>Belt</button>
                    <button className={`btn ${mode === 'SUPERNOVA' ? 'btn-nova' : ''}`} onClick={() => setMode('SUPERNOVA')}>Nova</button>
                    <button className={`btn ${mode === 'CAMERA' ? 'btn-star' : ''}`} onClick={() => setMode('CAMERA')}>Pan</button>
                </div>

                <div className="controls-grid">
                    <div className="control-item">
                        <label>Stellar Classification</label>
                        <select
                            className="astro-select"
                            value={starType}
                            onChange={(e) => { setStarType(e.target.value); setMode('STAR'); }}
                            style={{ borderColor: mode === 'STAR' ? '#ffaa00' : '#444' }}
                        >
                            <option value="SUN">Yellow Dwarf</option>
                            <option value="WHITE_DWARF">White Dwarf</option>
                            <option value="RED_GIANT">Red Supergiant</option>
                            <option value="BLUE_GIANT">Blue Giant</option>
                            <option value="NEUTRON_STAR">Neutron Star</option>
                            <option value="PULSAR">Pulsar (Gamma)</option>
                            <option value="BLACK_HOLE">Black Hole</option>
                            <option value="WORMHOLE">Wormhole</option>
                            <option value="DARK_MATTER">Dark Matter Halo</option>
                            <option value="ANTIMATTER">Antimatter (Repulsive)</option>
                        </select>
                    </div>

                    <div className="control-item">
                        <label>Gravity G — {gravityG.toFixed(1)}</label>
                        <input type="range" min="0.5" max="20.0" step="0.5" value={gravityG} onChange={e => setGravityG(parseFloat(e.target.value))} />
                    </div>
                    <div className="control-item">
                        <label>Sim Speed — {simSpeed.toFixed(1)}x</label>
                        <input type="range" min="0.1" max="4.0" step="0.1" value={simSpeed} onChange={e => setSimSpeed(parseFloat(e.target.value))} />
                    </div>
                    <div className="control-item">
                        <label>Zoom — {cameraZoom.toFixed(2)}x</label>
                        <input type="range" min="0.1" max="5.0" step="0.05" value={cameraZoom} onChange={e => setCameraZoom(parseFloat(e.target.value))} />
                    </div>
                    <div className="control-item">
                        <label>Trail Length — {trailLength}</label>
                        <input type="range" min="10" max="500" step="10" value={trailLength} onChange={e => setTrailLength(parseInt(e.target.value))} />
                    </div>
                    <div className="control-item">
                        <label>Planet Mass — {planetMass.toFixed(1)}</label>
                        <input type="range" min="0.5" max="5.0" step="0.5" value={planetMass} onChange={e => setPlanetMass(parseFloat(e.target.value))} />
                    </div>
                </div>

                <div className="btn-group" style={{ marginTop: '0.2rem' }}>
                    <button className={`btn ${paused ? 'btn-nova' : ''}`} onClick={() => setPaused(p => !p)}>
                        {paused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                    <button className="btn btn-danger" onClick={clearUniverse}>Clear Void</button>
                    <button className="btn" style={{ borderColor: '#fff' }} onClick={() => setShowDocs(true)}>How It Works</button>
                </div>
            </div>

            <div className={`modal-overlay ${showDocs ? 'active' : ''}`} onClick={() => setShowDocs(false)}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h2>Andy's Space Lab</h2>

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255, 170, 0, 0.1)', borderLeft: '3px solid #ffaa00' }}>
                        <p style={{ fontStyle: 'italic', margin: 0, color: '#fde68a' }}>
                            I always liked planets. I actually would've worked for NASA, but my wife and kids said no. So I turned them down innit.
                            <br /><br /><span style={{ fontSize: '0.7rem', opacity: 0.7 }}> Now I'm unemployed</span>
                        </p>
                    </div>

                    <p>Welcome to my space lab. Every line is generated in real-time by a true 3D gravitational physics engine running substep Verlet integration, it's big science stuff I saw online. Here's how it works:</p>

                    <h3>1. Stars & Anomalies</h3>
                    <ul>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Yellow Dwarf & Blue Giant:</strong> Stable gravity wells. Close passes produce slingshot effects. 3D depth makes orbits tilt into spirograph patterns.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>White Dwarf:</strong> A dying star, lighter than a dwarf, ultra-small radius. Great for tight, chaotic orbits.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Red Supergiant:</strong> Massive radius; planets crash into the surface easily.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Neutron Star & Pulsar:</strong> Collapsed cores of dead stars. Pulsars emit rotating gamma beams that kick nearby planets sideways.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Black Hole:</strong> Relativistic drag spirals planets into the event horizon. Cross the horizon and they vanish silently.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Wormhole:</strong> Enter the horizon and your planet quantum-teleports to a random point, keeping its velocity.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Dark Matter Halo:</strong> Completely invisible it has no surface, no glow core, but exerts strong gravity. You can feel it without seeing it.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Antimatter (Repulsive):</strong> Contains negative mass. Instead of pulling planets into orbit, it violently pushes them off-course</li>
                    </ul>

                    <h3>2. Launch Modes</h3>
                    <ul>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Auto-Orbit:</strong> If you simply TAP in planet mode without dragging, the engine calculates the exact Kepler velocity needed and launches a perfectly stable circular orbit for you.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>System:</strong> Tap anywhere to instantly spawn a Yellow Dwarf with a perfectly balanced, mathematically correct solar system of orbiting planets.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Asteroid Belt:</strong> Taps spawn 12 asteroids in a ring with tangential velocity it makes an instant mini solar system or whatever.</li>
                    </ul>

                    <h3>3. Supernovas & Collisions</h3>
                    <p>The shockwave ring pushes any planet it sweeps through. Two planets colliding in 3D space or hitting a star surface which produces a fireball explosion. This can happen in real life btw, and we all finna die. This wasn't that easy to do so be easy on me. I'm not a programmer, it lowkey sucks to be one; No offense.</p>

                    <h3 style={{ borderTop: '1px solid #333', paddingTop: '1rem' }}>The Main Physics Algorithm</h3>
                    <p>For those who are curious, here is the raw 3D integration loop powering the engine:</p>
                    <pre className="code-block">{`// Substep Integration (runs 20x per frame for high precision)
for (let step = 0; step < subSteps; step++) {
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    let ax = 0, ay = 0, az = 0;

    // 1. Planet-Planet Collisions (Dynamic Hitbox based on Mass)
    for (let k = i + 1; k < planets.length; k++) {
      const p2 = planets[k];
      const distSq = dx*dx + dy*dy + dz*dz;
      const collisionRad = Math.max(1.5, (p.mass + p2.mass) * 0.8);
      if (distSq < collisionRad * collisionRad) {
        p.dead = true; p2.dead = true; // Annihilation
      }
    }

    // 2. N-Body Gravity from Stars
    for (let j = 0; j < stars.length; j++) {
      const s = stars[j];
      
      // Softening variable (+ 10) prevents singularity teleports
      const distSq = dx*dx + dy*dy + dz*dz + 10;
      const dist = Math.sqrt(distSq);

      // Star Surface Collision (0.5 grazing tolerance allows for intense slingshots)
      if (dist < s.radius * 0.5) { p.dead = true; break; }

      // Standard Newtonian Gravity (F = G*M/r^2)
      // Note: Antimatter uses negative mass, naturally reversing the vector!
      const force = (G * s.mass) / distSq;
      ax += (dx / dist) * force;
      ay += (dy / dist) * force;
      az += (dz / dist) * force;
    }

    // 3. Apply Acceleration to Velocity, Velocity to Position
    p.vx += ax * dt; p.x += p.vx * dt;
    p.vy += ay * dt; p.y += p.vy * dt;
    p.vz += az * dt; p.z += p.vz * dt;
  }
}`}</pre>

                    <button className="btn btn-planet" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setShowDocs(false)}>Resume Simulation</button>
                </div>
            </div>
        </div>
    );
}