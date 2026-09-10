/**
 * Player Input Handler
 * Captures WASD, Arrows, Shift, Mouse Aim, Spacebar, Left Clicks, and Enter for Chat
 */
class InputHandler {
  constructor() {
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false, // User requirement: Spacebar is now sprint
    };

    this.mouse = {
      screenX: window.innerWidth / 2,
      screenY: window.innerHeight / 2,
      worldX: 0,
      worldY: 0,
      isDown: false,
    };

    this.selectedWeapon = 1; // 1: Melee Sword, 2: Ranged Weapon
    this.angle = 0;
    this.onAttackCallback = null;
    this.onEnterCallback = null;
    this.onWeaponSwitchCallback = null;
    this.enabled = false;
    this.isChatting = false;

    this.bindEvents();
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.resetKeys();
  }

  resetKeys() {
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;
    this.keys.space = false;
    this.mouse.isDown = false;
  }

  setChatting(isChatting) {
    this.isChatting = isChatting;
    if (isChatting) {
      this.resetKeys();
    }
  }

  setWeapon(weaponId) {
    const target = weaponId === 2 ? 2 : 1;
    if (this.selectedWeapon === target) return;
    this.selectedWeapon = target;
    if (this.onWeaponSwitchCallback) {
      this.onWeaponSwitchCallback(this.selectedWeapon);
    }
  }

  onWeaponSwitch(cb) {
    this.onWeaponSwitchCallback = cb;
  }

  onAttack(cb) {
    this.onAttackCallback = cb;
  }

  onEnter(cb) {
    this.onEnterCallback = cb;
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;

      // Handle Enter key for opening/sending chat
      if (e.code === 'Enter') {
        if (this.onEnterCallback) {
          this.onEnterCallback(e);
        }
        return;
      }

      // If typing in input field or chatting, ignore game movement keys
      if (this.isChatting || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        return;
      }

      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = true;
      if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = true;
      if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = true;

      // Spacebar is now Sprint (Shift removed)
      if (code === 'Space') {
        e.preventDefault();
        this.keys.space = true;
      }

      // Weapon switching: 1 for Sword, 2 for Ranged
      if (code === 'Digit1' || code === 'Numpad1' || code === 'Key1') {
        this.setWeapon(1);
      } else if (code === 'Digit2' || code === 'Numpad2' || code === 'Key2') {
        this.setWeapon(2);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (!this.enabled || this.isChatting) return;

      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = false;
      if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = false;
      if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = false;
      if (code === 'Space') this.keys.space = false;
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.screenX = e.clientX;
      this.mouse.screenY = e.clientY;
      this.updateAngle();
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isChatting) return;

      // Left mouse click on canvas triggers attack
      if (e.target.id === 'gameCanvas' && e.button === 0) {
        this.mouse.isDown = true;
        if (this.onAttackCallback) this.onAttackCallback();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouse.isDown = false;
      }
    });

    window.addEventListener('blur', () => {
      this.mouse.isDown = false;
      this.resetKeys();
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });

    // Mouse wheel weapon switching (Scroll up or down to toggle weapons)
    let lastWheelTime = 0;
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled || this.isChatting) return;

        // Allow scrolling inside chat message log
        if (e.target && e.target.closest && e.target.closest('#chatMessages')) {
          return;
        }

        e.preventDefault();

        const now = Date.now();
        if (now - lastWheelTime < 110) return; // 110ms throttle to prevent double switching
        lastWheelTime = now;

        // Wheel down: switch to 2 (or toggle), Wheel up: switch to 1 (or toggle)
        if (e.deltaY > 0) {
          const nextWeapon = this.selectedWeapon === 1 ? 2 : 1;
          this.setWeapon(nextWeapon);
        } else if (e.deltaY < 0) {
          const prevWeapon = this.selectedWeapon === 2 ? 1 : 2;
          this.setWeapon(prevWeapon);
        }
      },
      { passive: false }
    );
  }

  updateAngle() {
    if (!window.camera || !window.camera.target) return;
    const worldMouse = window.camera.screenToWorld(this.mouse.screenX, this.mouse.screenY);
    this.mouse.worldX = worldMouse.x;
    this.mouse.worldY = worldMouse.y;

    const dx = this.mouse.worldX - window.camera.target.x;
    const dy = this.mouse.worldY - window.camera.target.y;
    this.angle = Math.atan2(dy, dx);
  }

  getPayload() {
    if (this.isChatting) {
      return {
        up: false,
        down: false,
        left: false,
        right: false,
        space: false,
        selectedWeapon: this.selectedWeapon,
        angle: this.angle,
      };
    }

    this.updateAngle();
    return {
      up: this.keys.up,
      down: this.keys.down,
      left: this.keys.left,
      right: this.keys.right,
      space: this.keys.space,
      selectedWeapon: this.selectedWeapon,
      angle: this.angle,
    };
  }
}

window.inputHandler = new InputHandler();
