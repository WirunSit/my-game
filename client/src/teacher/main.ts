// SciBoom! teacher pages (teacher.html): classrooms, PIN sheets, statistics,
// world settings and the question bank. Plain DOM, no framework.
import './teacher.css';
import type { ClassroomInfo, TeacherInfo } from '@sciboom/shared';

// ---- Tiny helpers ------------------------------------------------------------------

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const TOKEN_KEY = 'sciboom.teacher.v1';
let token = localStorage.getItem(TOKEN_KEY);
let me: TeacherInfo | null = null;

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(method: string, path: string, body?: unknown, raw?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`api/${path}`, {
      method,
      headers: { 'content-type': raw !== undefined ? 'text/csv' : 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  }
  if (res.status === 401 && token) {
    setToken(null);
    location.hash = '#/login';
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? 'เกิดข้อผิดพลาด');
  return data as T;
}

function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

const app = document.getElementById('app')!;

/** Go to a page (also redraws when we're already on it) */
function go(hash: string) {
  if (location.hash === hash) void route();
  else location.hash = hash;
}
const fmtPct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : '–');
const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ยังไม่เคยเข้า');
const gameUrl = () => new URL('.', location.href).href;

function page(title: string, ...content: Child[]) {
  const nav = (href: string, label: string) => h('a', { href, class: location.hash.startsWith(href) ? 'on' : '' }, label);
  app.replaceChildren(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'brand', href: '#/classes' }, 'SciBoom! หน้าครู'),
      me && h('nav', {}, nav('#/classes', 'ห้องเรียน'), nav('#/questions', 'คลังคำถาม'), h('a', { href: gameUrl(), target: '_blank' }, 'เปิดเกม')),
      me &&
        h(
          'span',
          { class: 'who' },
          `${me.displayName} · `,
          h('a', { href: '#', style: 'color:#fff', onclick: (e: Event) => (e.preventDefault(), void logout()) }, 'ออกจากระบบ'),
        ),
    ),
    h('main', {}, h('h1', {}, title), ...content),
  );
  document.title = `${title} · SciBoom! หน้าครู`;
}

async function logout() {
  try {
    await api('POST', 'logout');
  } catch {
    // ignore
  }
  setToken(null);
  me = null;
  go('#/login');
}

/** A labelled input */
function field(label: string, input: HTMLElement, cls = ''): HTMLLabelElement {
  return h('label', { class: cls }, label, input);
}

// ---- Login / register ------------------------------------------------------------------------

function renderLogin() {
  const err = h('p', { class: 'error' });
  const loginUser = h('input', { autocomplete: 'username' });
  const loginPass = h('input', { type: 'password', autocomplete: 'current-password' });
  const regUser = h('input', { autocomplete: 'username', placeholder: 'เช่น kru.somchai' });
  const regName = h('input', { placeholder: 'เช่น ครูสมชาย' });
  const regPass = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'อย่างน้อย 8 ตัว' });
  const regCode = h('input', { placeholder: 'ถ้าโรงเรียนตั้งไว้' });
  const done = (res: { token: string; teacher: TeacherInfo }) => {
    setToken(res.token);
    me = res.teacher;
    go('#/classes');
  };
  const run = (fn: () => Promise<void>) => async (e: Event) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await fn();
    } catch (x) {
      err.textContent = (x as Error).message;
    }
  };
  page(
    'เข้าสู่ระบบสำหรับครู',
    h(
      'div',
      { class: 'grid' },
      h(
        'form',
        { class: 'card', onsubmit: run(async () => done(await api('POST', 'teacher/login', { username: loginUser.value, password: loginPass.value }))) },
        h('h2', {}, 'มีบัญชีแล้ว'),
        field('ชื่อผู้ใช้', loginUser),
        field('รหัสผ่าน', loginPass),
        h('p', {}, h('button', { type: 'submit' }, 'เข้าสู่ระบบ')),
      ),
      h(
        'form',
        {
          class: 'card',
          onsubmit: run(async () =>
            done(await api('POST', 'teacher/register', { username: regUser.value, displayName: regName.value, password: regPass.value, signupCode: regCode.value })),
          ),
        },
        h('h2', {}, 'สมัครบัญชีครู'),
        field('ชื่อผู้ใช้ (ภาษาอังกฤษ)', regUser),
        field('ชื่อที่แสดง', regName),
        field('รหัสผ่าน', regPass),
        field('รหัสสมัครของโรงเรียน', regCode),
        h('p', {}, h('button', { type: 'submit' }, 'สมัคร')),
      ),
    ),
    err,
  );
}

// ---- Classrooms ------------------------------------------------------------------------------

type ClassroomRow = ClassroomInfo & { students: number };

async function renderClassrooms() {
  page('ห้องเรียนของฉัน', h('p', { class: 'muted' }, 'กำลังโหลด...'));
  const { classrooms } = await api<{ classrooms: ClassroomRow[] }>('GET', 'teacher/classrooms');
  const err = h('p', { class: 'error' });
  const name = h('input', { placeholder: 'เช่น ม.1/3 ปี 2569', required: true });
  const code = h('input', { placeholder: 'ว่างไว้ = สุ่มให้', maxlength: 20 });
  const count = h('input', { type: 'number', min: 1, max: 60, value: '40' });
  const create = async (e: Event) => {
    e.preventDefault();
    err.textContent = '';
    try {
      const { classroom } = await api<{ classroom: ClassroomInfo }>('POST', 'teacher/classrooms', { name: name.value, code: code.value, students: Number(count.value) });
      location.hash = `#/class/${classroom.id}/students`;
    } catch (x) {
      err.textContent = (x as Error).message;
    }
  };
  page(
    'ห้องเรียนของฉัน',
    classrooms.length === 0
      ? h('p', { class: 'muted' }, 'ยังไม่มีห้องเรียน สร้างห้องแรกด้านล่างได้เลย')
      : h(
          'div',
          { class: 'grid' },
          ...classrooms.map((c) =>
            h(
              'a',
              { class: 'card', href: `#/class/${c.id}/students`, style: 'text-decoration:none;color:inherit' },
              h('h2', {}, c.name),
              h('p', {}, 'รหัสห้องเรียน ', h('b', { class: 'pin' }, c.code)),
              h('p', { class: 'muted small' }, `นักเรียน ${c.students} คน · เปิดโลก ${c.openWorlds.join(', ') || '-'}`),
            ),
          ),
        ),
    h(
      'form',
      { class: 'card', onsubmit: create },
      h('h2', {}, 'สร้างห้องเรียนใหม่'),
      h('div', { class: 'row' }, field('ชื่อห้อง', name), field('รหัสห้องเรียน', code), field('จำนวนนักเรียน', count), h('button', { type: 'submit' }, 'สร้างห้อง')),
      h('p', { class: 'muted small' }, 'ระบบจะสร้างเลขที่ 1 ถึงจำนวนที่ใส่ พร้อม PIN 4 หลักให้แต่ละคน แล้วพิมพ์ใบ PIN แจกนักเรียนได้'),
      err,
    ),
  );
}

interface StudentSummary {
  id: string;
  number: number;
  nickname: string;
  pin: string;
  level: number;
  stars: number;
  crystals: number;
  answered: number;
  correct: number;
  lastSeen: number;
}

async function loadClassroom(id: string) {
  return api<{ classroom: ClassroomInfo; students: StudentSummary[]; maxStudents: number }>('GET', `teacher/classrooms/${id}`);
}

async function renderClassroom(id: string, tab: string) {
  page('ห้องเรียน', h('p', { class: 'muted' }, 'กำลังโหลด...'));
  const data = await loadClassroom(id);
  const c = data.classroom;
  const tabs = h(
    'div',
    { class: 'tabs' },
    ...[
      ['students', 'นักเรียนและ PIN'],
      ['stats', 'สถิติ'],
      ['settings', 'ตั้งค่า'],
    ].map(([t, label]) => h('a', { href: `#/class/${id}/${t}`, class: t === tab ? 'on' : '' }, label)),
  );
  const body = h('div', {});
  page(`${c.name}`, h('p', {}, 'รหัสห้องเรียน ', h('b', { class: 'pin' }, c.code), h('span', { class: 'muted' }, ` · ให้นักเรียนเข้าเกมที่ ${gameUrl()}`)), tabs, body);
  if (tab === 'stats') await statsTab(body, c);
  else if (tab === 'settings') await settingsTab(body, c);
  else studentsTab(body, c, data.students, data.maxStudents);
}

function studentsTab(body: HTMLElement, c: ClassroomInfo, students: StudentSummary[], max: number) {
  const msg = h('p', { class: 'error' });
  const addCount = h('input', { type: 'number', min: 1, max: max - students.length, value: '1', style: 'width:90px' });
  const rows = students.map((s) => {
    const pin = h('span', { class: 'pin' }, s.pin);
    const reset = async () => {
      if (!confirm(`รีเซ็ต PIN ของเลขที่ ${s.number}? นักเรียนต้องใช้ PIN ใหม่เข้าเกม`)) return;
      const r = await api<{ pin: string }>('POST', `teacher/students/${s.id}/reset-pin`);
      pin.textContent = r.pin;
    };
    return h(
      'tr',
      {},
      h('td', { class: 'num' }, s.number),
      h('td', {}, s.nickname),
      h('td', {}, pin),
      h('td', { class: 'num' }, s.level),
      h('td', { class: 'num' }, s.stars),
      h('td', { class: 'num' }, s.answered ? `${s.correct}/${s.answered} (${fmtPct(s.correct, s.answered)})` : '–'),
      h('td', { class: 'small muted' }, fmtDate(s.lastSeen)),
      h('td', {}, h('button', { class: 'secondary small', onclick: () => void reset() }, 'รีเซ็ต PIN')),
    );
  });
  body.replaceChildren(
    h(
      'div',
      { class: 'row no-print', style: 'margin-bottom:12px' },
      h('a', { href: `#/print/${c.id}` }, h('button', {}, 'พิมพ์ใบ PIN')),
      h(
        'form',
        {
          class: 'row',
          onsubmit: async (e: Event) => {
            e.preventDefault();
            try {
              await api('POST', `teacher/classrooms/${c.id}/students`, { count: Number(addCount.value) });
              void route();
            } catch (x) {
              msg.textContent = (x as Error).message;
            }
          },
        },
        field('เพิ่มนักเรียน (คน)', addCount),
        h('button', { class: 'secondary', type: 'submit' }, 'เพิ่ม'),
      ),
    ),
    msg,
    h(
      'div',
      { class: 'card table-wrap' },
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { class: 'num' }, 'เลขที่'),
            h('th', {}, 'ชื่อเล่น'),
            h('th', {}, 'PIN'),
            h('th', { class: 'num' }, 'เลเวล'),
            h('th', { class: 'num' }, 'ดาว'),
            h('th', { class: 'num' }, 'ตอบถูก'),
            h('th', {}, 'เข้าเล่นล่าสุด'),
            h('th', {}),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    ),
  );
}

interface Stats {
  questions: { id: string; unit: number; topic: string; question: string; asked: number; wrong: number; avgSeconds: number }[];
  units: { unit: number; title: string; asked: number; correct: number }[];
  topics: { unit: number; topic: string; asked: number; correct: number }[];
}

/** One-series horizontal bar chart: % correct, value at the bar tip, details on hover */
function barChart(items: { name: string; value: number | null; detail: string }[]): HTMLElement {
  const tip = h('div', { class: 'tooltip', hidden: true });
  const chart = h(
    'div',
    { class: 'bars', role: 'img', 'aria-label': items.map((i) => `${i.name} ${i.value === null ? 'ยังไม่มีข้อมูล' : `${Math.round(i.value)}%`}`).join(', ') },
    ...items.map((i) =>
      h(
        'div',
        {
          class: 'bar-row',
          onmousemove: (e: MouseEvent) => {
            tip.hidden = false;
            tip.textContent = `${i.name}: ${i.detail}`;
            tip.style.left = `${e.clientX + 14}px`;
            tip.style.top = `${e.clientY + 14}px`;
          },
          onmouseleave: () => (tip.hidden = true),
        },
        h('span', { class: 'name' }, i.name),
        h(
          'span',
          { class: 'bar-track' },
          i.value === null ? null : h('span', { class: 'bar-fill', style: `width:calc((100% - 70px) * ${i.value / 100})` }),
          h('span', { class: 'bar-value' }, i.value === null ? 'ยังไม่มีข้อมูล' : `${Math.round(i.value)}%`),
        ),
      ),
    ),
  );
  return h('div', {}, chart, tip);
}

async function statsTab(body: HTMLElement, c: ClassroomInfo) {
  const s = await api<Stats>('GET', `teacher/classrooms/${c.id}/stats`);
  const total = s.units.reduce((a, u) => a + u.asked, 0);
  if (total === 0) {
    body.replaceChildren(h('div', { class: 'card' }, h('p', {}, 'ยังไม่มีนักเรียนตอบคำถาม เมื่อนักเรียนเล่นเกมแล้วสถิติจะขึ้นที่นี่')));
    return;
  }
  const hardest = s.questions.filter((q) => q.asked >= 1).slice(0, 15);
  body.replaceChildren(
    h(
      'div',
      { class: 'card' },
      h('h2', {}, 'ตอบถูกกี่เปอร์เซ็นต์ แยกตามหน่วย'),
      barChart(
        s.units.map((u) => ({
          name: `หน่วย ${u.unit} ${u.title}`,
          value: u.asked ? (100 * u.correct) / u.asked : null,
          detail: u.asked ? `ถูก ${u.correct} จาก ${u.asked} ครั้ง` : 'ยังไม่มีคนตอบ',
        })),
      ),
    ),
    h(
      'div',
      { class: 'card table-wrap' },
      h('h2', {}, 'ข้อที่ผิดบ่อยที่สุด'),
      h('p', { class: 'muted small' }, 'เรียงจากสัดส่วนที่ตอบผิดมากที่สุด ใช้ทบทวนในห้องเรียนได้'),
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h('tr', {}, h('th', {}, 'ข้อ'), h('th', {}, 'คำถาม'), h('th', {}, 'หัวข้อ'), h('th', {}, 'ตอบผิด'), h('th', { class: 'num' }, 'เวลาเฉลี่ย')),
        ),
        h(
          'tbody',
          {},
          ...hardest.map((q) =>
            h(
              'tr',
              {},
              h('td', { class: 'small' }, q.id),
              h('td', {}, q.question),
              h('td', { class: 'small' }, `หน่วย ${q.unit} · ${q.topic}`),
              h('td', { style: 'white-space:nowrap' }, h('span', { class: 'mini' }, h('i', { style: `width:${(100 * q.wrong) / q.asked}%` })), `${q.wrong}/${q.asked} (${fmtPct(q.wrong, q.asked)})`),
              h('td', { class: 'num' }, `${q.avgSeconds} วิ`),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'card table-wrap' },
      h('h2', {}, 'แยกตามหัวข้อ'),
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'หน่วย'), h('th', {}, 'หัวข้อ'), h('th', { class: 'num' }, 'ตอบ (ครั้ง)'), h('th', {}, 'ตอบถูก'))),
        h(
          'tbody',
          {},
          ...s.topics.map((t) =>
            h(
              'tr',
              {},
              h('td', {}, t.unit),
              h('td', {}, t.topic),
              h('td', { class: 'num' }, t.asked),
              h('td', { style: 'white-space:nowrap' }, h('span', { class: 'mini' }, h('i', { style: `width:${(100 * t.correct) / t.asked}%` })), fmtPct(t.correct, t.asked)),
            ),
          ),
        ),
      ),
    ),
  );
}

async function settingsTab(body: HTMLElement, c: ClassroomInfo) {
  const { units } = await api<{ units: { unit: number; title: string }[] }>('GET', 'teacher/questions');
  const msg = h('p', { class: 'ok' });
  const name = h('input', { value: c.name });
  const worlds = units.map((u) => h('input', { type: 'checkbox', value: String(u.unit), checked: c.openWorlds.includes(u.unit) }));
  const pvp = h('input', { type: 'checkbox', checked: c.pvpOpen });
  const save = async (e: Event) => {
    e.preventDefault();
    await api('PATCH', `teacher/classrooms/${c.id}`, {
      name: name.value,
      openWorlds: worlds.filter((w) => w.checked).map((w) => Number(w.value)),
      pvpOpen: pvp.checked,
    });
    msg.textContent = 'บันทึกแล้ว';
  };
  const confirmCode = h('input', { placeholder: c.code });
  body.replaceChildren(
    h(
      'form',
      { class: 'card', onsubmit: save },
      h('h2', {}, 'ตั้งค่าห้องเรียน'),
      field('ชื่อห้อง', name),
      h('h3', { style: 'margin-top:16px' }, 'เปิดโลกตามบทเรียนที่สอนถึง'),
      h('p', { class: 'muted small' }, 'นักเรียนเล่นได้เฉพาะโลกที่เปิดไว้'),
      ...units.map((u, i) => h('label', { class: 'check' }, worlds[i], `โลก ${u.unit}: ${u.title}`)),
      h('h3', { style: 'margin-top:16px' }, 'เล่นกับเพื่อนออนไลน์'),
      h('label', { class: 'check' }, pvp, 'ให้เล่นกับห้องเรียนอื่นที่เปิดตัวเลือกนี้ด้วย (ปิด = เล่นได้เฉพาะในห้องนี้)'),
      h('p', {}, h('button', { type: 'submit' }, 'บันทึก')),
      msg,
    ),
    h(
      'div',
      { class: 'card' },
      h('h2', {}, 'ลบห้องเรียน'),
      h('p', { class: 'muted' }, 'ข้อมูลนักเรียน คะแนน และคำตอบทั้งหมดของห้องนี้จะหายไป กู้คืนไม่ได้'),
      h(
        'div',
        { class: 'row' },
        field(`พิมพ์รหัสห้อง ${c.code} เพื่อยืนยัน`, confirmCode),
        h(
          'button',
          {
            class: 'danger',
            onclick: async () => {
              if (confirmCode.value.trim().toUpperCase() !== c.code) return alert('รหัสห้องไม่ตรง');
              await api('DELETE', `teacher/classrooms/${c.id}`);
              location.hash = '#/classes';
            },
          },
          'ลบห้องเรียนนี้',
        ),
      ),
    ),
  );
}

async function renderPrint(id: string) {
  const { classroom: c, students } = await loadClassroom(id);
  page(
    `ใบ PIN ${c.name}`,
    h('p', { class: 'no-print' }, h('button', { onclick: () => window.print() }, 'พิมพ์'), ' ', h('a', { href: `#/class/${id}/students` }, 'กลับ')),
    h(
      'div',
      { class: 'pin-sheet' },
      ...students.map((s) =>
        h(
          'div',
          { class: 'pin-card' },
          h('div', { class: 'big' }, `SciBoom! · ${c.name}`),
          h('div', {}, `เข้าเกมที่ ${gameUrl()}`),
          h('div', {}, 'รหัสห้องเรียน ', h('b', { class: 'pin' }, c.code)),
          h('div', {}, 'เลขที่ ', h('b', { class: 'big' }, s.number), '  PIN ', h('b', { class: 'pin' }, s.pin)),
        ),
      ),
    ),
  );
}

// ---- Question bank ------------------------------------------------------------------------------

interface BankQuestion {
  id: string;
  unit: number;
  topic: string;
  difficulty: number;
  question: string;
  choices: string[];
  answer: number;
  explanation: string;
  reviewed: boolean;
  disabled: boolean;
}

const LETTERS = ['ก', 'ข', 'ค', 'ง'];
const bankFilter = { unit: '0', search: '', unreviewed: false };

async function renderQuestions() {
  page('คลังคำถาม', h('p', { class: 'muted' }, 'กำลังโหลด...'));
  const { units, questions } = await api<{ units: { unit: number; title: string }[]; questions: BankQuestion[] }>('GET', 'teacher/questions');
  const msg = h('p', { class: 'ok' });
  const list = h('tbody', {});
  const unitSel = h('select', {}, h('option', { value: '0' }, 'ทุกหน่วย'), ...units.map((u) => h('option', { value: String(u.unit), selected: bankFilter.unit === String(u.unit) }, `หน่วย ${u.unit} ${u.title}`)));
  unitSel.value = bankFilter.unit;
  const search = h('input', { placeholder: 'ค้นหาคำถาม', value: bankFilter.search });
  const unreviewed = h('input', { type: 'checkbox', checked: bankFilter.unreviewed });
  const counter = h('span', { class: 'muted small' });

  const draw = () => {
    bankFilter.unit = unitSel.value;
    bankFilter.search = search.value.trim();
    bankFilter.unreviewed = unreviewed.checked;
    const shown = questions.filter(
      (q) =>
        (bankFilter.unit === '0' || String(q.unit) === bankFilter.unit) &&
        (!bankFilter.unreviewed || !q.reviewed) &&
        (!bankFilter.search || q.question.includes(bankFilter.search) || q.topic.includes(bankFilter.search) || q.id.includes(bankFilter.search)),
    );
    counter.textContent = `แสดง ${shown.length} จาก ${questions.length} ข้อ · ตรวจแล้ว ${questions.filter((q) => q.reviewed).length} ข้อ`;
    list.replaceChildren(
      ...shown.map((q) => {
        const toggle = (key: 'reviewed' | 'disabled', label: string) =>
          h(
            'label',
            { class: 'check small' },
            h('input', {
              type: 'checkbox',
              checked: q[key],
              onchange: async (e: Event) => {
                q[key] = (e.target as HTMLInputElement).checked;
                await api('PUT', `teacher/questions/${encodeURIComponent(q.id)}`, q);
                msg.textContent = `บันทึก ${q.id} แล้ว`;
              },
            }),
            label,
          );
        return h(
          'tr',
          { style: q.disabled ? 'opacity:0.55' : '' },
          h('td', { class: 'small' }, q.id),
          h('td', {}, h('div', {}, q.question), h('div', { class: 'muted small' }, `ตอบ ${LETTERS[q.answer]}. ${q.choices[q.answer]} · ${q.topic} · ระดับ ${q.difficulty}`)),
          h('td', {}, toggle('reviewed', 'ตรวจแล้ว'), toggle('disabled', 'ปิดใช้')),
          h('td', {}, h('button', { class: 'secondary small', onclick: () => editQuestion(q, units) }, 'แก้ไข')),
        );
      }),
    );
  };
  unitSel.addEventListener('change', draw);
  search.addEventListener('input', draw);
  unreviewed.addEventListener('change', draw);

  const file = h('input', { type: 'file', accept: '.csv,text/csv' });
  const importErr = h('div', { class: 'error small' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    importErr.textContent = '';
    try {
      const r = await api<{ added: number; updated: number; errors: string[] }>('POST', 'teacher/questions/import', undefined, await f.text());
      alert(`เพิ่ม ${r.added} ข้อ แก้ไข ${r.updated} ข้อ${r.errors.length ? `\nมีปัญหา ${r.errors.length} แถว` : ''}`);
      if (r.errors.length) importErr.textContent = r.errors.slice(0, 10).join(' · ');
      else void route();
    } catch (x) {
      importErr.textContent = (x as Error).message;
    }
  });
  const exportCsv = async () => {
    const csv = await api<string>('GET', 'teacher/questions/export');
    const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'sciboom-questions.csv' });
    a.click();
  };

  page(
    'คลังคำถาม',
    h('p', { class: 'muted' }, 'คำถามที่ AI ร่างไว้ยังไม่ได้ตรวจ กรุณาอ่านแล้วติ๊ก "ตรวจแล้ว" ข้อไหนไม่เหมาะให้ติ๊ก "ปิดใช้" (เกมจะไม่ถามข้อนั้น) ทุกห้องเรียนใช้คลังเดียวกัน'),
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'row' },
        field('หน่วย', unitSel),
        field('ค้นหา', search),
        h('label', { class: 'check' }, unreviewed, 'เฉพาะที่ยังไม่ตรวจ'),
        h('button', { onclick: () => editQuestion(null, units) }, 'เพิ่มคำถาม'),
        h('button', { class: 'secondary', onclick: () => void exportCsv() }, 'ดาวน์โหลด CSV'),
        field('นำเข้า CSV', file),
      ),
      h('p', { class: 'muted small' }, 'ไฟล์ CSV ใช้คอลัมน์: id, unit, topic, difficulty, question, choice1–choice4, answer (1–4), explanation, reviewed (ดาวน์โหลดไปดูเป็นตัวอย่างได้ · id ว่าง = เพิ่มข้อใหม่)'),
      importErr,
      counter,
      msg,
    ),
    h('div', { class: 'card table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'ข้อ'), h('th', {}, 'คำถาม'), h('th', {}, 'สถานะ'), h('th', {}))), list)),
  );
  draw();
}

function editQuestion(q: BankQuestion | null, units: { unit: number; title: string }[]) {
  const err = h('p', { class: 'error' });
  const unit = h('select', {}, ...units.map((u) => h('option', { value: String(u.unit) }, `หน่วย ${u.unit} ${u.title}`)));
  unit.value = String(q?.unit ?? 1);
  const topic = h('input', { value: q?.topic ?? '' });
  const difficulty = h('select', {}, h('option', { value: '1' }, '1 ง่าย'), h('option', { value: '2' }, '2 กลาง'), h('option', { value: '3' }, '3 ยาก'));
  difficulty.value = String(q?.difficulty ?? 1);
  const question = h('textarea', {}, q?.question ?? '');
  const choices = [0, 1, 2, 3].map((i) => h('input', { value: q?.choices[i] ?? '' }));
  const answer = h('select', {}, ...LETTERS.map((l, i) => h('option', { value: String(i) }, `ข้อ ${l}`)));
  answer.value = String(q?.answer ?? 0);
  const explanation = h('textarea', {}, q?.explanation ?? '');
  const reviewed = h('input', { type: 'checkbox', checked: q?.reviewed ?? true });
  const dialog = h(
    'dialog',
    {},
    h(
      'form',
      {
        onsubmit: async (e: Event) => {
          e.preventDefault();
          const body = {
            unit: Number(unit.value),
            topic: topic.value,
            difficulty: Number(difficulty.value),
            question: question.value,
            choices: choices.map((c) => c.value),
            answer: Number(answer.value),
            explanation: explanation.value,
            reviewed: reviewed.checked,
            disabled: q?.disabled ?? false,
          };
          try {
            if (q) await api('PUT', `teacher/questions/${encodeURIComponent(q.id)}`, body);
            else await api('POST', 'teacher/questions', body);
            dialog.close();
            dialog.remove();
            void route();
          } catch (x) {
            err.textContent = (x as Error).message;
          }
        },
      },
      h('h2', {}, q ? `แก้ไขคำถาม ${q.id}` : 'เพิ่มคำถามใหม่'),
      h(
        'div',
        { class: 'form-grid' },
        field('หน่วย', unit),
        field('ความยาก', difficulty),
        field('หัวข้อ', topic, 'wide'),
        field('คำถาม', question, 'wide'),
        ...choices.map((c, i) => field(`ตัวเลือก ${LETTERS[i]}`, c)),
        field('คำตอบที่ถูก', answer),
        h('label', { class: 'check' }, reviewed, 'ตรวจแล้ว'),
        field('คำอธิบายเฉลย (แสดงเมื่อนักเรียนตอบผิด)', explanation, 'wide'),
      ),
      err,
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'submit' }, 'บันทึก'),
        h('button', { type: 'button', class: 'secondary', onclick: () => (dialog.close(), dialog.remove()) }, 'ยกเลิก'),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
}

// ---- Router ---------------------------------------------------------------------------------------

async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (!token) {
    renderLogin();
    return;
  }
  if (!me) {
    try {
      me = (await api<{ teacher: TeacherInfo }>('GET', 'teacher/me')).teacher;
    } catch {
      renderLogin();
      return;
    }
  }
  try {
    if (parts[0] === 'class' && parts[1]) await renderClassroom(parts[1], parts[2] ?? 'students');
    else if (parts[0] === 'print' && parts[1]) await renderPrint(parts[1]);
    else if (parts[0] === 'questions') await renderQuestions();
    else await renderClassrooms();
  } catch (e) {
    page('เกิดข้อผิดพลาด', h('p', { class: 'error' }, (e as Error).message), h('a', { href: '#/classes' }, 'กลับหน้าห้องเรียน'));
  }
}

window.addEventListener('hashchange', () => void route());
void route();
