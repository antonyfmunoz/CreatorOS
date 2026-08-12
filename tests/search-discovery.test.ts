import { describe, expect, it } from "vitest";
import { rankPostTopics } from "../server/search-discovery";

describe("search discovery topics", () => {
  it("counts a topic once per post and ranks real activity", () => {
    expect(
      rankPostTopics([
        "First #CreativesOS update #launch",
        "Second #creativesos update #CREATIVESOS",
        "No topic here",
      ]),
    ).toEqual([
      { topic: "creativesos", postCount: 2 },
      { topic: "launch", postCount: 1 },
    ]);
  });

  it("does not invent topics when posts have none", () => {
    expect(rankPostTopics(["plain text", "another post"])).toEqual([]);
  });
});
