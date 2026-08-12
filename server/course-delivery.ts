import type { CourseAssessmentQuestion } from "../shared/schema";

export type LearnerAssessmentQuestion = Omit<CourseAssessmentQuestion, "answerIndex">;

export function courseLessonUnlockAt(enrollmentStartsAt: Date, availableAfterDays: number): Date {
  return new Date(enrollmentStartsAt.getTime() + Math.max(0, availableAfterDays) * 86_400_000);
}

export function isCourseLessonUnlocked(enrollmentStartsAt: Date, availableAfterDays: number, now = new Date()): boolean {
  return courseLessonUnlockAt(enrollmentStartsAt, availableAfterDays).getTime() <= now.getTime();
}

export function learnerAssessmentQuestions(questions: CourseAssessmentQuestion[]): LearnerAssessmentQuestion[] {
  return questions.map(({ answerIndex: _answerIndex, ...question }) => question);
}

export function scoreCourseAssessment(questions: CourseAssessmentQuestion[], rawAnswers: Record<string, unknown>, passingScorePercent: number) {
  const answers: Record<string, number> = {};
  for (const question of questions) {
    const answer = rawAnswers[question.id];
    if (typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer < question.choices.length) answers[question.id] = answer;
  }
  const correct = questions.filter((question) => answers[question.id] === question.answerIndex).length;
  const scorePercent = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  return { answers, scorePercent, passed: scorePercent >= passingScorePercent };
}
