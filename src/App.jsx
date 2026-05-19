import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

// Celestial Body Definitions
const ASTRO_TYPES = {
    SUN: { mass: 150, color: '#ffaa00', glow: 'rgba(255, 170, 0, 0.15)', radius: 8, name: 'Yellow Dwarf' },
    RED_GIANT: { mass: 300, color: '#ff3300', glow: 'rgba(255, 50, 0, 0.15)', radius: 24, name: 'Red Supergiant' },
    BLUE_GIANT: { mass: 450, color: '#0088ff', glow: 'rgba(0, 136, 255, 0.2)', radius: 14, name: 'Blue Giant' },
    PULSAR: { mass: 700, color: '#00ffff', glow: 'rgba(0, 255, 255, 0.3)', radius: 4, name: 'Pulsar (Gamma)' },
    BLACK_HOLE: { mass: 1800, color: '#000000', glow: 'rgba(168, 85, 247, 0.4)', radius: 6, type: 'BLACK_HOLE', horizon: 25, name: 'Black Hole' },
    WORMHOLE: { mass: 250, color: '#00ffcc', glow: 'rgba(0, 255, 204, 0.2)', radius: 10, type: 'WORMHOLE', horizon: 15, name: 'Wormhole' }
};

export default function AstrophysicsEngine() {
    const canvasRef = useRef(null);

    const [showDocs, setShowDocs] = useState(false);
    const [mode, setMode] = useState('STAR');
    const [starType, setStarType] = useState('SUN');
    const [gravityG, setGravityG] = useState(5.0);
    const [cameraZoom, setCameraZoom] = useState(1.0);

    const memRef = useRef({
        stars: [],       // { x, y, z, type }
        planets: [],     // { x, y, z, vx, vy, vz, history: [], hue, dead }
        shockwaves: [],  // { x, y, radius, prevRadius, maxRadius }
        explosions: [],  // { x, y, z, radius, maxRadius, color }
        camera: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        dragStart: null,
        dragCurrent: null,
    });

    const getNeonHue = () => {
        const hues = [0, 60, 120, 180, 280, 320];
        return hues[Math.floor(Math.random() * hues.length)];
    };

    // --- 3D CAMERA PROJECTION MATH ---
    const project3D = (wx, wy, wz, camX, camY, zoom, cx, cy) => {
        const focalLength = 600;
        const relX = (wx - camX) * zoom;
        const relY = (wy - camY) * zoom;
        const relZ = wz * zoom;

        const safeZ = Math.min(relZ, focalLength - 10);
        const scale = focalLength / (focalLength - safeZ);

        return {
            x: cx + relX * scale,
            y: cy + relY * scale,
            scale: scale
        };
    };

    const unproject3D = (screenX, screenY, camX, camY, zoom, cx, cy) => {
        return {
            x: (screenX - cx) / zoom + camX,
            y: (screenY - cy) / zoom + camY
        };
    };

    // --- TRUE 3D PHYSICS LOOP ---
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

            if (memRef.current.camera.x === 0) {
                memRef.current.camera = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            }
        };
        window.addEventListener('resize', resize);
        resize();

        const render = () => {
            const { stars, planets, shockwaves, explosions, dragStart, dragCurrent, camera } = memRef.current;

            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;

            ctx.fillStyle = '#010103';
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

            // --- 1. PROCESS SUPERNOVA SHOCKWAVES ---
            for (let i = shockwaves.length - 1; i >= 0; i--) {
                const sw = shockwaves[i];
                sw.prevRadius = sw.radius;
                sw.radius += 8;

                for (let j = 0; j < planets.length; j++) {
                    const p = planets[j];
                    if (p.dead) continue;

                    const dx = p.x - sw.x;
                    const dy = p.y - sw.y;
                    const dist = Math.hypot(dx, dy);

                    if (dist <= sw.radius && dist >= sw.prevRadius) {
                        const blastForce = 6.0;
                        p.vx += (dx / dist) * blastForce;
                        p.vy += (dy / dist) * blastForce;
                        p.vz += (Math.random() - 0.5) * blastForce;
                    }
                }
                if (sw.radius > sw.maxRadius) shockwaves.splice(i, 1);
            }

            // --- 2. RUN HIGH-PRECISION 3D GRAVITY & COLLISIONS ---
            const subSteps = 10;
            const dt = 0.05;

            for (let step = 0; step < subSteps; step++) {
                for (let i = 0; i < planets.length; i++) {
                    const p = planets[i];
                    if (p.dead) continue;

                    let ax = 0; let ay = 0; let az = 0;

                    // INTER-PLANETARY COLLISIONS
                    for (let k = i + 1; k < planets.length; k++) {
                        const p2 = planets[k];
                        if (p2.dead) continue;
                        const dx = p.x - p2.x, dy = p.y - p2.y, dz = p.z - p2.z;
                        if (dx * dx + dy * dy + dz * dz < 15) { // Collision Threshold
                            p.dead = true;
                            p2.dead = true;
                            explosions.push({ x: p.x, y: p.y, z: p.z, radius: 0, maxRadius: 30, color: '#ffcc00' });
                        }
                    }
                    if (p.dead) continue;

                    // STAR GRAVITY & COLLISIONS
                    for (let j = 0; j < stars.length; j++) {
                        const s = stars[j];
                        const astro = ASTRO_TYPES[s.type];

                        const dx = s.x - p.x;
                        const dy = s.y - p.y;
                        const dz = s.z - p.z;

                        const distSq = dx * dx + dy * dy + dz * dz + 150;
                        const dist = Math.sqrt(distSq);

                        // STAR COLLISION (Crashing into the surface)
                        if (dist < astro.radius + 2) {
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
                            // Relativistic Orbital Decay: Drag pulls planet into an inescapable death-spiral
                            if (dist < 200) {
                                const drag = 1 - (0.015 * (200 - dist) / 200);
                                p.vx *= drag; p.vy *= drag; p.vz *= drag;
                            }
                        }

                        // WORMHOLE TELEPORTATION
                        if (astro.type === 'WORMHOLE' && dist < astro.horizon) {
                            explosions.push({ x: p.x, y: p.y, z: p.z, radius: 0, maxRadius: 50, color: '#00ffcc' }); // Entry Flash
                            p.x = camera.x + (Math.random() - 0.5) * window.innerWidth;
                            p.y = camera.y + (Math.random() - 0.5) * window.innerHeight;
                            p.z = (Math.random() - 0.5) * 400;
                            p.history = []; // Crucial: Reset history so the trail breaks
                            explosions.push({ x: p.x, y: p.y, z: p.z, radius: 0, maxRadius: 50, color: '#00ffcc' }); // Exit Flash
                            break;
                        }

                        // Standard Gravity
                        const force = (gravityG * astro.mass) / distSq;
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

                    if (isNaN(p.x) || isNaN(p.y)) { p.dead = true; continue; }
                }
            }

            // Record visual history for trails
            for (let i = 0; i < planets.length; i++) {
                if (!planets[i].dead) {
                    planets[i].history.push({ x: planets[i].x, y: planets[i].y, z: planets[i].z });
                    if (planets[i].history.length > 150) planets[i].history.shift();
                }
            }

            // Clean Memory
            memRef.current.planets = planets.filter(p => !p.dead);

            // --- 3. RENDER STAGE (Camera Applied) ---

            // Draw Trails
            for (let i = 0; i < memRef.current.planets.length; i++) {
                const p = memRef.current.planets[i];
                if (p.history.length < 2) continue;

                ctx.beginPath();
                ctx.strokeStyle = `hsla(${p.hue}, 100%, 70%, 0.6)`;

                const currentProj = project3D(p.x, p.y, p.z, camera.x, camera.y, cameraZoom, cx, cy);
                ctx.lineWidth = Math.max(0.5, currentProj.scale * 1.5);

                for (let h = 0; h < p.history.length; h++) {
                    const pt = project3D(p.history[h].x, p.history[h].y, p.history[h].z, camera.x, camera.y, cameraZoom, cx, cy);
                    if (h === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
            }

            // Draw Explosions
            for (let i = explosions.length - 1; i >= 0; i--) {
                const exp = explosions[i];
                exp.radius += 2.5;
                const proj = project3D(exp.x, exp.y, exp.z, camera.x, camera.y, cameraZoom, cx, cy);
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, exp.radius * cameraZoom * proj.scale, 0, Math.PI * 2);
                ctx.fillStyle = exp.color;
                ctx.globalAlpha = Math.max(0, 1 - exp.radius / exp.maxRadius);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                if (exp.radius > exp.maxRadius) explosions.splice(i, 1);
            }

            // Draw Shockwaves
            for (let i = 0; i < shockwaves.length; i++) {
                const sw = shockwaves[i];
                const proj = project3D(sw.x, sw.y, 0, camera.x, camera.y, cameraZoom, cx, cy);
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, sw.radius * cameraZoom * proj.scale, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 0, 60, ${Math.max(0, 1 - sw.radius / sw.maxRadius)})`;
                ctx.lineWidth = 4 * cameraZoom;
                ctx.stroke();
            }

            // Draw Stars (Anchors)
            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                const astro = ASTRO_TYPES[s.type];
                const proj = project3D(s.x, s.y, s.z, camera.x, camera.y, cameraZoom, cx, cy);
                const r = astro.radius * cameraZoom * proj.scale;

                if (s.type === 'BLACK_HOLE' || s.type === 'WORMHOLE') {
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r + (12 * cameraZoom), 0, Math.PI * 2);
                    ctx.strokeStyle = astro.glow;
                    ctx.lineWidth = 4 * cameraZoom;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = astro.color;
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r * 3.0, 0, Math.PI * 2);
                    ctx.fillStyle = astro.glow;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = astro.color;
                    ctx.fill();
                }
            }

            // Draw Active Planets
            for (let i = 0; i < memRef.current.planets.length; i++) {
                const p = memRef.current.planets[i];
                const proj = project3D(p.x, p.y, p.z, camera.x, camera.y, cameraZoom, cx, cy);

                ctx.beginPath();
                ctx.arc(proj.x, proj.y, Math.max(1, 2 * proj.scale * cameraZoom), 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
            }

            // Draw Slingshot Vector
            if (mode === 'PLANET' && dragStart && dragCurrent) {
                const projStart = project3D(dragStart.x, dragStart.y, 0, camera.x, camera.y, cameraZoom, cx, cy);
                const projCurrent = project3D(dragCurrent.x, dragCurrent.y, 0, camera.x, camera.y, cameraZoom, cx, cy);

                ctx.beginPath();
                ctx.moveTo(projStart.x, projStart.y);
                ctx.lineTo(projCurrent.x, projCurrent.y);
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(projStart.x, projStart.y, 4 * cameraZoom, 0, Math.PI * 2);
                ctx.fillStyle = '#00f0ff';
                ctx.fill();
            }

            frameId = requestAnimationFrame(render);
        };

        frameId = requestAnimationFrame(render);
        return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(frameId); };
    }, [gravityG, cameraZoom, mode]);


    // --- INTERACTION LOGIC ---
    const getScreenXY = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvasRef.current.width / rect.width / (window.devicePixelRatio || 1)),
            y: (e.clientY - rect.top) * (canvasRef.current.height / rect.height / (window.devicePixelRatio || 1))
        };
    };

    const onPointerDown = (e) => {
        if (e.target.closest('.hud-panel')) return;
        const canvas = canvasRef.current;
        if (canvas) canvas.setPointerCapture(e.pointerId);

        const screen = getScreenXY(e);
        const { camera } = memRef.current;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        const worldCoords = unproject3D(screen.x, screen.y, camera.x, camera.y, cameraZoom, cx, cy);

        if (mode === 'STAR') {
            memRef.current.stars.push({ x: worldCoords.x, y: worldCoords.y, z: 0, type: starType });
        } else if (mode === 'SUPERNOVA') {
            memRef.current.shockwaves.push({ x: worldCoords.x, y: worldCoords.y, radius: 0, prevRadius: 0, maxRadius: 4000 });
        } else if (mode === 'PLANET') {
            memRef.current.dragStart = worldCoords;
            memRef.current.dragCurrent = worldCoords;
        } else if (mode === 'CAMERA') {
            memRef.current.dragStart = screen;
        }
    };

    const onPointerMove = (e) => {
        const screen = getScreenXY(e);
        const { camera } = memRef.current;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        if (mode === 'PLANET' && memRef.current.dragStart) {
            memRef.current.dragCurrent = unproject3D(screen.x, screen.y, camera.x, camera.y, cameraZoom, cx, cy);
        } else if (mode === 'CAMERA' && memRef.current.dragStart) {
            const dx = screen.x - memRef.current.dragStart.x;
            const dy = screen.y - memRef.current.dragStart.y;

            memRef.current.camera.x -= dx / cameraZoom;
            memRef.current.camera.y -= dy / cameraZoom;

            memRef.current.dragStart = screen;
        }
    };

    const onPointerUp = (e) => {
        const canvas = canvasRef.current;
        if (canvas && canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }

        if (mode === 'PLANET' && memRef.current.dragStart && memRef.current.dragCurrent) {
            const start = memRef.current.dragStart;
            const end = memRef.current.dragCurrent;

            const vx = (start.x - end.x) * 0.05;
            const vy = (start.y - end.y) * 0.05;
            const vz = (Math.random() - 0.5) * 6.0;

            memRef.current.planets.push({
                x: start.x, y: start.y, z: 0,
                vx: vx, vy: vy, vz: vz,
                history: [], hue: getNeonHue(), dead: false
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
                    <h2 style={{ margin: 0, fontSize: '1rem', color: '#ffaa00', textTransform: 'uppercase', letterSpacing: '2px' }}>Andy Space Lab</h2>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: '#888' }}>
                        {mode === 'STAR' ? "Tap to place gravitational bodies." : mode === 'PLANET' ? "Drag backwards to slingshot a planet." : mode === 'CAMERA' ? "Drag to pan the universe." : "Tap to detonate a kinetic shockwave."}
                    </p>
                </div>

                <div className="btn-group" style={{ marginBottom: '0.5rem' }}>
                    <button className={`btn ${mode === 'STAR' ? 'btn-star' : ''}`} onClick={() => setMode('STAR')}>1. Stars</button>
                    <button className={`btn ${mode === 'PLANET' ? 'btn-planet' : ''}`} onClick={() => setMode('PLANET')}>2. Launch</button>
                    <button className={`btn ${mode === 'SUPERNOVA' ? 'btn-nova' : ''}`} onClick={() => setMode('SUPERNOVA')}>3. Nova</button>
                    <button className={`btn ${mode === 'CAMERA' ? 'btn-star' : ''}`} onClick={() => setMode('CAMERA')}>4. Pan Map</button>
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
                            <option value="SUN">Yellow Dwarf (Standard)</option>
                            <option value="RED_GIANT">Red Supergiant (Massive Radius)</option>
                            <option value="BLUE_GIANT">Blue Giant (High Gravity)</option>
                            <option value="PULSAR">Pulsar (Gamma Ray Emitter)</option>
                            <option value="BLACK_HOLE">Black Hole (Eats Planets)</option>
                            <option value="WORMHOLE">Wormhole (Teleporter)</option>
                        </select>
                    </div>
                    <div className="control-item">
                        <label>Gravity Constant</label>
                        <input type="range" min="1.0" max="15.0" step="0.5" value={gravityG} onChange={e => setGravityG(parseFloat(e.target.value))} />
                    </div>
                    <div className="control-item">
                        <label>Camera Zoom</label>
                        <input type="range" min="0.1" max="3.0" step="0.05" value={cameraZoom} onChange={e => setCameraZoom(parseFloat(e.target.value))} />
                    </div>
                </div>

                <div className="btn-group">
                    <button className="btn btn-danger" onClick={clearUniverse}>Clear Void</button>
                    <button className="btn" style={{ borderColor: '#fff' }} onClick={() => setShowDocs(true)}>How It Works</button>
                </div>
            </div>

            <div className={`modal-overlay ${showDocs ? 'active' : ''}`} onClick={() => setShowDocs(false)}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h2>Andy's Space Lab</h2>

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255, 170, 0, 0.1)', borderLeft: '3px solid #ffaa00' }}>
                        <p style={{ fontStyle: 'italic', margin: 0, color: '#fde68a' }}>
                            I always liked planets. I actually would've worked for NASA, but my wife and kids said no. So I turned them down.
                            <br /><br /><span style={{ fontSize: '0.7rem', opacity: 0.7 }}>— I'm not joking btw</span>
                        </p>
                    </div>

                    <p>
                        Welcome to my space lab, similar to what you'd see at SpaceX. Every single line you see is generated in real-time by true 3D gravitational big science stuff I saw online. Here is how your tools behave in real life and in the simulation:
                    </p>

                    <h3>1. The Stars & Anomalies</h3>
                    <p>In real life, massive objects bend the very fabric of spacetime. Planets travel in straight lines through this curved space, which makes them orbit.</p>
                    <ul>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Yellow Dwarfs & Blue Giants:</strong> These create stable gravity wells. When a planet gets close, its velocity spikes, causing a "slingshot" effect. Because this engine simulates 3D depth, the orbits tilt naturally into geometric spirographs.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Red Supergiants:</strong> Dying stars that have expanded massively. Their radius is huge, making it very easy for your planets to crash into their surface!</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Pulsars / Neutron Stars:</strong> The collapsed cores of dead stars. They pack the mass of a giant star into a tiny radius, creating incredibly violent, tight orbits.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Black Holes:</strong> The gravity is immense. <em>Relativistic Drag</em> forces any planet that gets too close into an inescapable orbital decay. If your planet crosses the <strong>Event Horizon</strong> boundary, the required escape velocity exceeds the engine's limits, and it is permanently swallowed into the void.</li>
                        <li style={{ marginBottom: '0.5rem' }}><strong>Wormholes:</strong> A theoretical bridge through spacetime. Hit one of these, and your planet will trigger a quantum flash and instantly teleport to a random location in the universe, keeping all of its momentum.</li>
                    </ul>

                    <h3>2. Collisions & Supernovas</h3>
                    <p>
                        When a massive star dies, it explodes, ejecting its outer layers at a significant fraction of the speed of light. In this project, tapping "Supernova" detonates a kinetic shockwave. If the red expanding ring intersects with your planets, the physical force will violently push them outward, destroying their stable orbits and scattering them into deep space. This can happen in real life btw, and we all finna die.
                    </p>
                    <p>
                        Also, if two planets crash into each other in 3D space, or if they crash into the physical surface of a star, they will be annihilated in a massive explosion.
                    </p>
                    <p>
                        This wasn't that easy to do so be easy on me. I'm not a programmer, it lowkey sucks to be one; No offense.
                    </p>

                    <br />
                    <h3 style={{ borderTop: '1px solid #333', paddingTop: '1rem' }}>The 3D Engine Code</h3>
                    <p>For those who are curious, here is the raw 3D physics loop I used:</p>
                    <pre className="code-block">
                        {`// Black Hole Relativistic Decay
if (astro.type === 'BLACK_HOLE' && distance < 200) {
    const drag = 1 - (0.015 * (200 - distance) / 200);
    planet.vx *= drag; 
    planet.vy *= drag; 
    planet.vz *= drag; // Pulls planet into death-spiral
}

// True 3D Collisions
if (dx*dx + dy*dy + dz*dz < CollisionRadius) {
    planet.dead = true;
    spawnExplosion(planet.x, planet.y, planet.z);
}
`}
                    </pre>

                    <button className="btn btn-planet" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setShowDocs(false)}>Resume Simulation</button>
                </div>
            </div>
        </div>
    );
}