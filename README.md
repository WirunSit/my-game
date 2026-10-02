# SciBoom! บูมวิทย์

เกมยิงมุมผลัดตา (แนว Boom Z / Gunbound) สำหรับใช้ประกอบการเรียนวิทยาศาสตร์ ม.1
ตอบคำถามวิทยาศาสตร์ระหว่างสู้บอส เพื่อฟาร์มอาวุธและชุดแต่งตัว และเล่น PvP 1 ต่อ 1 กับเพื่อนได้

- แผนเกม: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- ความคืบหน้า: [PROGRESS.md](PROGRESS.md)

- นำขึ้นเว็บ: [docs/DEPLOY.md](docs/DEPLOY.md) · พรอมต์ภาพ: [docs/ART_PROMPTS.md](docs/ART_PROMPTS.md)

## รันในเครื่อง
```bash
npm install
npm run dev   # เกม http://localhost:8080 · หน้าครู http://localhost:8080/teacher.html
npm test      # เทสต์กติกาเกมและเซิร์ฟเวอร์
```

## โครงสร้าง
| โฟลเดอร์ | คืออะไร |
|---|---|
| `shared/` | กติกาเกม (ฟิสิกส์ การยิง สกิล เลเวล คำถาม) ใช้ทั้งเกมและเซิร์ฟเวอร์ |
| `client/` | ตัวเกม (Phaser 4) และหน้าครู (`teacher.html`) |
| `server/` | PvP ออนไลน์ บัญชีนักเรียน/ครู คลังคำถาม สถิติ |
| `tools/` | ตัดภาพ ทดสอบเล่นอัตโนมัติ จำลองสมดุล |
