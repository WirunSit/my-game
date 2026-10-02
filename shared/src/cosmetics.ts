// Wardrobe items. Pure data + rules (no art positions) so the future server can
// check that a player really has the level for what they wear.

export type CosmeticSlot = 'hat' | 'face' | 'back' | 'suit';
export type Character = 'boy' | 'girl';

/** Drawing order is decided by the client; this is the order of the wardrobe tabs */
export const COSMETIC_SLOTS: CosmeticSlot[] = ['hat', 'face', 'suit', 'back'];

export const SLOT_NAMES: Record<CosmeticSlot, string> = {
  hat: 'หมวก',
  face: 'ใบหน้า',
  suit: 'ชุด',
  back: 'ที่หลัง',
};

/** Level when the first item of each slot unlocks (GAME_DESIGN 4.3) */
export const SLOT_UNLOCK_LEVEL: Record<CosmeticSlot, number> = { hat: 3, face: 5, suit: 8, back: 10 };

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  /** Player level needed to wear it */
  level: number;
}

/** Each slot opens with one item, then more trickle in up to Lv20 so there is always something to look forward to */
export const COSMETIC_CATALOG: CosmeticDef[] = [
  { id: 'grad_cap', slot: 'hat', name: 'หมวกบัณฑิต', level: 3 },
  { id: 'beaker_helmet', slot: 'hat', name: 'หมวกบีกเกอร์', level: 4 },
  { id: 'propeller_cap', slot: 'hat', name: 'หมวกใบพัด', level: 6 },
  { id: 'cat_ears', slot: 'hat', name: 'ที่คาดหูแมว', level: 7 },
  { id: 'leaf_crown', slot: 'hat', name: 'มงกุฎใบไม้', level: 9 },
  { id: 'pith_helmet', slot: 'hat', name: 'หมวกนักสำรวจ', level: 11 },
  { id: 'rain_cloud', slot: 'hat', name: 'เมฆฝนจิ๋ว', level: 13 },
  { id: 'flame_hat', slot: 'hat', name: 'หมวกเปลวไฟ', level: 16 },
  { id: 'wizard_hat', slot: 'hat', name: 'หมวกพ่อมดอะตอม', level: 20 },

  { id: 'glasses_round', slot: 'face', name: 'แว่นกลม', level: 5 },
  { id: 'goggles', slot: 'face', name: 'แว่นกันสารเคมี', level: 7 },
  { id: 'face_mask', slot: 'face', name: 'หน้ากากอนามัย', level: 12 },
  { id: 'star_glasses', slot: 'face', name: 'แว่นดาว', level: 17 },

  { id: 'lab', slot: 'suit', name: 'ชุดนักวิทยาศาสตร์', level: 8 },
  { id: 'explorer', slot: 'suit', name: 'ชุดนักสำรวจ', level: 14 },
  { id: 'firefighter', slot: 'suit', name: 'ชุดนักดับเพลิง', level: 18 },

  { id: 'cape_red', slot: 'back', name: 'ผ้าคลุมฮีโร่', level: 10 },
  { id: 'wings_leaf', slot: 'back', name: 'ปีกใบไม้', level: 13 },
  { id: 'jetpack', slot: 'back', name: 'เจ็ตแพ็ก', level: 16 },
  { id: 'wings_angel', slot: 'back', name: 'ปีกนางฟ้า', level: 20 },
];

/** What a player wears; null = nothing in that slot (suit null = school uniform) */
export type Outfit = Record<CosmeticSlot, string | null>;

export const EMPTY_OUTFIT: Outfit = { hat: null, face: null, suit: null, back: null };

export function cosmeticDef(id: string): CosmeticDef | undefined {
  return COSMETIC_CATALOG.find((c) => c.id === id);
}

/** Texture key of an item. Suits are whole-body pictures, one per character. */
export function cosmeticArt(def: CosmeticDef, character: Character): string {
  switch (def.slot) {
    case 'hat':
      return `hats/${def.id}`;
    case 'face':
    case 'back':
      return `accessories/${def.id}`;
    case 'suit':
      return `outfits/${character}_${def.id}`;
  }
}

export function isUnlocked(def: CosmeticDef, level: number): boolean {
  return level >= def.level;
}

/** Drop unknown, wrong-slot or still-locked items (old saves, hand-edited storage, cheating) */
export function sanitizeOutfit(outfit: Partial<Outfit> | undefined, level: number): Outfit {
  const clean: Outfit = { ...EMPTY_OUTFIT };
  for (const slot of COSMETIC_SLOTS) {
    const def = cosmeticDef(outfit?.[slot] ?? '');
    if (def && def.slot === slot && isUnlocked(def, level)) clean[slot] = def.id;
  }
  return clean;
}

/** Items that became wearable when going from level `from` to `to` (for the level-up message) */
export function newlyUnlocked(from: number, to: number): CosmeticDef[] {
  return COSMETIC_CATALOG.filter((c) => c.level > from && c.level <= to);
}
