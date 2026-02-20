import { describe, it, expect } from "vitest";
import { Card, Rank, Suit } from "../src/card.js";

describe("Card", () => {
  it("computes value as rank * 4 + suit", () => {
    const threeSpades = new Card(Rank.THREE, Suit.SPADES);
    expect(threeSpades.value).toBe(0);

    const twoHearts = new Card(Rank.TWO, Suit.HEARTS);
    expect(twoHearts.value).toBe(51);

    const fiveClubs = new Card(Rank.FIVE, Suit.CLUBS);
    expect(fiveClubs.value).toBe(2 * 4 + 1); // 9
  });

  it("has 52 unique values across all rank/suit combinations", () => {
    const values = new Set<number>();
    for (let r = Rank.THREE; r <= Rank.TWO; r++) {
      for (let s = Suit.SPADES; s <= Suit.HEARTS; s++) {
        values.add(new Card(r, s).value);
      }
    }
    expect(values.size).toBe(52);
  });

  it("toString returns label + symbol", () => {
    expect(new Card(Rank.THREE, Suit.SPADES).toString()).toBe("3♠");
    expect(new Card(Rank.ACE, Suit.HEARTS).toString()).toBe("A♥");
    expect(new Card(Rank.TEN, Suit.DIAMONDS).toString()).toBe("10♦");
    expect(new Card(Rank.TWO, Suit.CLUBS).toString()).toBe("2♣");
  });

  it("compare sorts ascending", () => {
    const cards = [
      new Card(Rank.ACE, Suit.HEARTS),
      new Card(Rank.THREE, Suit.SPADES),
      new Card(Rank.SEVEN, Suit.CLUBS),
    ];
    cards.sort(Card.compare);
    expect(cards[0].rank).toBe(Rank.THREE);
    expect(cards[1].rank).toBe(Rank.SEVEN);
    expect(cards[2].rank).toBe(Rank.ACE);
  });

  it("fromValue round-trips correctly", () => {
    for (let v = 0; v < 52; v++) {
      const card = Card.fromValue(v);
      expect(card.value).toBe(v);
    }
  });

  it("suit ordering: spades < clubs < diamonds < hearts", () => {
    const threeS = new Card(Rank.THREE, Suit.SPADES);
    const threeC = new Card(Rank.THREE, Suit.CLUBS);
    const threeD = new Card(Rank.THREE, Suit.DIAMONDS);
    const threeH = new Card(Rank.THREE, Suit.HEARTS);
    expect(threeS.value).toBeLessThan(threeC.value);
    expect(threeC.value).toBeLessThan(threeD.value);
    expect(threeD.value).toBeLessThan(threeH.value);
  });
});
