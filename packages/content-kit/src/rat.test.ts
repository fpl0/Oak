import { expect, test } from "bun:test";
import { barOf, fromFraction, nearest, parseRat, R, rat } from "./rat.ts";

test("rat reduces and keeps the denominator positive", () => {
  expect(rat(2, 4)).toEqual([1, 2]);
  expect(rat(3, -6)).toEqual([-1, 2]);
  expect(rat(0, 5)).toEqual([0, 1]);
  expect(rat(7)).toEqual([7, 1]);
  expect(() => rat(1, 0)).toThrow(RangeError);
  expect(() => rat(0.5, 1)).toThrow(RangeError);
});

test("arithmetic is exact", () => {
  expect(R.add([1, 3], [1, 6])).toEqual([1, 2]);
  expect(R.sub([1, 4], [1, 3])).toEqual([-1, 12]);
  expect(R.mul([2, 3], [3, 4])).toEqual([1, 2]);
  expect(R.div([1, 2], [1, 8])).toEqual([4, 1]);
  // Ten thirds of a third: no float drift.
  let x = rat(0);
  for (let i = 0; i < 9; i++) x = R.add(x, [1, 9]);
  expect(x).toEqual([1, 1]);
  expect(R.eq([2, 4], [1, 2])).toBe(true);
  expect(R.cmp([1, 3], [1, 2])).toBeLessThan(0);
  expect(
    [
      [3, 4],
      [1, 8],
      [1, 2],
    ]
      .map((r) => r as [number, number])
      .sort(R.cmp),
  ).toEqual([
    [1, 8],
    [1, 2],
    [3, 4],
  ]);
});

test("floor, frac and bars: 1 cycle = 1 bar", () => {
  expect(R.floor([7, 2])).toBe(3);
  expect(R.frac([7, 2])).toEqual([1, 2]);
  expect(R.floor([-1, 4])).toBe(-1);
  expect(R.frac([-1, 4])).toEqual([3, 4]);
  expect(barOf([0, 1])).toBe(1);
  expect(barOf([7, 2])).toBe(4);
  expect(barOf([0, 1], true)).toBe(0);
  expect(barOf([1, 1], true)).toBe(1);
});

test("the swingBy(1/3, 4) onsets of contracts §0.26 add up", () => {
  // Off-beat sits at (1 + x) / 2 of its slot: with x = 1/3 that is 2/3 of the beat.
  const beat = rat(1, 4);
  const off = R.mul(beat, R.div(R.add(rat(1), rat(1, 3)), rat(2)));
  expect(off).toEqual([1, 6]);
  expect(R.add(beat, off)).toEqual([5, 12]);
  expect(R.add(off, rat(1, 8))).toEqual([7, 24]);
});

test("string and fraction.js forms", () => {
  expect(parseRat("1/3")).toEqual([1, 3]);
  expect(parseRat("-5/4")).toEqual([-5, 4]);
  expect(parseRat("2")).toEqual([2, 1]);
  expect(() => parseRat("0.5")).toThrow(RangeError);
  expect(R.str([7, 8])).toBe("7/8");
  expect(R.str([2, 1])).toBe("2");
  expect(fromFraction({ s: 1n, n: 25n, d: 24n })).toEqual([25, 24]);
  expect(fromFraction({ s: -1n, n: 1n, d: 4n })).toEqual([-1, 4]);
  expect(fromFraction({ n: 2, d: 4 })).toEqual([1, 2]);
  expect(nearest(0.3334, 12)).toEqual([1, 3]);
  expect(
    R.lcd([
      [1, 4],
      [1, 6],
      [2, 3],
    ]),
  ).toBe(12);
});
