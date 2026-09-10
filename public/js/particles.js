/**
 * Visual FX & Particle System
 */
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
    this.slashes = [];
    this.hitFlashes = new Map(); // targetId -> timer
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  // Trigger screen shake with punchy impulse
  triggerShake(intensity = 7, duration = 0.18) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
  }

  // Full impact hit handler with visual flash, sparks, and damage text
  triggerHit(targetId, x, y, damage = 0, isCrit = false) {
    this.triggerShake(isCrit ? 9 : 7, 0.18);
    if (targetId) {
      this.hitFlashes.set(targetId, 0.14); // 140ms white/red hit flash
    }
    this.spawnHitSparks(x, y, isCrit ? '#ef4444' : '#f59e0b', isCrit ? 24 : 18);
    if (damage > 0) {
      this.spawnDamageText(x, y, damage, isCrit);
    }
  }

  isFlashing(targetId) {
    return targetId ? (this.hitFlashes.get(targetId) || 0) > 0 : false;
  }

  // Spawn spark burst on hit
  spawnHitSparks(x, y, color = '#f59e0b', count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color: Math.random() > 0.3 ? color : '#ffffff',
        alpha: 1,
        life: 0.28 + Math.random() * 0.24,
        maxLife: 0.52,
      });
    }
  }

  // Spawn item collection sparkles & text
  spawnItemEffect(x, y, text, color = '#10b981') {
    // 16 outward sparkles
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI * 2) / 16 + (Math.random() - 0.5) * 0.2;
      const speed = 80 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 3,
        color,
        alpha: 1,
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.65,
      });
    }

    // Overhead floating text
    this.floatingTexts.push({
      x,
      y: y - 25,
      text,
      color,
      fontSize: 20,
      vy: -55,
      alpha: 1,
      life: 1.2,
      maxLife: 1.2,
    });
  }

  // Spawn running dust
  spawnDust(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 30;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 3 + Math.random() * 4,
      color: '#94a3b8',
      alpha: 0.45,
      life: 0.3,
      maxLife: 0.3,
    });
  }

  // Spawn punchy floating damage numbers with pop-in scale
  spawnDamageText(x, y, damage, isCrit = false) {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y - 28,
      text: `-${damage}`,
      color: isCrit ? '#ef4444' : '#fbbf24',
      fontSize: isCrit ? 26 : 20,
      scale: 1.35,
      vy: -75,
      alpha: 1,
      life: 0.9,
      maxLife: 0.9,
    });
  }

  // Spawn arbitrary floating text (warnings, alerts)
  spawnFloatingText(x, y, text, color = '#ffffff', fontSize = 18) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      fontSize,
      vy: -50,
      alpha: 1,
      life: 0.9,
      maxLife: 0.9,
    });
  }

  // Spawn muzzle flash sparks on shooting
  spawnMuzzleFlash(x, y, angle, color = '#fef08a') {
    for (let i = 0; i < 6; i++) {
      const spAngle = angle + (Math.random() - 0.5) * 0.6;
      const speed = 120 + Math.random() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(spAngle) * speed,
        vy: Math.sin(spAngle) * speed,
        radius: 2 + Math.random() * 2,
        color,
        alpha: 1,
        life: 0.15,
        maxLife: 0.15,
      });
    }
  }

  // Spawn melee slash swing visual with matched 94px range
  spawnSlash(x, y, angle, color = '#60a5fa', range = 94) {
    this.slashes.push({
      x,
      y,
      angle,
      color,
      range,
      progress: 0,
      duration: 0.22, // 220ms
    });

    // Swoosh trail sparks along the arc
    for (let i = 0; i < 7; i++) {
      const spAngle = angle + (Math.random() - 0.5) * 1.0;
      const spDist = range * (0.65 + Math.random() * 0.35);
      this.particles.push({
        x: x + Math.cos(spAngle) * spDist,
        y: y + Math.sin(spAngle) * spDist,
        vx: Math.cos(spAngle + Math.PI / 2) * (60 + Math.random() * 90),
        vy: Math.sin(spAngle + Math.PI / 2) * (60 + Math.random() * 90),
        radius: 2 + Math.random() * 2.5,
        color: '#ffffff',
        alpha: 0.9,
        life: 0.2,
        maxLife: 0.2,
      });
    }
  }

  update(dt) {
    // Screen shake decay
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      if (this.shakeDuration <= 0) {
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      }
    }

    // Hit flashes decay
    for (const [id, timer] of this.hitFlashes.entries()) {
      const rem = timer - dt;
      if (rem <= 0) {
        this.hitFlashes.delete(id);
      } else {
        this.hitFlashes.set(id, rem);
      }
    }

    // 1. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 2. Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.vy += 80 * dt; // gravity deceleration for pop-up feel
      if (ft.scale && ft.scale > 1) {
        ft.scale = Math.max(1, ft.scale - dt * 2.8);
      }
      ft.life -= dt;
      ft.alpha = Math.max(0, ft.life / ft.maxLife);

      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 3. Update slashes
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const sl = this.slashes[i];
      sl.progress += dt / sl.duration;
      if (sl.progress >= 1) {
        this.slashes.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    // Draw slashes
    for (const sl of this.slashes) {
      ctx.save();
      ctx.translate(sl.x, sl.y);
      ctx.rotate(sl.angle);

      const alpha = (1 - sl.progress) * 0.95;
      const startAngle = -Math.PI / 2.4;
      const arcLength = Math.PI * 0.85;
      const currentEndAngle = startAngle + arcLength * Math.min(1, sl.progress * 1.4);

      // Inner bright crescent blade
      ctx.beginPath();
      ctx.arc(0, 0, sl.range, startAngle, currentEndAngle, false);
      ctx.strokeStyle = sl.color;
      ctx.lineWidth = 20 * (1 - sl.progress * 0.6);
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha;
      ctx.stroke();

      // Outer glow slash
      ctx.beginPath();
      ctx.arc(0, 0, sl.range + 5, startAngle, currentEndAngle, false);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5 * (1 - sl.progress);
      ctx.stroke();

      // Sword slash trail fill
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, sl.range, startAngle, currentEndAngle, false);
      ctx.closePath();
      ctx.fillStyle = sl.color;
      ctx.globalAlpha = alpha * 0.18;
      ctx.fill();

      ctx.restore();
    }

    // Draw particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw floating texts with pop-in scale
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.translate(ft.x, ft.y);
      const scale = ft.scale || 1;
      ctx.scale(scale, scale);
      ctx.font = `900 ${ft.fontSize}px Rajdhani, Pretendard, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ft.color;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
  }
}

window.particleSystem = new ParticleSystem();
