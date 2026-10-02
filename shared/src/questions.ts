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

/**
 * Deals questions without repeats until the pool runs out, then reshuffles.
 * A question answered wrongly comes back after a couple of other questions,
 * so students get a second chance to learn it.
 */
export class QuizDeck {
  private queue: Question[] = [];
  private retry: { q: Question; wait: number }[] = [];
  private readonly pool: Question[];

  constructor(
    questions: Question[],
    private readonly rng: Rng,
    maxDifficulty = 3,
    private readonly retryAfter = 2,
  ) {
    const fitting = questions.filter((q) => q.difficulty <= maxDifficulty);
    // Never end up with an empty deck because of the difficulty filter
    this.pool = fitting.length >= 4 ? fitting : [...questions];
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
        this.queue = shuffled(
          this.pool.filter((p) => !waiting.has(p.id)),
          this.rng,
        );
        if (this.queue.length === 0) this.queue = shuffled(this.pool, this.rng);
      }
      q = this.queue.pop()!;
    }
    const order = shuffled(
      q.choices.map((_, i) => i),
      this.rng,
    );
    return { question: q, choices: order.map((i) => q.choices[i]), correctIndex: order.indexOf(q.answer) };
  }

  /** Tell the deck how the student did, so wrong answers come back later */
  report(q: Question, correct: boolean) {
    if (!correct && !this.retry.some((r) => r.q.id === q.id)) this.retry.push({ q, wait: this.retryAfter + 1 });
  }
}
