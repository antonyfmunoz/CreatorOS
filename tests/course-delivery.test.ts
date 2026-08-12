import { describe, expect, it } from "vitest";
import { courseLessonUnlockAt, isCourseLessonUnlocked, learnerAssessmentQuestions, scoreCourseAssessment } from "../server/course-delivery";

describe("course delivery rules", () => {
  const enrollment = new Date("2026-08-01T12:00:00.000Z");
  const questions = [
    { id: "one", prompt: "Pick one", choices: ["No", "Yes"], answerIndex: 1 },
    { id: "two", prompt: "Pick two", choices: ["A", "B"], answerIndex: 0 },
  ];

  it("holds a scheduled lesson until its exact enrollment-relative release time", () => {
    expect(courseLessonUnlockAt(enrollment, 3).toISOString()).toBe("2026-08-04T12:00:00.000Z");
    expect(isCourseLessonUnlocked(enrollment, 3, new Date("2026-08-04T11:59:59.999Z"))).toBe(false);
    expect(isCourseLessonUnlocked(enrollment, 3, new Date("2026-08-04T12:00:00.000Z"))).toBe(true);
  });

  it("never exposes answer keys to learners", () => {
    expect(learnerAssessmentQuestions(questions)).toEqual([
      { id: "one", prompt: "Pick one", choices: ["No", "Yes"] },
      { id: "two", prompt: "Pick two", choices: ["A", "B"] },
    ]);
  });

  it("scores valid answers and ignores out-of-range input", () => {
    expect(scoreCourseAssessment(questions, { one: 1, two: 9, injected: 0 }, 70)).toEqual({ answers: { one: 1 }, scorePercent: 50, passed: false });
    expect(scoreCourseAssessment(questions, { one: 1, two: 0 }, 70)).toEqual({ answers: { one: 1, two: 0 }, scorePercent: 100, passed: true });
  });
});
