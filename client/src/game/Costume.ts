import * as Phaser from 'phaser';
import { cosmeticArt, cosmeticDef, type Character, type Outfit } from '@sciboom/shared';

export type Pose = 'side' | 'hurt' | 'win';

/**
 * Where hats, glasses and back items go on each body picture, in pixels of the
 * 320-px-tall sliced image (x from the left edge, y from the top).
 * head = bottom-centre of a hat, eye = the front eye, back = middle of the upper back,
 * headW = head width (items are sized from it), tilt = head rotation in degrees.
 * Check with `npm run costumes -w tools` after changing art or numbers.
 */
interface PoseAnchors {
  head: [number, number];
  eye: [number, number];
  back: [number, number];
  headW: number;
  tilt: number;
}

const ANCHORS: Record<string, PoseAnchors> = {
  'characters/boy_side': { head: [88, 40], eye: [127, 88], back: [58, 150], headW: 140, tilt: 0 },
  'characters/boy_hurt': { head: [80, 70], eye: [118, 104], back: [140, 180], headW: 140, tilt: -10 },
  'characters/boy_win': { head: [70, 46], eye: [110, 96], back: [55, 160], headW: 140, tilt: 0 },
  'characters/girl_side': { head: [88, 40], eye: [122, 88], back: [58, 150], headW: 140, tilt: 0 },
  'characters/girl_hurt': { head: [80, 60], eye: [132, 102], back: [120, 180], headW: 140, tilt: -6 },
  'characters/girl_win': { head: [90, 46], eye: [120, 96], back: [70, 160], headW: 140, tilt: 0 },
  'outfits/boy_lab': { head: [96, 40], eye: [135, 88], back: [66, 150], headW: 140, tilt: 0 },
  'outfits/boy_explorer': { head: [96, 40], eye: [135, 88], back: [66, 150], headW: 140, tilt: 0 },
  'outfits/boy_firefighter': { head: [92, 40], eye: [130, 88], back: [62, 150], headW: 140, tilt: 0 },
  'outfits/girl_lab': { head: [96, 40], eye: [130, 88], back: [66, 150], headW: 140, tilt: 0 },
  'outfits/girl_explorer': { head: [96, 40], eye: [130, 88], back: [66, 150], headW: 140, tilt: 0 },
  'outfits/girl_firefighter': { head: [96, 40], eye: [130, 88], back: [66, 150], headW: 140, tilt: 0 },
};

/**
 * How each item sits on its anchor: width as a multiple of the head width,
 * origin = the item's own point that goes on the anchor (0–1 of its image),
 * dx/dy = extra shift in head widths.
 */
interface ItemFit {
  w: number;
  origin: [number, number];
  dx?: number;
  dy?: number;
}

const FIT: Record<string, ItemFit> = {
  grad_cap: { w: 1.0, origin: [0.5, 0.85] },
  beaker_helmet: { w: 1.0, origin: [0.5, 0.72] },
  propeller_cap: { w: 1.0, origin: [0.5, 0.8] },
  cat_ears: { w: 0.95, origin: [0.5, 0.75] },
  leaf_crown: { w: 1.0, origin: [0.5, 0.75] },
  pith_helmet: { w: 1.15, origin: [0.5, 0.85] },
  rain_cloud: { w: 1.0, origin: [0.5, 0.8], dy: -0.15 },
  flame_hat: { w: 1.0, origin: [0.5, 0.85] },
  wizard_hat: { w: 1.1, origin: [0.5, 0.85] },

  glasses_round: { w: 0.55, origin: [0.6, 0.5] },
  goggles: { w: 0.58, origin: [0.6, 0.5], dx: 0.04 },
  star_glasses: { w: 0.6, origin: [0.6, 0.5] },
  face_mask: { w: 0.5, origin: [0.6, 0.4], dy: 0.25 },

  wings_angel: { w: 1.0, origin: [0.5, 0.5] },
  cape_red: { w: 0.9, origin: [0.5, 0.15] },
  jetpack: { w: 0.7, origin: [0.5, 0.4] },
  wings_leaf: { w: 1.0, origin: [0.5, 0.5] },
};

const REF_HEIGHT = 320;

/** Body picture for a pose. Suits only have a side picture unless `<suit>_hurt/_win` art has been added. */
export function bodyTexture(scene: Phaser.Scene, character: Character, suit: string | null, pose: Pose): { key: string; native: boolean } {
  if (!suit) return { key: `characters/${character}_${pose}`, native: true };
  const side = `outfits/${character}_${suit}`;
  if (pose === 'side') return { key: side, native: true };
  const posed = `${side}_${pose}`;
  return scene.textures.exists(posed) ? { key: posed, native: true } : { key: side, native: false };
}

/**
 * A dressed-up character: back item → body (or suit) → face item → hat, in one container.
 * Feet are at (0, 0) and it faces right; flip it with scaleX = -1.
 */
export class Costume {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly back: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Image;
  private readonly hat: Phaser.GameObjects.Image;
  private pose: Pose = 'side';
  /** False while showing the side picture for a pose that has no art of its own */
  posed = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private character: Character,
    private outfit: Outfit,
    /** Height of the body on screen, px */
    readonly height: number,
  ) {
    this.back = scene.add.image(0, 0, '__DEFAULT');
    this.body = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    this.face = scene.add.image(0, 0, '__DEFAULT');
    this.hat = scene.add.image(0, 0, '__DEFAULT');
    this.root = scene.add.container(0, 0, [this.back, this.body, this.face, this.hat]);
    this.refresh();
  }

  setPose(pose: Pose) {
    this.pose = pose;
    this.refresh();
  }

  setLook(character: Character, outfit: Outfit) {
    this.character = character;
    this.outfit = outfit;
    this.refresh();
  }

  private refresh() {
    const { key, native } = bodyTexture(this.scene, this.character, this.outfit.suit, this.pose);
    this.posed = native;
    const frame = this.scene.textures.getFrame(key);
    this.body.setTexture(key).setScale(this.height / frame.height);
    // New suit pose art (e.g. outfits/boy_lab_hurt) borrows the school-uniform anchors of the same pose until measured
    const anchors = ANCHORS[key] ?? ANCHORS[`characters/${this.character}_${this.pose}`];
    this.place(this.hat, this.outfit.hat, anchors, 'head', frame);
    this.place(this.face, this.outfit.face, anchors, 'eye', frame);
    this.place(this.back, this.outfit.back, anchors, 'back', frame);
  }

  private place(img: Phaser.GameObjects.Image, id: string | null, anchors: PoseAnchors | undefined, at: 'head' | 'eye' | 'back', frame: Phaser.Textures.Frame) {
    const def = id ? cosmeticDef(id) : undefined;
    const fit = id ? FIT[id] : undefined;
    if (!def || !fit || !anchors) {
      img.setVisible(false);
      return;
    }
    const key = cosmeticArt(def, this.character);
    // Source px → screen px; anchors were measured on 320-px-tall art
    const k = (this.height / frame.height) * (frame.height / REF_HEIGHT);
    const headW = anchors.headW * k;
    const [ax, ay] = anchors[at];
    const x = (ax - frame.width / 2 / (frame.height / REF_HEIGHT)) * k + (fit.dx ?? 0) * headW;
    const y = (ay - REF_HEIGHT) * k + (fit.dy ?? 0) * headW;
    img.setTexture(key).setVisible(true).setOrigin(fit.origin[0], fit.origin[1]);
    img.setScale((fit.w * headW) / img.frame.width);
    img.setPosition(x, y);
    img.setAngle(at === 'back' ? 0 : anchors.tilt);
  }
}
