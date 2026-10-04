// When the database can't be opened at start-up, say why in plain Thai (this
// is what shows in the hosting service's log), never printing the password.

/** A short explanation of a database start-up failure, safe to print */
export function explainDbError(err: unknown, url: string | undefined): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? '';
  const msg = String(e?.message ?? err);
  const lines = ['เปิดฐานข้อมูลไม่ได้ เซิร์ฟเวอร์จึงหยุดทำงาน', ''];
  if (url && url.includes('[YOUR-PASSWORD]')) {
    lines.push('สาเหตุ: DATABASE_URL ยังมีคำว่า [YOUR-PASSWORD] อยู่ ต้องแทนที่ด้วยรหัสผ่านจริง (ลบวงเล็บเหลี่ยมด้วย)');
  } else if (code === '28P01' || /password authentication failed/i.test(msg)) {
    lines.push('สาเหตุ: รหัสผ่านใน DATABASE_URL ผิด (ถ้าเพิ่งรีเซ็ตรหัสใน Supabase ต้องแก้ DATABASE_URL ใน Render ด้วย)');
  } else if (/tenant or user not found/i.test(msg)) {
    lines.push('สาเหตุ: ชื่อผู้ใช้ใน DATABASE_URL ผิด ต้องเป็นแบบ postgres.รหัสโปรเจค (คัดลอกจาก Supabase > Connect > Session pooler ใหม่)');
  } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    lines.push('สาเหตุ: ชื่อเซิร์ฟเวอร์ใน DATABASE_URL ผิด หรือพิมพ์ตกหล่น (คัดลอกจาก Supabase ใหม่ทั้งบรรทัด)');
  } else if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENETUNREACH') {
    lines.push('สาเหตุ: ติดต่อฐานข้อมูลไม่ได้ ตรวจว่าใช้แบบ Session pooler (…pooler.supabase.com:5432) และโปรเจค Supabase ไม่ได้ถูกพัก (Paused)');
  } else if (url && !/^postgres(ql)?:\/\//.test(url)) {
    lines.push('สาเหตุ: DATABASE_URL ต้องขึ้นต้นด้วย postgresql://');
  } else {
    lines.push(`สาเหตุที่ระบบแจ้ง: ${code ? `[${code}] ` : ''}${msg}`);
  }
  lines.push('', 'วิธีแก้: Render > บริการ sciboom > Environment > แก้ DATABASE_URL > Save แล้วรอ deploy ใหม่ (ดูขั้นตอนใน docs/DEPLOY.md)');
  // Never show the password, even if it appears inside the error message
  return lines.join('\n').replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/g, '$1****@');
}
