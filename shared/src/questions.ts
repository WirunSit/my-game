import type { Rng } from './rng';

/** One question as stored in content/questions/*.json */
export interface Question {
  id: string;
  topic: string;
  difficulty: number;
  question: string;
  choices: string[];
  /** Index of the correct choice in `choices` */
  answer: number;
  explanation: string;
  reviewed?: boolean;
}

export interface QuestionUnit {
  unit: number;
  title: string;
  questions: Question[];
}

/** A question ready to show: choices shuffled, correct position recalculated */
export interface QuizItem {
  question: Question;
  choices: string[];
  correctIndex: number;
}

/** Shuffle a copy of an array (Fisher–Yates) */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface QuizDeckOptions {
  /** A wrongly answered question comes back after this many others */
  retryAfter?: number;
  /**
   * When the student last saw each question (id -> time), from their answer
   * history: questions never seen come first, then the ones seen longest ago,
   * so they don't meet the same questions match after match.
   */
  lastSeen?: ReadonlyMap<string, number>;
}

/**
 * Deals questions without repeats until the pool runs out, then reshuffles.
 * A question answered wrongly comes back after a couple of other questions,
 * so students get a second chance to learn it.
 */
export class QuizDeck {
  private queue: Question[] = [];
  private retry: { q: Question; wait: number }[] = [];
  private readonly pool: Question[];
  private readonly retryAfter: number;
  private readonly lastSeen: Map<string, number>;

  constructor(
    questions: Question[],
    private readonly rng: Rng,
    maxDifficulty = 3,
    opts: QuizDeckOptions = {},
  ) {
    const fitting = questions.filter((q) => q.difficulty <= maxDifficulty);
    // Never end up with an empty deck because of the difficulty filter
    this.pool = fitting.length >= 4 ? fitting : [...questions];
    this.retryAfter = opts.retryAfter ?? 2;
    this.lastSeen = new Map(opts.lastSeen);
  }

  get size(): number {
    return this.pool.length;
  }

  next(): QuizItem {
    for (const r of this.retry) r.wait--;
    const due = this.retry.findIndex((r) => r.wait <= 0);
    let q: Question;
    if (due >= 0) {
      q = this.retry.splice(due, 1)[0].q;
    } else {
      if (this.queue.length === 0) {
        const waiting = new Set(this.retry.map((r) => r.q.id));
        this.queue = this.freshestLast(this.pool.filter((p) => !waiting.has(p.id)));
        if (this.queue.length === 0) this.queue = this.freshestLast(this.pool);
      }
      q = this.queue.pop()!;
    }
    this.lastSeen.set(q.id, Date.now());
    const order = shuffled(
      q.choices.map((_, i) => i),
      this.rng,
    );
    return { question: q, choices: order.map((i) => q.choices[i]), correctIndex: order.indexOf(q.answer) };
  }

  /**
   * Shuffle, then order by when each question was last seen (most recent first),
   * so pop() deals never-seen questions first and the longest-ago ones next
   */
  private freshestLast(list: Question[]): Question[] {
    const seen = (q: Question) => this.lastSeen.get(q.id) ?? 0;
    return shuffled(list, this.rng).sort((a, b) => seen(b) - seen(a));
  }

  /** Tell the deck how the student did, so wrong answers come back later */
  report(q: Question, correct: boolean) {
    if (!correct && !this.retry.some((r) => r.q.id === q.id)) this.retry.push({ q, wait: this.retryAfter + 1 });
  }
}
