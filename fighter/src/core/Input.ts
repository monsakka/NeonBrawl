/**
 * Keyboard / mouse state with per-frame "pressed" edges and pointer lock.
 * Codes are KeyboardEvent.code values (layout independent: 'KeyW', 'Space', ...).
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private buttons = new Set<number>();
  private pressedButtons = new Set<number>();
  private releasedButtons = new Set<number>();
  private wheel = 0;
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  sensitivity = 0.0022;
  onLockChange: ((locked: boolean) => void) | null = null;

  private readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;

    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      // Keep the browser from acting on game keys (Tab focus, Space scroll, Ctrl+S ...).
      if (e.code !== 'Escape' && e.code !== 'F11' && e.code !== 'F5') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    });
    document.addEventListener('mouseup', (e) => {
      if (this.buttons.delete(e.button)) this.releasedButtons.add(e.button);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.reset();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    const req = this.element.requestPointerLock() as unknown;
    // Chrome returns a promise that rejects if the user exits too quickly; ignore that.
    if (req instanceof Promise) req.catch(() => undefined);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  mouseDown(button = 0): boolean {
    return this.buttons.has(button);
  }

  mousePressed(button = 0): boolean {
    return this.pressedButtons.has(button);
  }

  mouseReleased(button = 0): boolean {
    return this.releasedButtons.has(button);
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Call once at the end of every rendered frame. */
  endFrame(): void {
    this.pressed.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  private reset(): void {
    this.down.clear();
    this.buttons.clear();
    this.endFrame();
    this.wheel = 0;
  }
}
