import * as Phaser from 'phaser';
import { FONT_FAMILY } from '../config';

export interface TextInputOptions {
  width?: number;
  fontSize?: number;
  placeholder?: string;
  maxLength?: number;
  value?: string;
  /** Turn letters into capitals as they are typed (room codes) */
  uppercase?: boolean;
  /** 'numeric' shows the number keypad on phones (PIN, class number) */
  mode?: 'text' | 'numeric';
  password?: boolean;
}

/**
 * A real HTML text box placed in the game (Phaser keeps it in the right place
 * when the game is scaled). Phones get their normal on-screen keyboard.
 */
export function addTextInput(scene: Phaser.Scene, x: number, y: number, opts: TextInputOptions = {}): HTMLInputElement {
  const el = document.createElement('input');
  el.type = opts.password ? 'password' : 'text';
  if (opts.mode === 'numeric') el.inputMode = 'numeric';
  el.placeholder = opts.placeholder ?? '';
  el.maxLength = opts.maxLength ?? 40;
  el.value = opts.value ?? '';
  el.autocomplete = 'off';
  el.spellcheck = false;
  Object.assign(el.style, {
    width: `${opts.width ?? 320}px`,
    fontFamily: FONT_FAMILY,
    fontSize: `${opts.fontSize ?? 30}px`,
    fontWeight: '700',
    textAlign: 'center',
    padding: '8px 12px',
    borderRadius: '16px',
    border: '4px solid #1b1d3a',
    background: '#fff8e7',
    color: '#1b1d3a',
    outline: 'none',
    letterSpacing: opts.uppercase ? '4px' : 'normal',
  } satisfies Partial<CSSStyleDeclaration>);
  if (opts.uppercase) el.addEventListener('input', () => (el.value = el.value.toUpperCase()));
  // Typing in the box must not also move the player or press game buttons
  el.addEventListener('keydown', (e) => e.stopPropagation());
  scene.add.dom(x, y, el);
  return el;
}
