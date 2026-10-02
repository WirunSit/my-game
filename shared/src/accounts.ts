// Accounts (phase 6): what the game and the teacher pages exchange with the
// server, plus rules both sides check the same way (nicknames, CSV).

export interface ClassroomInfo {
  id: string;
  code: string;
  name: string;
  /** Worlds the teacher has opened (lessons taught so far) */
  openWorlds: number[];
  /** Students may play PvP with other classrooms that also allow it */
  pvpOpen: boolean;
}

export interface StudentProfile {
  id: string;
  number: number;
  nickname: string;
  classroom: ClassroomInfo;
}

export interface StudentLogin {
  token: string;
  profile: StudentProfile;
  /** Progress saved on the server (null for a brand-new student) */
  save: unknown;
}

export interface TeacherInfo {
  id: string;
  username: string;
  displayName: string;
}

export const NICKNAME_MAX = 16;
export const PIN_LENGTH = 4;

export function defaultNickname(number: number): string {
  return `นักเรียน #${number}`;
}

// Words we don't want as names. Checked after removing spaces, dots and
// repeated letters, so "ค ว ย" or "fuuuck" are caught too.
const RUDE = [
  'ควย', 'เหี้ย', 'เหี่ย', 'สัส', 'เย็ด', 'หี', 'แตด', 'ส้นตีน', 'มึง', 'กู', 'ไอ้เวร', 'อีเวร', 'ระยำ', 'จัญไร',
  'ชาติหมา', 'อีดอก', 'ดอกทอง', 'กะหรี่', 'ร่าน', 'แม่ง', 'เชี่ย', 'พ่อง', 'แม่มึง', 'ปัญญาอ่อน', 'อีควาย', 'ไอ้ควาย', 'อีสัตว์', 'ไอ้สัตว์',
  'fuck', 'fck', 'shit', 'bitch', 'dick', 'pussy', 'cunt', 'asshole', 'bastard', 'porn', 'sex', 'nigga', 'nigger',
];

function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s._\-*+~!@#$%^&()[\]{}|\\/:;"'<>,?=`]/g, '')
    .replace(/(.)\1+/gu, '$1');
}

/** Why a nickname isn't allowed (in Thai), or null if it's fine */
export function nicknameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return 'ใส่ชื่อเล่นก่อนนะ';
  if (n.length > NICKNAME_MAX) return `ชื่อยาวได้ไม่เกิน ${NICKNAME_MAX} ตัวอักษร`;
  if (!/^[฀-๿a-zA-Z0-9 ._-]+$/.test(n)) return 'ใช้ได้แค่ตัวอักษรไทย อังกฤษ ตัวเลข และ . _ -';
  const flat = squash(n);
  if (RUDE.some((w) => flat.includes(squash(w)))) return 'ชื่อนี้ไม่สุภาพ ลองชื่ออื่นนะ';
  return null;
}

// ---- CSV (question bank import/export) ----------------------------------------------

/** Parse CSV text (quotes, commas and new lines inside quotes, CRLF) into rows of cells */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Thai text correctly
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** Column order of the question bank CSV (answer is 1–4, like ก–ง) */
export const QUESTION_CSV_HEADER = ['id', 'unit', 'topic', 'difficulty', 'question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation', 'reviewed'];
