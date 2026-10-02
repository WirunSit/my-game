import * as Phaser from 'phaser';
import { BODY_OFFSET_Y, BODY_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, type ShotTarget, type Terrain, type Vec, type WeaponStats } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, TEXT_STROKE } from '../config';
import type { Combatant } from './Combatant';

const BODY_HEIGHT = 96;
const WEAPON_WIDTH = 78;
/** Hand position relative to the feet, for a character facing right */
const HAND_X = 26;
const HAND_Y = -56;
const MUZZLE_DISTANCE = 46;
const FALL_GRAVITY = 1400;
/** Highest step a fighter can walk up, px */
const CLIMB = 20;

export interface FighterLook {
  side: string;
  hurt: string;
  win: string;
  portrait: string;
}

export const LOOKS: Record<'boy' | 'girl', FighterLook> = {
  boy: { side: 'characters/boy_side', hurt: 'characters/boy_hurt', win: 'characters/boy_win', portrait: 'characters/boy_front' },
  girl: { side: 'characters/girl_side', hurt: 'characters/girl_hurt', win: 'characters/girl_win', portrait: 'characters/girl_front' },
};

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
  private vy = 0;

  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly weaponImg: Phaser.GameObjects.Image;
  private readonly aimLine: Phaser.GameObjects.Graphics;
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
    this.body = scene.add.image(0, 0, look.side).setOrigin(0.5, 1);
    this.body.setScale(BODY_HEIGHT / this.body.height);

    this.weaponImg = scene.add.image(HAND_X, HAND_Y, `weapons/${weapon.id}`).setOrigin(0.32, 0.62);
    this.weaponImg.setScale(WEAPON_WIDTH / this.weaponImg.width);

    this.aimLine = scene.add.graphics();
    this.root = scene.add.container(x, y, [this.aimLine, this.body, this.weaponImg]).setDepth(DEPTH.fighter);

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
    return this.look.portrait;
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

  /** Where the shot leaves the barrel, in world coordinates */
  muzzle(): Vec {
    const rad = Phaser.Math.DegToRad(this.angle);
    return {
      x: this.x + this.facing * (HAND_X + Math.cos(rad) * MUZZLE_DISTANCE),
      y: this.y + HAND_Y - Math.sin(rad) * MUZZLE_DISTANCE,
    };
  }

  setActive(active: boolean) {
    this.marker.setVisible(active && this.alive);
    this.drawAim(active && this.alive);
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
    this.body.setTexture(this.look.hurt).setScale(BODY_HEIGHT / this.scene.textures.getFrame(this.look.hurt).height);
    this.weaponImg.setVisible(false);
    this.hurtTimer?.remove();
    this.hurtTimer = this.scene.time.delayedCall(700, () => {
      if (this.alive) this.showPose(this.look.side, true);
    });
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.hurtTimer?.remove();
    this.showPose(this.look.hurt, false);
    this.marker.setVisible(false);
    this.drawAim(false);
    this.scene.tweens.add({ targets: [this.root, this.nameTag], alpha: 0.45, duration: 600 });
  }

  celebrate() {
    this.showPose(this.look.win, false);
    this.marker.setVisible(false);
    this.drawAim(false);
    this.scene.tweens.add({ targets: this.root, y: this.y - 24, duration: 280, yoyo: true, repeat: -1, ease: 'Quad.out' });
  }

  private showPose(texture: string, weaponVisible: boolean) {
    this.body.setTexture(texture);
    this.body.setScale(BODY_HEIGHT / this.scene.textures.getFrame(texture).height);
    this.weaponImg.setVisible(weaponVisible);
  }

  /** Move sprites to match x/y/facing/angle */
  sync() {
    this.root.setPosition(this.x, this.y);
    this.root.scaleX = this.facing;
    this.weaponImg.rotation = -Phaser.Math.DegToRad(this.angle);
    this.nameTag.setPosition(this.x, this.y - BODY_HEIGHT - 10);
    this.marker.setPosition(this.x, this.y - BODY_HEIGHT - 52);
    if (this.marker.visible) this.drawAim(true);
  }

  /** Dotted aim guide from the hand (no full trajectory — judging that is the skill!) */
  private drawAim(show: boolean) {
    const g = this.aimLine;
    g.clear();
    if (!show) return;
    const rad = Phaser.Math.DegToRad(this.angle);
    g.fillStyle(0xffffff, 0.9);
    for (let d = 60; d <= 130; d += 14) {
      g.fillCircle(HAND_X + Math.cos(rad) * d, HAND_Y - Math.sin(rad) * d, d === 130 ? 5 : 3.5);
    }
  }
}
