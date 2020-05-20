import Card from './index';
import { RANK, SUIT } from './constants';

it('should correctly compare various single cards', () => {
  expect(
    Card.ValueOf(new Card(RANK.TWO, SUIT.H)) >
      Card.ValueOf(new Card(RANK.TWO, SUIT.D))
  ).toBeTruthy();
  expect(
    Card.ValueOf(new Card(RANK.ACE, SUIT.H)) >
      Card.ValueOf(new Card(RANK.TWO, SUIT.S))
  ).toBeFalsy();

  expect(
    Card.ValueOf(new Card(RANK.THREE, SUIT.S)) <
      Card.ValueOf(new Card(RANK.THREE, SUIT.C))
  ).toBeTruthy();
  expect(
    Card.ValueOf(new Card(RANK.EIGHT, SUIT.D)) <
      Card.ValueOf(new Card(RANK.NINE, SUIT.D))
  ).toBeTruthy();
  expect(
    Card.ValueOf(new Card(RANK.KING, SUIT.C)) <
      Card.ValueOf(new Card(RANK.TEN, SUIT.S))
  ).toBeFalsy();
});

it('should evaluate cards to numeric values', () => {
  expect(Card.ValueOf(new Card(RANK.THREE, SUIT.S)).valueOf()).toBe(0);
  expect(Card.ValueOf(new Card(RANK.THREE, SUIT.C)).valueOf()).toBe(1);
  expect(Card.ValueOf(new Card(RANK.TWO, SUIT.D)).valueOf()).toBe(50);
  expect(Card.ValueOf(new Card(RANK.TWO, SUIT.H)).valueOf()).toBe(51);
});