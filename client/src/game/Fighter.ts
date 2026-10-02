import * as Phaser from 'phaser';
import { BODY_OFFSET_Y, BODY_RADIUS, CLIMB, EMPTY_OUTFIT, HAND_X, HAND_Y, fighterMuzzle, WORLD_HEIGHT, WORLD_WIDTH, type Character, type Outfit, type ShotTarget, type Terrain, type Vec, type WeaponStats } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, TEXT_STROKE } from '../config';
import type { Combatant } from './Combatant';
import { Costume, type Pose } from './Costume';

const BODY_HEIGHT = 96;
const WEAPON_WIDTH = 78;
const FALL_GRAVITY = 1400;

/** How a fighter looks: base character plus what they wear */
export interface FighterLook {
  character: Character;
  outfit: Outfit;
}

export function plainLook(character: Character): FighterLook {
  return { character, outfit: { ...EMPTY_OUTFIT } };
}

/** One player character on the battlefield: position, aim, health and sprites */
export class Fighter implements Combatant {
  readonly maxHp = 1000;
  readonly height = BODY_HEIGHT;
  hp = this.maxHp;
  /** Aim angle above the horizon, 0–90° */
  angle = 45;
  /** Power used for the previous shot (shown as a marker on the power bar) */
  lastPower: number | null = null;
  alive = true;
  hidden = false;
  private vy = 0;

  private readonly root: Phaser.GameObjects.Container;
  private readonly costume: Costume;
  private readonly weaponImg: Phaser.GameObjects.Image;
  private readonly nameTag: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Triangle;
  private hurtTimer?: Phaser.Time.TimerEvent;
  private shieldImg?: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly id: string,
    readonly name: string,
    public x: number,
    public y: number,
    public facing: 1 | -1,
    readonly look: FighterLook,
    public weapon: WeaponStats,
    readonly color: number,
  ) {
    this.costume = new Costume(scene, look.character, look.outfit, BODY_HEIGHT);

    this.weaponImg = scene.add.image(HAND_X, HAND_Y, `weapons/${weapon.id}`).setOrigin(0.32, 0.62);
    this.weaponImg.setScale(WEAPON_WIDTH / this.weaponImg.width);

    this.root = scene.add.container(x, y, [this.costume.root, this.weaponImg]).setDepth(DEPTH.fighter);

    this.nameTag = scene.add
      .text(x, y - BODY_HEIGHT - 14, name, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#ffffff',
        stroke: TEXT_STROKE,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.fighter);
    // Bouncing arrow over whoever's turn it is
    this.marker = scene.add
      .triangle(x, y - BODY_HEIGHT - 44, 0, 0, 22, 0, 11, 16, 0xffdd33)
      .setStrokeStyle(3, 0x1b1d3a)
      .setDepth(DEPTH.fighter)
      .setVisible(false);
    scene.tweens.add({ targets: this.marker, scaleY: 0.7, duration: 350, yoyo: true, repeat: -1 });
    this.sync();
  }

  get portraitKey(): string {
    return `characters/${this.look.character}_front`;
  }

  toTarget(): ShotTarget {
    return { id: this.id, x: this.x, y: this.y, radius: BODY_RADIUS, offsetY: BODY_OFFSET_Y };
  }

  /** Little bubble shown around the fighter while a shield item is active */
  setShieldVisible(on: boolean) {
    if (on && !this.shieldImg) {
      this.shieldImg = this.scene.add.image(0, -BODY_HEIGHT / 2, 'fx/fx_shield').setAlpha(0.55);
      this.shieldImg.setScale((BODY_HEIGHT * 1.25) / this.shieldImg.height);
      this.root.add(this.shieldImg);
    }
    this.shieldImg?.setVisible(on);
  }

  /** Camouflage skill: nearly see-through until the start of our next turn */
  setStealth(on: boolean) {
    this.hidden = on;
    this.scene.tweens.add({ targets: [this.root, this.nameTag], alpha: on ? 0.22 : 1, duration: 400 });
  }

  /** Paper-plane skill: vanish in a puff of dust and reappear at (x, y) */
  teleportTo(x: number, y: number) {
    this.puff();
    this.x = Phaser.Math.Clamp(x, 0, WORLD_WIDTH - 1);
    this.y = y;
    this.vy = 0;
    this.sync();
    this.puff();
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const fx = this.scene.add.image(this.x, this.y - BODY_HEIGHT / 2, 'fx/fx_heal').setDepth(DEPTH.fx);
    fx.setScale((BODY_HEIGHT * 1.2) / fx.height).setAlpha(0.9);
    this.scene.tweens.add({ targets: fx, y: fx.y - 50, alpha: 0, duration: 1100, onComplete: () => fx.destroy() });
  }

  private puff() {
    const fx = this.scene.add.image(this.x, this.y - 30, 'fx/fx_dust').setDepth(DEPTH.fx);
    fx.setScale(110 / fx.height);
    this.scene.tweens.add({ targets: fx, scale: fx.scale * 1.5, alpha: 0, duration: 600, onComplete: () => fx.destroy() });
  }

  /** Where the shot leaves the barrel, in world coordinates */
  muzzle(): Vec {
    return fighterMuzzle(this.x, this.y, this.facing, this.angle);
  }

  setActive(active: boolean) {
    this.marker.setVisible(active && this.alive);
  }

  /** Walk sideways. Returns false if a wall blocks the way. */
  walk(dir: 1 | -1, distance: number, terrain: Terrain): boolean {
    this.facing = dir;
    const nx = Phaser.Math.Clamp(this.x + dir * distance, 0, WORLD_WIDTH - 1);
    if (terrain.isSolid(nx, this.y - CLIMB)) {
      this.sync();
      return false;
    }
    this.x = nx;
    this.sync();
    return true;
  }

  /** Gravity: stand on the ground, climb small steps, or fall. Returns true if fell off the map. */
  settle(terrain: Terrain, dt: number): boolean {
    if (!this.alive) return false;
    const ground = terrain.groundBelow(this.x, this.y - CLIMB);
    if (ground === null || ground > this.y + 1) {
      this.vy += FALL_GRAVITY * dt;
      this.y += this.vy * dt;
      if (ground !== null && this.y >= ground) {
        this.y = ground;
        this.vy = 0;
      }
    } else {
      this.y = ground;
      this.vy = 0;
    }
    this.sync();
    return this.y > WORLD_HEIGHT + 80;
  }

  get falling(): boolean {
    return this.vy > 0;
  }

  takeDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    this.showPose('hurt', false);
    this.hurtTimer?.remove();
    this.hurtTimer = this.scene.time.delayedCall(700, () => {
      if (this.alive) this.showPose('side', true);
    });
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.hurtTimer?.remove();
    this.showPose('hurt', false);
    this.marker.setVisible(false);
    this.scene.tweens.add({ targets: [this.root, this.nameTag], alpha: 0.45, duration: 600 });
  }

  celebrate() {
    this.showPose('win', false);
    this.marker.setVisible(false);
    this.scene.tweens.add({ targets: this.root, y: this.y - 24, duration: 280, yoyo: true, repeat: -1, ease: 'Quad.out' });
  }

  private showPose(pose: Pose, weaponVisible: boolean) {
    this.costume.setPose(pose);
    this.weaponImg.setVisible(weaponVisible);
    // Suits without their own hurt picture blink and shake instead (tint would not show in Canvas mode)
    if (pose === 'hurt' && !this.costume.posed) {
      const root = this.costume.root;
      this.scene.tweens.add({ targets: root, x: { from: -6, to: 6 }, duration: 60, yoyo: true, repeat: 3, onComplete: () => root.setX(0) });
      this.scene.tweens.add({ targets: root, alpha: 0.35, duration: 90, yoyo: true, repeat: 2, onComplete: () => root.setAlpha(1) });
    }
  }

  /** Move sprites to match x/y/facing/angle */
  sync() {
    this.root.setPosition(this.x, this.y);
    this.root.scaleX = this.facing;
    this.weaponImg.rotation = -Phaser.Math.DegToRad(this.angle);
    this.nameTag.setPosition(this.x, this.y - BODY_HEIGHT - 10);
    this.marker.setPosition(this.x, this.y - BODY_HEIGHT - 52);
  }
}
