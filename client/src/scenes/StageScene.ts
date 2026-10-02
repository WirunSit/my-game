import * as Phaser from 'phaser';
import { QuizDeck, RARITY_NAMES, WORLD_HEIGHT, WORLD_WIDTH, addExp, newlyUnlocked, planShot, rollDrop, stageRewards, weaponDef, weaponStats, type Vec } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_WIDTH, TEXT_STROKE } from '../config';
import type { Combatant } from '../game/Combatant';
import { Crate } from '../game/Crate';
import { Enemy } from '../game/Enemy';
import { Fighter } from '../game/Fighter';
import { UNITS } from '../game/questionBank';
import { STAGES, nextStage, stageById, type StageConfig } from '../game/stages';
import { equippedWeapon, loadSave, newUid, updateSave } from '../save';
import { showQuiz } from '../ui/QuizPopup';
import { RARITY_COLORS, addStars } from '../ui/rarity';
import { ArenaScene } from './ArenaScene';

type Item = 'heal' | 'shield' | 'double' | 'power';
const ITEMS: Record<Item, { label: string }> = {
  heal: { label: 'ฟื้นพลัง +250' },
  shield: { label: 'ได้โล่! ลดดาเมจครั้งต่อไปครึ่งหนึ่ง' },
  double: { label: 'ยิงสองนัดในตาถัดไป!' },
  power: { label: 'พลังโจมตี +30% นัดถัดไป!' },
};

/** Single-player stage: the student vs a minion or boss, with science questions. */
export class StageScene extends ArenaScene {
  private stage!: StageConfig;
  private player!: Fighter;
  private enemy!: Enemy;
  private deck!: QuizDeck;
  private crates: Crate[] = [];
  private pendingCrates = 0;
  private shield = false;
  private doubleShot = false;
  private damageMul = 1;
  private enemyTurns = 0;
  private enemySkill = 0;
  private stats = { asked: 0, correct: 0, crystals: 0 };

  constructor() {
    super('Stage');
  }

  init(data: { stageId?: string }) {
    this.stage = stageById(data.stageId ?? '') ?? STAGES[0];
  }

  create() {
    this.crates = [];
    this.pendingCrates = 0;
    this.shield = false;
    this.doubleShot = false;
    this.damageMul = 1;
    this.enemyTurns = 0;
    this.stats = { asked: 0, correct: 0, crystals: 0 };

    const seed = Math.floor(Math.random() * 1e9);
    const terrain = this.setupArena(seed, this.stage.background, this.stage.ground);
    const ground = (x: number) => terrain.groundBelow(x, 0) ?? WORLD_HEIGHT / 2;

    const save = loadSave();
    const px = 260 + this.rng.int(0, 100);
    const ex = WORLD_WIDTH - 300;
    this.player = new Fighter(this, 'player', 'คุณ', px, ground(px), 1, { character: save.character, outfit: save.outfit }, weaponStats(equippedWeapon(save)), 0x3a8dde);
    this.enemy = new Enemy(this, 'enemy', this.stage.enemy, ex, ground(ex));
    this.enemySkill = this.stage.enemy.skill;
    this.combatants = [this.player, this.enemy];
    this.setupHud('WorldMap');

    this.deck = new QuizDeck(UNITS[this.stage.unit].questions, this.rng, this.stage.maxDifficulty);
    for (let i = 0; i < this.stage.crates; i++) this.spawnCrate();
    this.updateStatus();

    this.intro().then(() => this.runMatch());
  }

  private async intro() {
    this.focusOn(this.enemy);
    this.hud.banner(`ด่าน ${this.stage.id}: ${this.stage.title}`, this.stage.isBoss ? '#ff8866' : '#ffffff');
    await this.wait(1700);
  }

  // ---- Turns ----------------------------------------------------------------

  protected async takeTurn(actor: Combatant) {
    if (actor === this.player) await this.playerTurn();
    else await this.enemyTurn();
  }

  private async playerTurn() {
    this.enemy.clearStun();
    if (this.turn > 0 && this.turn % 6 === 0 && this.activeCrates() < this.stage.crates) {
      this.spawnCrate();
      this.hud.banner('มีกล่องคำถามใหม่!', '#ffdd33');
      await this.wait(900);
    }
    this.hud.banner('ตาของคุณ!');
    const power = await this.humanTurn(this.player);
    if (power !== null) {
      const mul = this.damageMul;
      this.damageMul = 1;
      await this.shoot(this.player, power, { damageMul: mul });
      if (this.doubleShot && this.enemy.alive) {
        this.doubleShot = false;
        this.hud.banner('นัดที่สอง!', '#ffdd33');
        await this.wait(500);
        await this.shoot(this.player, power);
      }
      this.updateStatus();
    }
    await this.wait(600);
    await this.openPendingCrates();
    await this.wait(300);
  }

  private async enemyTurn() {
    const e = this.enemy;
    this.hud.showTimer(false);
    this.enemyTurns++;
    this.focusOn(e);
    await this.wait(700);

    const every = this.stage.ultimateEvery;
    if (every > 0 && this.stage.ultimate && this.enemyTurns % every === 0) {
      await this.enemyUltimate();
    } else {
      const plan = this.plan(this.enemySkill);
      await e.windUp();
      const outcome = await this.shoot(e, plan.power, { angle: plan.angle });
      const hitPlayer = outcome.hits.some((h) => h.target === this.player);
      // Like a real player, the computer corrects its aim after a miss
      this.enemySkill = hitPlayer ? Math.max(this.stage.enemy.skill, this.enemySkill - 0.1) : Math.min(0.95, this.enemySkill + 0.15);
    }
    await this.wait(800);
  }

  /** Charge → question. Right answer interrupts; wrong answer lets the ultimate fire. */
  private async enemyUltimate() {
    const e = this.enemy;
    const ult = this.stage.ultimate!;
    e.startCharge();
    this.hud.banner(`${e.name} กำลังชาร์จ "${ult.name}"!`, '#ff8866');
    await this.wait(1500);

    const ok = await this.ask('ตอบให้ถูกเพื่อขัดท่าไม้ตาย!');
    e.stopCharge();
    if (ok) {
      e.showStun();
      this.damageMul = 1.3;
      this.updateStatus();
      this.hud.banner('ขัดท่าสำเร็จ! ศัตรูมึนงง', '#7dff8a');
      await this.wait(1300);
      return;
    }

    this.hud.banner(`${ult.name}!`, '#ff5544');
    await this.wait(700);
    const plan = this.plan(Math.min(0.95, this.enemySkill + 0.2));
    for (let k = 0; k < ult.shots && this.player.alive; k++) {
      const offset = k - (ult.shots - 1) / 2;
      await this.shoot(e, Phaser.Math.Clamp(plan.power + offset * 3, 10, 100), { weapon: ult.weapon, angle: plan.angle + offset * 2 });
      await this.wait(250);
    }
  }

  private plan(skill: number) {
    const targets = this.combatants.filter((c) => c.alive).map((c) => c.toTarget());
    return planShot(this.enemy.muzzle(), this.enemy.facing, this.player.toTarget(), this.wind, this.terrain, targets, this.enemy.id, skill, this.rng);
  }

  // ---- Questions & items ----------------------------------------------------

  private async ask(title: string): Promise<boolean> {
    this.phase = 'quiz';
    const item = this.deck.next();
    const res = await showQuiz(this, item, { title });
    this.phase = 'idle';
    this.deck.report(item.question, res.correct);
    this.stats.asked++;
    if (res.correct) {
      this.stats.crystals++;
      this.stats.correct++;
    }
    updateSave((d) => {
      d.answers.push({ id: item.question.id, ok: res.correct, ms: Math.round(res.timeMs), at: Date.now() });
      if (res.correct) d.crystals++;
    });
    this.updateStatus();
    return res.correct;
  }

  private async openPendingCrates() {
    while (this.pendingCrates > 0 && this.player.alive) {
      this.pendingCrates--;
      const ok = await this.ask('กล่องคำถาม! ตอบถูกรับไอเท็ม');
      if (ok) {
        const item = (['heal', 'shield', 'double', 'power'] as Item[])[this.rng.int(0, 3)];
        this.grant(item);
        this.hud.banner(ITEMS[item].label, '#7dff8a');
        await this.wait(1200);
      }
    }
  }

  private grant(item: Item) {
    switch (item) {
      case 'heal':
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 250);
        this.hud.refreshHp();
        this.floatText(this.player.x, this.player.y - 130, '+250', '#7dff8a');
        break;
      case 'shield':
        this.shield = true;
        break;
      case 'double':
        this.doubleShot = true;
        break;
      case 'power':
        this.damageMul = 1.3;
        break;
    }
    this.updateStatus();
  }

  protected modifyDamage(target: Combatant, damage: number): number {
    if (target === this.player && this.shield) {
      this.shield = false;
      this.updateStatus();
      this.hud.banner('โล่ช่วยไว้!', '#7dd3ff');
      return Math.round(damage / 2);
    }
    return damage;
  }

  protected onExplosion(at: Vec, radius: number, shooter: Combatant) {
    for (const c of this.crates) {
      if (c.opened || Math.hypot(c.x - at.x, c.centerY - at.y) > radius + 30) continue;
      c.open();
      if (shooter === this.player) this.pendingCrates++;
      else this.hud.banner('กล่องคำถามแตก!', '#cccccc');
    }
  }

  private spawnCrate() {
    for (let tries = 0; tries < 30; tries++) {
      const x = this.rng.int(520, WORLD_WIDTH - 560);
      const tooClose = [this.player, this.enemy, ...this.crates.filter((c) => !c.opened)].some((o) => Math.abs(o.x - x) < 140);
      const y = this.terrain.groundBelow(x, 0);
      if (tooClose || y === null) continue;
      this.crates.push(new Crate(this, x, y));
      return;
    }
  }

  private activeCrates(): number {
    return this.crates.filter((c) => !c.opened).length;
  }

  private updateStatus() {
    const items = [{ icon: 'ui/crystal', text: `${this.stats.crystals}` }];
    if (this.shield) items.push({ icon: 'fx/fx_shield', text: 'โล่' });
    if (this.doubleShot) items.push({ icon: 'fx/proj_cannonball', text: 'x2' });
    if (this.damageMul > 1) items.push({ icon: 'fx/fx_spark', text: '+30%' });
    this.hud.setStatus(items);
    this.player.setShieldVisible(this.shield);
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    if (!Number.isFinite(delta) || delta < 0) return;
    const dt = Math.min(delta, 50) / 1000;
    for (const c of this.crates) c.settle(this.terrain, dt);
  }

  // ---- End ------------------------------------------------------------------

  protected onMatchEnd(winner: Combatant | null) {
    const won = winner === this.player;
    const { asked, correct, crystals } = this.stats;
    const restart = () => this.scene.restart({ stageId: this.stage.id });
    const toMap = () => this.scene.start('WorldMap');
    const hpFrac = this.player.hp / this.player.maxHp;
    const stars = won ? (hpFrac >= 0.6 ? 3 : hpFrac >= 0.3 ? 2 : 1) : 0;

    // Rewards: EXP + coins always (right answers count even when losing), weapon drop on a win
    const rewards = stageRewards({ won, stars, correct, isBoss: !!this.stage.isBoss });
    const drop = won ? rollDrop(this.stage.drops, this.rng) : null;
    let levelsGained = 0;
    const saved = updateSave((d) => {
      const lv = addExp(d, rewards.exp);
      d.level = lv.level;
      d.exp = lv.exp;
      levelsGained = lv.levelsGained;
      d.coins += rewards.coins;
      if (won) d.stars[this.stage.id] = Math.max(d.stars[this.stage.id] ?? 0, stars);
      if (drop) d.weapons.push({ uid: newUid(), id: drop.id, rarity: drop.rarity, level: 1 });
    });
    const rewardLines = [`EXP +${rewards.exp} · เหรียญ +${rewards.coins} · ผลึกความรู้ +${crystals}`];
    if (levelsGained > 0) rewardLines.push(`เลเวลอัป! ตอนนี้ Lv ${saved.level}`);
    // New wardrobe items from the level-up: tell the player and offer a shortcut
    const unlocked = newlyUnlocked(saved.level - levelsGained, saved.level);
    if (unlocked.length > 0) {
      const names = unlocked.slice(0, 2).map((c) => c.name).join(', ');
      rewardLines.push(`ปลดล็อกของแต่งใหม่: ${names}${unlocked.length > 2 ? ' และอื่น ๆ' : ''}`);
    }
    const wardrobeButton = { label: 'ห้องแต่งตัว', onClick: () => this.scene.start('Wardrobe', { from: 'WorldMap' }), color: 0xe0559a };

    if (!won) {
      this.enemy.celebrate();
      this.showResult(
        'แพ้แล้ว ลองใหม่นะ!',
        [`ตอบถูก ${correct}/${asked} ข้อ`, ...rewardLines, 'ตอบคำถามให้ถูกเพื่อขัดท่าไม้ตายของศัตรู'],
        [
          { label: 'ลองอีกครั้ง', onClick: restart },
          { label: 'คลังอาวุธ', onClick: () => this.scene.start('Inventory'), color: 0x8a5cf6 },
          ...(unlocked.length > 0 ? [wardrobeButton] : []),
          { label: 'แผนที่', onClick: toMap, color: 0x3a8dde },
        ],
        '#ff8866',
      );
      return;
    }

    this.player.celebrate();
    this.focusOn(this.player);
    const next = nextStage(this.stage.id);
    const buttons = [];
    if (next) buttons.push({ label: 'ด่านต่อไป', onClick: () => this.scene.start('Stage', { stageId: next.id }) });
    buttons.push({ label: 'เล่นอีกครั้ง', onClick: restart, color: next ? 0x8a5cf6 : undefined });
    buttons.push({ label: 'คลังอาวุธ', onClick: () => this.scene.start('Inventory'), color: 0x2fbf5b });
    if (unlocked.length > 0) buttons.push(wardrobeButton);
    buttons.push({ label: 'แผนที่', onClick: toMap, color: 0x3a8dde });
    // First line left empty: the star images go there
    this.showResult(this.stage.isBoss ? 'ปราบบอสสำเร็จ!' : 'ผ่านด่าน!', ['', `ตอบถูก ${correct}/${asked} ข้อ`, ...rewardLines], buttons);
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(GAME_WIDTH / 2 + (i - 1) * 64, 242, 'ui/star').setScrollFactor(0).setDepth(DEPTH.overlay);
      const size = 46 / star.height;
      star.setScale(0).setAlpha(i < stars ? 1 : 0.25);
      this.tweens.add({ targets: star, scale: size, duration: 400, delay: 300 + i * 250, ease: 'Back.out' });
    }
    if (drop) this.showDropCard(drop.id, drop.rarity);
  }

  /** "ได้อาวุธใหม่!" card under the result buttons */
  private showDropCard(id: string, rarity: number) {
    const cx = GAME_WIDTH / 2;
    const cy = 600;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const g = this.add.graphics();
    g.fillStyle(0x1b1d3a, 0.9).fillRoundedRect(cx - 260, cy - 62, 520, 124, 20);
    g.lineStyle(4, RARITY_COLORS[rarity] ?? 0xffffff, 1).strokeRoundedRect(cx - 260, cy - 62, 520, 124, 20);
    parts.push(g);
    const img = this.add.image(cx - 170, cy, `weapons/${id}`);
    img.setScale(Math.min(140 / img.width, 100 / img.height));
    parts.push(img);
    const style = (size: number, color: string) => ({ fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: '700', color, stroke: TEXT_STROKE, strokeThickness: 4, padding: { top: 6 } });
    parts.push(this.add.text(cx - 80, cy - 38, 'ได้อาวุธใหม่!', style(22, '#ffcc33')).setOrigin(0, 0.5));
    parts.push(this.add.text(cx - 80, cy - 4, weaponDef(id).name, style(26, '#ffffff')).setOrigin(0, 0.5));
    parts.push(this.add.text(cx - 80, cy + 32, `ระดับ ${RARITY_NAMES[rarity]}`, style(18, '#dddddd')).setOrigin(0, 0.5));
    parts.push(...addStars(this, cx + 150, cy + 32, rarity));
    for (const p of parts) (p as unknown as Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth).setScrollFactor(0).setDepth(DEPTH.overlay);
    this.tweens.add({ targets: parts, alpha: { from: 0, to: 1 }, duration: 500, delay: 1100 });
  }
}
