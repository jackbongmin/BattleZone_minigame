/**
 * Smooth Tracking Camera System
 */
class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.lerpSpeed = 0.12; // Smooth camera interpolation factor
    this.target = null;
  }

  resize(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  setTarget(target) {
    const isFirst = !this.target && target;
    this.target = target;
    if (isFirst && target) {
      this.x = target.x;
      this.y = target.y;
    }
  }

  update(mapWidth, mapHeight) {
    if (!this.target) return;

    // Smoothly lerp camera position toward target
    this.x += (this.target.x - this.x) * this.lerpSpeed;
    this.y += (this.target.y - this.y) * this.lerpSpeed;

    // Clamp camera within map bounds if map is larger than viewport
    if (mapWidth && mapHeight) {
      const halfW = this.viewportWidth / 2;
      const halfH = this.viewportHeight / 2;

      if (mapWidth > this.viewportWidth) {
        this.x = Math.max(halfW, Math.min(mapWidth - halfW, this.x));
      }
      if (mapHeight > this.viewportHeight) {
        this.y = Math.max(halfH, Math.min(mapHeight - halfH, this.y));
      }
    }
  }

  // Convert world coordinates to canvas screen coordinates
  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.x + this.viewportWidth / 2,
      y: worldY - this.y + this.viewportHeight / 2,
    };
  }

  // Convert canvas screen mouse coordinates to world coordinates
  screenToWorld(screenX, screenY) {
    return {
      x: screenX - this.viewportWidth / 2 + this.x,
      y: screenY - this.viewportHeight / 2 + this.y,
    };
  }

  // Apply camera transform to canvas context with screen shake
  begin(ctx) {
    ctx.save();
    const shakeX = window.particleSystem ? window.particleSystem.shakeOffsetX : 0;
    const shakeY = window.particleSystem ? window.particleSystem.shakeOffsetY : 0;
    ctx.translate(
      Math.round(this.viewportWidth / 2 - this.x + shakeX),
      Math.round(this.viewportHeight / 2 - this.y + shakeY)
    );
  }

  // Restore canvas context
  end(ctx) {
    ctx.restore();
  }
}

window.camera = new Camera();
