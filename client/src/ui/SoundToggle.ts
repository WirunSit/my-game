import * as Phaser from 'phaser';
import { isMuted, onMuteChange, setMuted } from '../audio/Sound';
import { DEPTH } from '../config';

/** Speaker button (and the M key) that turns all sound on/off */
export function addSoundToggle(scene: Phaser.Scene, x: number, y: number, size = 40) {
  const icon = scene.add.image(x, y, 'ui/sound').setScrollFactor(0).setDepth(DEPTH.hud);
  icon.setScale(size / icon.height);
  const slash = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
  const draw = (muted: boolean) => {
    icon.setAlpha(muted ? 0.55 : 1);
    slash.clear();
    if (muted) slash.lineStyle(6, 0xe5484d, 1).lineBetween(x - size / 2, y + size / 2, x + size / 2, y - size / 2);
  };
  draw(isMuted());
  icon.setInteractive({ useHandCursor: true }).on('pointerup', () => setMuted(!isMuted()));
  const off = onMuteChange(draw);
  const key = scene.input.keyboard?.addKey('M');
  key?.on('down', () => setMuted(!isMuted()));
  scene.events.once('shutdown', () => {
    off();
    key?.removeAllListeners();
  });
}
