'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeVaultCanvasProps {
  status?: 'idle' | 'allow' | 'require_approval' | 'deny' | 'pause';
  height?: number | string;
  className?: string;
}

export function ThreeVaultCanvas({ status = 'idle', height = 340, className = '' }: ThreeVaultCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let orb: THREE.Mesh | null = null;
    let particles: THREE.Points | null = null;
    let mat: THREE.ShaderMaterial | null = null;
    let animationFrameId: number;

    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const clock = new THREE.Clock();

    try {
      const width = container.clientWidth || 400;
      const heightPx = typeof height === 'number' ? height : container.clientHeight || 340;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, heightPx);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 100);
      camera.position.z = 4.2;

      // Color uniforms matching status — Neural Mesh Palette
      // Default / Idle: Electric Indigo (#4F46E5) + Cyber Cyan (#06B6D4)
      // Allow: Cyber Cyan (#06B6D4) + Electric Indigo (#4F46E5)
      // Require Approval: Amber (#F59E0B) + Highlight Spark (#A5F3FC)
      // Deny: Neon Magenta (#D946EF) + Electric Indigo (#4F46E5)
      // Pause: Neon Magenta (#D946EF) + Highlight Spark (#A5F3FC)
      const colorScheme = {
        idle: { c1: new THREE.Color('#4F46E5'), c2: new THREE.Color('#06B6D4'), speed: 1.0 },
        allow: { c1: new THREE.Color('#06B6D4'), c2: new THREE.Color('#4F46E5'), speed: 1.2 },
        require_approval: { c1: new THREE.Color('#F59E0B'), c2: new THREE.Color('#A5F3FC'), speed: 1.3 },
        deny: { c1: new THREE.Color('#D946EF'), c2: new THREE.Color('#4F46E5'), speed: 2.2 },
        pause: { c1: new THREE.Color('#D946EF'), c2: new THREE.Color('#A5F3FC'), speed: 1.6 },
      }[status] || { c1: new THREE.Color('#4F46E5'), c2: new THREE.Color('#06B6D4'), speed: 1.0 };

      mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMouse: { value: new THREE.Vector2(0, 0) },
          uColor1: { value: colorScheme.c1 },
          uColor2: { value: colorScheme.c2 },
          uSpeed: { value: colorScheme.speed },
        },
        vertexShader: `
          uniform float uTime;
          uniform vec2 uMouse;
          uniform float uSpeed;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          varying float vDisplacement;

          void main() {
            vec3 p = position;
            float t = uTime * uSpeed;
            float d = sin(p.x * 2.5 + t * 1.2) * 0.15 
                    + sin(p.y * 3.0 - t * 0.9) * 0.12 
                    + sin(p.z * 2.2 + t * 1.4 + uMouse.x * 1.5) * 0.12;
            d += sin((p.x + p.y + p.z) * 3.8 + t * 1.8) * 0.05 * (1.0 + length(uMouse));
            vDisplacement = d;
            p += normal * d;
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          uniform float uTime;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          varying float vDisplacement;

          void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
            
            vec3 color = mix(uColor1, uColor2, vDisplacement * 2.0 + 0.5);
            color = mix(vec3(0.04, 0.06, 0.12), color, 0.45 + fresnel * 0.65);
            color += pow(fresnel, 3.5) * 0.7; // Outer glow rim

            gl_FragColor = vec4(color, 0.92);
          }
        `,
        transparent: true,
      });

      orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 36), mat);
      scene.add(orb);

      // Star particles ring
      const particleCount = 450;
      const geom = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        const radius = 2.4 + Math.random() * 3.2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi) - 1.2;
      }
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particles = new THREE.Points(
        geom,
        new THREE.PointsMaterial({
          color: 0x4a90e2,
          size: 0.03,
          transparent: true,
          opacity: 0.6,
        })
      );
      scene.add(particles);

      const handleResize = () => {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth;
        const h = typeof height === 'number' ? height : container.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      const handlePointerMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        mouse.targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.targetY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      };

      window.addEventListener('resize', handleResize);
      container.addEventListener('mousemove', handlePointerMove);

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        mouse.x += (mouse.targetX - mouse.x) * 0.08;
        mouse.y += (mouse.targetY - mouse.y) * 0.08;

        if (mat) {
          mat.uniforms.uTime.value = elapsedTime;
          mat.uniforms.uMouse.value.set(mouse.x, mouse.y);
        }

        if (orb) {
          orb.rotation.y = elapsedTime * 0.25;
          orb.rotation.x = mouse.y * 0.3;
          orb.rotation.z = mouse.x * 0.2;
        }

        if (particles) {
          particles.rotation.y = -elapsedTime * 0.06;
          particles.rotation.x = elapsedTime * 0.03;
        }

        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
      };

      animate();

      return () => {
        window.removeEventListener('resize', handleResize);
        container.removeEventListener('mousemove', handlePointerMove);
        cancelAnimationFrame(animationFrameId);
        if (renderer?.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer?.dispose();
      };
    } catch {
      // Graceful WebGL fallback if unavailable
    }
  }, [status, height]);

  return (
    <div
      ref={mountRef}
      className={`relative w-full overflow-hidden rounded-2xl flex items-center justify-center ${className}`}
      style={{ height }}
    />
  );
}

