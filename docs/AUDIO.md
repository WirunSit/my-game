# เสียงในเกม SciBoom!

เสียงทั้งหมดในเกม **สร้างด้วยโค้ด** (WebAudio) จึงไม่ต้องมีไฟล์เสียงก็เล่นได้ และไม่มีปัญหาลิขสิทธิ์
ถ้าอยากได้เสียงที่สมจริงกว่านี้ ใส่ **ไฟล์เสียงจริง** แทนทีละเสียงได้ เกมจะใช้ไฟล์นั้นแทนเสียงจากโค้ดเอง
(ระบบเดียวกับภาพ: มีภาพก็ใช้ภาพ ไม่มีก็ใช้แบบวาดด้วยโค้ด)

โค้ดอยู่ที่ `client/src/audio/`
- `engine.ts` — ระบบกลาง: ปุ่มปิดเสียง, ระดับเสียงแต่ละกลุ่ม (เพลง/เสียงประกอบ/บรรยากาศ), เสียงก้อง, โหลดไฟล์เสียงจริง
- `sfx.ts` — เสียงประกอบทุกเสียง (ระเบิดมีหลายชั้น: เสียงแตก + เสียงทุ้ม + ดินหินร่วง + เสียงก้อง)
- `music.ts` — เพลง 5 เพลง (เขียนเป็นคอร์ด + ทำนอง) และเสียงบรรยากาศของแต่ละโลก

## เพลงและบรรยากาศ
| ที่ไหน | เพลง | บรรยากาศ |
|---|---|---|
| เมนู, ห้องแต่งตัว, คลังอาวุธ, ล็อบบี้ | `menu` (C major สดใส) | – |
| แผนที่โลก | `map` (G major ผจญภัย) | – |
| ด่านปกติ | `battle` (A minor เร้าใจ) | ตามโลก |
| ด่านบอส | `boss` (D minor หนักและเร็วกว่า) | ตามโลก |
| 2 คน / PvP ออนไลน์ | `pvp` (E minor) | `arena` ลมเบา ๆ |

บรรยากาศตามโลก: 1 `lab` ห้องแล็บน้ำเดือดปุด ๆ แก้วกระทบ · 2 `cell` น้ำในเซลล์ · 3 `forest` ลม นก ·
4 `lava` ลาวาครืน ๆ ประกายไฟ · 5 `storm` ฝน ลมแรง ฟ้าร้องไกล ๆ

เพลงค่อย ๆ เปลี่ยนเมื่อเปลี่ยนหน้า และหยุดตอนจบเกมเพื่อให้ได้ยินเสียงชนะ/แพ้ชัด ๆ

## ใส่ไฟล์เสียงจริง
1. ตั้งชื่อไฟล์ตามตารางด้านล่าง เช่น `explode.ogg`, `music_boss.mp3`, `amb_forest.ogg`
   (ใช้ `.ogg` หรือ `.mp3` ได้ — แนะนำ `.ogg` ไฟล์เล็ก, เพลงควรตัดให้วนต่อกันได้เนียน)
2. วางใน `client/public/assets/audio/`
3. รัน `npm run audio` (ทำรายชื่อไฟล์ลง `manifest.json` — ชื่อที่ไม่รู้จักจะถูกข้ามและบอกไว้)
4. เปิดเกมใหม่ เสียงนั้นจะใช้ไฟล์จริงแทน (เสียงอื่นยังเป็นเสียงจากโค้ดตามเดิม)

> **ลิขสิทธิ์:** ใช้เฉพาะเสียงที่อนุญาตให้ใช้ได้ฟรี เช่น CC0 จาก [Kenney.nl](https://kenney.nl/assets?q=audio),
> [OpenGameArt](https://opengameart.org) (เลือกตัวกรอง CC0) หรือสร้างเองด้วย AI ที่อนุญาตให้ใช้งานได้
> repo นี้เป็น Public ห้ามใส่เพลงหรือเสียงที่มีลิขสิทธิ์จากเกมอื่น (เช่นตัดเสียงจาก BoomZ / DDTank มาใส่)

### รายชื่อเสียง
| ชื่อไฟล์ | เสียงอะไร | ความยาว |
|---|---|---|
| `click` | กดปุ่ม | สั้นมาก |
| `pick` / `deny` | เลือกสกิล / กดสกิลไม่ได้ | สั้น |
| `fire` | ยิงปืนใหญ่ | ~0.5 วิ |
| `plane` | ปาจรวดกระดาษ | ~0.4 วิ |
| `explode` | ระเบิด (เกมปรับความดังตามขนาดเอง) | ~1 วิ |
| `hit` / `hit_direct` | โดนยิง / โดนเต็ม ๆ | สั้น |
| `turn` | ถึงตาเรา | ~1 วิ |
| `tick` | นาฬิกาเดิน 5 วินาทีสุดท้าย | สั้นมาก |
| `step` | เสียงเท้าตอนเดิน | สั้นมาก |
| `heal` / `shield` / `stealth` / `teleport` | สกิลฟื้นพลัง / โล่ / พรางตัว / จรวดกระดาษลงถึงที่ | ~1 วิ |
| `burn` | ไฟไหม้ | ~0.6 วิ |
| `ultimate` / `boss_charge` | ไม้ตายของเรา / บอสชาร์จไม้ตาย | 1–1.5 วิ |
| `lava` / `roots` / `swell` / `thunder` | ลาวาสูงขึ้น / รากพิษโผล่ / อะมีบาพองตัว / ฟ้าร้อง | 1–2 วิ |
| `quiz` / `correct` / `wrong` | เปิดคำถาม / ตอบถูก / ตอบผิด | ~1 วิ |
| `crate` / `item` / `coin` | กล่องแตก / ได้ไอเท็ม / ได้เหรียญ | สั้น |
| `win` / `lose` / `levelup` | ชนะ / แพ้ / เลเวลอัป | 2–3 วิ |
| `music_menu` `music_map` `music_battle` `music_boss` `music_pvp` | เพลงวน | 1–2 นาที วนได้ |
| `amb_lab` `amb_cell` `amb_forest` `amb_lava` `amb_storm` `amb_arena` | เสียงบรรยากาศวน | 30–60 วิ วนได้ |

### พรอมต์ตัวอย่าง (ถ้าใช้ AI สร้างเสียง)
- `explode`: "cartoon cannonball explosion, punchy, short debris rain, game sound effect, no music"
- `fire`: "small cartoon cannon shot, deep thump with a quick whoosh, game sound effect"
- `music_battle`: "upbeat cheerful orchestral-pop battle loop for a kids' cartoon artillery game, 128 bpm, A minor, seamless loop, no vocals"
- `music_boss`: "energetic boss battle loop, drums and brass, 140 bpm, D minor, cartoon game, seamless loop, no vocals"
- `amb_forest`: "gentle forest ambience loop, light wind in leaves, distant birds, no music"

## ปรับความดัง
ระดับเสียงแต่ละกลุ่มอยู่ที่ `LEVEL` ใน `client/src/audio/engine.ts` (master, music, sfx, ambience)
