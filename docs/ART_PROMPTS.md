# พรอมต์สร้างภาพด้วย GPT — SciBoom! บูมวิทย์

ทั้งหมดมีประมาณ 22 ภาพ เกือบทุกภาพเป็น **sprite sheet** (ภาพเดียวรวมหลายชิ้น) เพื่อประหยัดจำนวนครั้งที่ต้องสร้าง
หลังได้ภาพแล้ว AI จะเขียนสคริปต์ตัดเป็นชิ้น ๆ เอง ภาพไม่ต้องเรียงตรงตารางเป๊ะ

## วิธีทำ (อ่านก่อนเริ่ม)

1. **สร้างทุกภาพในแชต GPT เดียวกัน** เพื่อให้สไตล์ภาพไปในทางเดียวกัน
2. **สร้างภาพ 01 ก่อนเสมอ** เมื่อได้ภาพที่ชอบแล้ว ให้แนบภาพ 01 ไปด้วยทุกครั้งที่สร้างภาพถัดไป และพิมพ์ต่อท้ายว่า
   `Match the art style of the attached image exactly.`
3. **คัดลอกพรอมต์ไปทั้งก้อน** ทุกพรอมต์มีบล็อก STYLE อยู่ท้ายแล้ว
4. **ขอพื้นหลังโปร่งใส** (ยกเว้นภาพฉากหลังหมวด 11) ถ้า GPT ทำพื้นโปร่งใสไม่ได้ ให้ขอเป็น "plain flat solid magenta #FF00FF background" แทน แล้ว AI จะลบพื้นให้
5. **ตรวจภาพก่อนใช้:** ทุกชิ้นต้องแยกห่างกัน ไม่ทับกัน และไม่มีตัวหนังสือแปลก ๆ ถ้าไม่ผ่านให้สั่งสร้างใหม่
6. **ตั้งชื่อไฟล์ตามที่ระบุ** (เช่น `01_characters.png`) แล้วอัปโหลดเข้า `~/my-game/art/raw/`
   - วิธีอัปโหลดใน Cloud Shell: กดปุ่ม ⋮ (มุมขวาบนของ Terminal) → **Upload** → เลือกไฟล์ → ช่องปลายทางพิมพ์ `/home/wirun_0558/my-game/art/raw/`
   - **ไม่ต้องรอให้ครบทุกภาพ** ทำเสร็จภาพไหนก็ส่งภาพนั้นมาได้เลย

## ลำดับความสำคัญ

| ลำดับ | ภาพที่ต้องใช้ | ใช้ในขั้น |
|---|---|---|
| 🔴 ทำก่อน | 01, 06, 07, 08, 11g (ฉาก PvP), 12 | ขั้น 1 ระบบยิง |
| 🟠 ถัดไป | 09a (บอสโลก 1), 10, 11a, 13 | ขั้น 2 ด่านบอส |
| 🟢 ทีหลัง | 02, 03, 04, 05, 09b–e, 11b–f | ขั้น 3–7 |

---

## บล็อก STYLE (อยู่ท้ายทุกพรอมต์แล้ว ไม่ต้องคัดลอกแยก)
```
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

---

## 01 — ตัวละครพื้นฐาน 🔴
**ไฟล์:** `01_characters.png` | **ขนาด:** 1536×1024 (แนวนอน) | **พื้นหลัง:** โปร่งใส
```
A sprite sheet of 4 full-body chibi characters on a transparent background, arranged in one horizontal row with large empty space between them, none overlapping:
1. A Thai junior high school boy, short black hair, white short-sleeve school shirt, navy blue shorts, white socks, black shoes. SIDE VIEW facing RIGHT, standing ready pose, both arms reaching forward at chest height with hands closed as if gripping a handle (but holding nothing).
2. A Thai junior high school girl, black hair in a short bob with a small hair clip, white short-sleeve school blouse, navy blue pleated skirt, white socks, black shoes. SIDE VIEW facing RIGHT, same ready pose with both arms forward, holding nothing.
3. The same boy in FRONT VIEW, smiling, waving one hand (for a menu portrait).
4. The same girl in FRONT VIEW, smiling, making a peace sign (for a menu portrait).
All four characters are the same height and drawn at the same scale.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 02 — ท่าทางเพิ่มเติม 🟢
**ไฟล์:** `02_poses.png` | **ขนาด:** 1536×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
Using the exact same boy and girl characters from the attached image, create a sprite sheet of 4 full-body poses in one horizontal row with large empty space between them, on a transparent background:
1. Boy, side view facing right, HURT pose: leaning back, eyes squeezed shut (X-shaped eyes), small stars around his head.
2. Boy, side view facing right, VICTORY pose: jumping with one fist raised, big happy open-mouth smile.
3. Girl, side view facing right, HURT pose: leaning back, eyes squeezed shut, small stars around her head.
4. Girl, side view facing right, VICTORY pose: jumping with one fist raised, big happy smile.
Same scale as the attached image. Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 03 — ชุด 🟢
**ไฟล์:** `03_outfits.png` | **ขนาด:** 1536×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
Using the exact same boy and girl characters from the attached image, create a sprite sheet with 2 rows and 3 columns (6 full-body characters), large empty space between each, on a transparent background. All are SIDE VIEW facing RIGHT in the same ready pose (both arms reaching forward, hands gripping nothing). Do NOT add hats, glasses, or anything on the back.
Top row = the boy, bottom row = the girl. Columns, left to right:
1. Scientist outfit: white lab coat over a light blue shirt, dark pants.
2. Jungle explorer outfit: khaki shirt with pockets, khaki shorts, brown boots.
3. Firefighter outfit: red and yellow fireproof jacket and pants with reflective stripes.
Same height and scale as the attached image. Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```
> ถ้าอยากได้ชุดเพิ่ม ให้ใช้พรอมต์เดิมแต่เปลี่ยน 3 ชุดเป็น: ชุดนักบินอวกาศ (astronaut suit), เสื้อกันฝนสีเหลือง (yellow raincoat and rain boots), ชุดนินจา (ninja outfit) แล้วตั้งชื่อไฟล์ว่า `03b_outfits.png`

## 04 — หมวก 🟢
**ไฟล์:** `04_hats.png` | **ขนาด:** 1024×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
A sprite sheet of 9 separate hats and headwear items in a 3x3 arrangement with large empty space between them, on a transparent background. Each item is drawn alone (no head, no character), in SIDE VIEW facing RIGHT, sized to fit on the head of the chibi characters in the attached image. Left to right, top to bottom:
1. Black graduation cap with a gold tassel.
2. A glass beaker worn as a helmet, with green bubbling liquid.
3. A crown made of green leaves.
4. A small flame-shaped hat with orange and yellow fire.
5. A small fluffy grey rain cloud with a few raindrops, floating as a hat.
6. A purple wizard hat with an atom symbol on it.
7. A headband with orange cat ears.
8. A khaki explorer pith helmet.
9. A rainbow propeller beanie cap.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 05 — ของที่ใบหน้าและของที่หลัง 🟢
**ไฟล์:** `05_face_back.png` | **ขนาด:** 1536×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
A sprite sheet of 8 separate accessories in 2 rows of 4, with large empty space between them, on a transparent background. Each item is drawn alone (no character), in SIDE VIEW facing RIGHT, sized for the chibi characters in the attached image.
Top row (face accessories): 1. Round black-framed glasses. 2. Clear lab safety goggles with a blue strap. 3. Star-shaped pink sunglasses. 4. A white surgical face mask.
Bottom row (back accessories): 5. Small white angel wings. 6. A red superhero cape. 7. A small silver jetpack with blue flames. 8. Butterfly-shaped wings made of green leaves.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 06 — อาวุธ 16 ชิ้น 🔴
**ไฟล์:** `06_weapons.png` | **ขนาด:** 1024×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
A sprite sheet of 16 separate cartoon toy-like guns and launchers in a 4x4 arrangement with large empty space between them, on a transparent background. Each weapon is drawn alone (no hands, no character), SIDE VIEW with the barrel pointing to the RIGHT, sized to be held by the chibi characters in the attached image. Science-themed, colorful, toy-like, not realistic. Left to right, top to bottom:
1. A simple bronze training cannon.
2. A gun made from a laboratory beaker with blue liquid.
3. A launcher with a glowing atom model (orbiting electrons) on top.
4. A gun built from a distillation flask with coiled glass tubes.
5. A gun shaped like a microscope.
6. A bazooka filled with green jelly bubbles (osmosis theme).
7. A blaster with a large glowing purple cell nucleus orb.
8. A green leafy cannon with chlorophyll glow.
9. A wooden slingshot loaded with a big seed.
10. A flower-shaped gun that shoots yellow pollen.
11. A gun shaped like a red thermometer.
12. A rocket launcher with orange swirling heat waves.
13. A volcanic rock blaster dripping lava.
14. A gun shaped like a round barometer gauge.
15. A gun with a lightning-bolt barrel crackling with electricity.
16. A cannon with a small tornado spinning inside a glass tube.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 07 — กระสุนและเอฟเฟกต์ 🔴
**ไฟล์:** `07_projectiles_fx.png` | **ขนาด:** 1536×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
A sprite sheet of game projectiles and effects on a transparent background, with large empty space between every item, arranged in 3 rows:
Row 1 (8 small projectiles, each flying to the right): 1. black iron cannonball. 2. small glass beaker with blue liquid. 3. glowing atom orb. 4. green slime bubble. 5. big brown seed. 6. glowing yellow pollen ball. 7. fireball with a flame trail. 8. crackling blue lightning orb.
Row 2 (6 frames of a cartoon explosion animation, growing then fading, left to right): small bright flash -> growing orange-yellow fireball -> biggest fireball with debris -> fireball turning into grey smoke -> thinning smoke puff -> tiny fading wisps.
Row 3 (4 effects): 1. white-yellow hit spark burst. 2. round grey dust cloud puff. 3. green healing sparkles with a plus sign. 4. translucent blue round shield bubble.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 08 — ไอคอนและปุ่ม UI 🔴
**ไฟล์:** `08_ui.png` | **ขนาด:** 1024×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
A sprite sheet of 16 separate game UI icons and elements in a 4x4 arrangement with large empty space between them, on a transparent background. Glossy, chunky, cartoon mobile-game UI style. Left to right, top to bottom:
1. Wooden crate with a big yellow question mark on the front (the question mark is the only allowed symbol).
2. Shiny gold coin.
3. Glowing blue crystal gem ("knowledge crystal").
4. Shiny gold star.
5. Red heart.
6. Thick curved white wind arrow pointing right.
7. Big round red button with a glossy highlight (empty, no text).
8. Round blue button with a white arrow pointing right.
9. Half-circle protractor-style aiming gauge with tick marks (no numbers).
10. Empty horizontal power bar frame, rounded, silver.
11. Empty horizontal health bar frame, rounded, gold.
12. Gear (settings) icon.
13. Speaker (sound) icon.
14. Open book icon.
15. Treasure chest, closed.
16. Small trophy cup.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 09 — บอส 5 ตัว (ไฟล์ละ 1 ตัว)
ทุกภาพ: **ขนาด** 1024×1024 | **พื้นหลัง** โปร่งใส | แนบภาพ 01 | บอส**หันหน้าไปทางซ้าย** (หันเข้าหาผู้เล่น)
คัดลอกพรอมต์ไปได้ทั้งก้อน ไม่ต้องแก้อะไร

### 09a — Mixtron ราชาสารผสม (โลก 1) 🟠
**ไฟล์:** `09a_boss_mixtron.png`
```
A single large boss monster for a kids' artillery game, full body, SIDE VIEW facing LEFT, on a transparent background, centered with empty space around it. It should look about 3 times taller than the chibi characters in the attached image. Funny and a little scary, not gory.
"Mixtron, King of Mixtures": a big round glass flask creature with stubby legs, filled with swirling layers of colorful liquids (oil, water, sand), wearing a small crown, angry eyes on the glass, glass tube arms.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

### 09b — Amoebox อะมีบายักษ์ (โลก 2) 🟢
**ไฟล์:** `09b_boss_amoebox.png`
```
A single large boss monster for a kids' artillery game, full body, SIDE VIEW facing LEFT, on a transparent background, centered with empty space around it. It should look about 3 times taller than the chibi characters in the attached image. Funny and a little scary, not gory.
"Amoebox": a giant wobbly translucent green amoeba blob with a visible purple nucleus inside, pseudopod arms reaching out, one big eye and a wide grin.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

### 09c — Venomroot ต้นไม้กินคน (โลก 3) 🟢
**ไฟล์:** `09c_boss_venomroot.png`
```
A single large boss monster for a kids' artillery game, full body, SIDE VIEW facing LEFT, on a transparent background, centered with empty space around it. It should look about 3 times taller than the chibi characters in the attached image. Funny and a little scary, not gory.
"Venomroot": a giant carnivorous tree with a huge mouth full of leafy teeth, twisting root legs, vine arms, and a big venus flytrap flower on its head.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

### 09d — Magmadon มังกรลาวา (โลก 4) 🟢
**ไฟล์:** `09d_boss_magmadon.png`
```
A single large boss monster for a kids' artillery game, full body, SIDE VIEW facing LEFT, on a transparent background, centered with empty space around it. It should look about 3 times taller than the chibi characters in the attached image. Funny and a little scary, not gory.
"Magmadon": a chubby lava dragon made of dark volcanic rock with glowing orange lava cracks, small wings, steam puffing from its nose, a thermometer-shaped tail tip.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

### 09e — Stormlord เจ้าพายุ (โลก 5) 🟢
**ไฟล์:** `09e_boss_stormlord.png`
```
A single large boss monster for a kids' artillery game, full body, SIDE VIEW facing LEFT, on a transparent background, centered with empty space around it. It should look about 3 times taller than the chibi characters in the attached image. Funny and a little scary, not gory.
"Stormlord": a big angry dark storm cloud creature with a grumpy face, lightning-bolt arms, a swirling small tornado for a lower body, rain falling from its edges.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 10 — ลูกน้องบอส 🟠
**ไฟล์:** `10_minions.png` | **ขนาด:** 1536×1024 | **พื้นหลัง:** โปร่งใส | แนบภาพ 01
```
A sprite sheet of 5 small cute enemy minions in one horizontal row with large empty space between them, on a transparent background. Each is SIDE VIEW facing LEFT, about the same height as the chibi characters in the attached image:
1. A walking test tube with angry eyes and bubbling liquid.
2. A bouncy blue bacteria blob with little flagella.
3. A grumpy walking mushroom-sprout with a leaf hat.
4. A small fire spirit with a candle-flame head.
5. A small grey rain cloud with a frowning face and tiny lightning.
Match the art style of the attached image exactly.
STYLE: cute chibi 2D cartoon game art for a kids' turn-based artillery shooting game. Big head, small body (about 2.5 heads tall). Bold clean dark-brown outlines, bright saturated colors, simple cel shading with one soft highlight. Friendly, playful, suitable for 12-year-old students. Flat lighting, no cast shadows on the ground. No text, no letters, no watermark, no signature, no grid lines, no borders.
```

## 11 — ฉากหลัง (ไฟล์ละ 1 ฉาก)
ทุกภาพ: **ขนาด** 1536×1024 | **พื้นหลัง** ไม่โปร่งใส (เป็นภาพเต็มกรอบ) | แนบภาพ 01
คัดลอกพรอมต์ไปได้ทั้งก้อน ไม่ต้องแก้อะไร

### 11a — ห้องแล็บเคมี (โลก 1) 🟠
**ไฟล์:** `11a_bg_world1_lab.png`
```
A wide 2D side-scrolling game background, full frame, no characters, no creatures, no foreground ground platform (the playable ground will be added on top later). Distant scenery and sky only, with the lower 35% showing soft, slightly blurred far-away landscape. Calm enough that characters stand out in front of it.
A giant cartoon chemistry laboratory: huge shelves of colorful flasks and beakers in the distance, floating bubbles, soft purple-blue lighting.
Match the art style of the attached image exactly.
STYLE: cute 2D cartoon game background art, bright saturated colors, soft painterly shading, bold simple shapes, friendly and playful, suitable for 12-year-old students. No text, no letters, no watermark, no signature, no borders.
```

### 11b — ภายในเซลล์ (โลก 2) 🟢
**ไฟล์:** `11b_bg_world2_cell.png`
```
A wide 2D side-scrolling game background, full frame, no characters, no creatures, no foreground ground platform (the playable ground will be added on top later). Distant scenery and sky only, with the lower 35% showing soft, slightly blurred far-away landscape. Calm enough that characters stand out in front of it.
Inside a giant living cell seen through a microscope: soft pink-green watery world, floating organelles and round cells in the distance, light rays.
Match the art style of the attached image exactly.
STYLE: cute 2D cartoon game background art, bright saturated colors, soft painterly shading, bold simple shapes, friendly and playful, suitable for 12-year-old students. No text, no letters, no watermark, no signature, no borders.
```

### 11c — ป่าพืชยักษ์ (โลก 3) 🟢
**ไฟล์:** `11c_bg_world3_forest.png`
```
A wide 2D side-scrolling game background, full frame, no characters, no creatures, no foreground ground platform (the playable ground will be added on top later). Distant scenery and sky only, with the lower 35% showing soft, slightly blurred far-away landscape. Calm enough that characters stand out in front of it.
A magical giant-plant forest: huge leaves and flowers, sunbeams through the canopy, floating pollen sparkles, green and yellow tones.
Match the art style of the attached image exactly.
STYLE: cute 2D cartoon game background art, bright saturated colors, soft painterly shading, bold simple shapes, friendly and playful, suitable for 12-year-old students. No text, no letters, no watermark, no signature, no borders.
```

### 11d — ดินแดนภูเขาไฟ (โลก 4) 🟢
**ไฟล์:** `11d_bg_world4_volcano.png`
```
A wide 2D side-scrolling game background, full frame, no characters, no creatures, no foreground ground platform (the playable ground will be added on top later). Distant scenery and sky only, with the lower 35% showing soft, slightly blurred far-away landscape. Calm enough that characters stand out in front of it.
A cartoon volcano land: erupting volcanoes in the distance, orange sky, rising heat waves, steam vents.
Match the art style of the attached image exactly.
STYLE: cute 2D cartoon game background art, bright saturated colors, soft painterly shading, bold simple shapes, friendly and playful, suitable for 12-year-old students. No text, no letters, no watermark, no signature, no borders.
```

### 11e — บนท้องฟ้า (โลก 5) 🟢
**ไฟล์:** `11e_bg_world5_sky.png`
```
A wide 2D side-scrolling game background, full frame, no characters, no creatures, no foreground ground platform (the playable ground will be added on top later). Distant scenery and sky only, with the lower 35% showing soft, slightly blurred far-away landscape. Calm enough that characters stand out in front of it.
High in the sky among layers of clouds: a storm with lightning in the distance on one side, a rainbow on the other side, deep blue sky with visible atmosphere layers.
Match the art style of the attached image exactly.
STYLE: cute 2D cartoon game background art, bright saturated colors, soft painterly shading, bold simple shapes, friendly and playful, suitable for 12-year-old students. No text, no letters, no watermark, no signature, no borders.
```

### 11f — หน้าเมนู 🟢
**ไฟล์:** `11f_bg_menu.png`
```
A wide 2D side-scrolling game background, full frame, no characters, no creatures, no foreground ground platform (the playable ground will be added on top later). Distant scenery and sky only, with the lower 35% showing soft, slightly blurred far-away landscape. Calm enough that characters stand out in front of it.
A cheerful cartoon Thai school courtyard with a flagpole, a school building and trees, bright blue sky, used as a main menu background.
Match the art style of the attached image exactly.
STYLE: cute 2D cartoon game background art, bright saturated colors, soft painterly shading, bold simple shapes, friendly and playful, suitable for 12-year-old students. No text, no letters, no watermark, no signature, no borders.
```

### 11g — สนาม PvP 🔴
**ไฟล์:** `11g_bg_pvp_arena.png`
```
A wide 2D side-scrolling game background, full frame, no characters, no creatures, no foreground ground platform (the playable ground will be added on top later). Distant scenery and sky only, with the lower 35% showing soft, slightly blurred far-away landscape. Calm enough that characters stand out in front of it.
A fun outdoor battle arena on floating islands at sunset, colorful flags and banners on poles in the distance, warm orange-pink sky.
Match the art style of the attached image exactly.
STYLE: cute 2D cartoon game background art, bright saturated colors, soft painterly shading, bold simple shapes, friendly and playful, suitable for 12-year-old students. No text, no letters, no watermark, no signature, no borders.
```

## 12 — ลายพื้นดิน 🔴
**ไฟล์:** `12_terrain.png` | **ขนาด:** 1536×1024 | **พื้นหลัง:** ไม่โปร่งใส
```
A sheet of 6 square SEAMLESS TILEABLE ground textures for a 2D cartoon game, arranged in 2 rows and 3 columns with a thin white gap between each square. Each texture fills its whole square evenly (no single focal object, no edges, no perspective), viewed from the side as a cross-section of the ground:
1. Purple-grey laboratory stone with small embedded crystals.
2. Pink-green squishy organic cell tissue.
3. Brown soil with small pebbles and tiny roots.
4. Dark volcanic rock with glowing orange lava cracks.
5. Fluffy white-grey packed cloud material.
6. Green-brown earth with small colorful candy-like stones (for a battle arena).
STYLE: cute 2D cartoon game texture, bright saturated colors, bold simple shapes, soft shading, no text, no watermark.
```

## 13 — โลโก้เกม 🟠
**ไฟล์:** `13_logo.png` | **ขนาด:** 1536×1024 | **พื้นหลัง:** โปร่งใส
```
A game title logo that reads exactly "SciBoom!" in big chunky bubbly 3D cartoon letters, orange-to-yellow gradient with a thick dark-blue outline, with a small cartoon bomb with a lit fuse replacing the dot of the "i", little science icons (atom, flask, leaf) around the letters. On a transparent background, centered. Only the text "SciBoom!" — no other words.
```
> ส่วนคำว่า "บูมวิทย์" ที่เป็นภาษาไทย AI จะใส่เองในเกม เพราะ GPT ยังเขียนตัวอักษรไทยได้ไม่ดี
