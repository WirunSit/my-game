import { WORLD_HEIGHT, WORLD_WIDTH, baseWeaponStats } from '@sciboom/shared';
import type { Combatant } from '../game/Combatant';
import { Fighter, LOOKS } from '../game/Fighter';
import { ArenaScene } from './ArenaScene';

/** Two players taking turns on one device. */
export class BattleScene extends ArenaScene {
  constructor() {
    super('Battle');
  }

  create() {
    const seed = Math.floor(Math.random() * 1e9);
    const terrain = this.setupArena(seed, 'backgrounds/pvp_arena', 'terrain/arena_candy');

    const spawn = (x: number) => terrain.groundBelow(x, 0) ?? WORLD_HEIGHT / 2;
    const x1 = 260 + this.rng.int(0, 120);
    const x2 = WORLD_WIDTH - 260 - this.rng.int(0, 120);
    // PvP is fair: everyone gets the base stats, whatever they've upgraded
    this.combatants = [
      new Fighter(this, 'p1', 'ผู้เล่น 1', x1, spawn(x1), 1, LOOKS.boy, baseWeaponStats('starter_cannon'), 0x3a8dde),
      new Fighter(this, 'p2', 'ผู้เล่น 2', x2, spawn(x2), -1, LOOKS.girl, baseWeaponStats('beaker_gun'), 0xff5e8a),
    ];
    this.setupHud();
    this.runMatch();
  }

  protected async takeTurn(actor: Combatant) {
    const f = actor as Fighter;
    this.hud.banner(`ตาของ ${f.name}`);
    const power = await this.humanTurn(f);
    if (power !== null) await this.shoot(f, power);
    await this.wait(900);
  }

  protected onMatchEnd(winner: Combatant | null) {
    if (winner) {
      winner.celebrate();
      this.focusOn(winner);
    }
    this.showResult(winner ? `${winner.name} ชนะ!` : 'เสมอ!', [], [
      { label: 'เล่นอีกครั้ง', onClick: () => this.scene.restart() },
      { label: 'กลับเมนู', onClick: () => this.scene.start('Menu'), color: 0x3a8dde },
    ]);
  }
}
