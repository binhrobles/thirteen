import { Sprite, Assets, type Texture } from "pixi.js";
import { Card, Rank, Suit } from "@thirteen/game-logic";

const SUIT_NAMES: Record<Suit, string> = {
  [Suit.SPADES]: "spades",
  [Suit.CLUBS]: "clubs",
  [Suit.DIAMONDS]: "diamonds",
  [Suit.HEARTS]: "hearts",
};

const RANK_NAMES: Record<Rank, string> = {
  [Rank.THREE]: "03",
  [Rank.FOUR]: "04",
  [Rank.FIVE]: "05",
  [Rank.SIX]: "06",
  [Rank.SEVEN]: "07",
  [Rank.EIGHT]: "08",
  [Rank.NINE]: "09",
  [Rank.TEN]: "10",
  [Rank.JACK]: "J",
  [Rank.QUEEN]: "Q",
  [Rank.KING]: "K",
  [Rank.ACE]: "A",
  [Rank.TWO]: "02",
};

export function getCardTexturePath(card: Card): string {
  return `sprites/cards/card_${SUIT_NAMES[card.suit]}_${RANK_NAMES[card.rank]}.png`;
}

export function getCardBackPath(): string {
  return "sprites/cards/card_back.png";
}

/** Preload all 52 card textures + back */
export async function preloadCardTextures(): Promise<void> {
  const paths: string[] = [getCardBackPath()];
  for (let r = Rank.THREE; r <= Rank.TWO; r++) {
    for (let s = Suit.SPADES; s <= Suit.HEARTS; s++) {
      paths.push(getCardTexturePath(new Card(r, s)));
    }
  }
  await Assets.load(paths);
}

/** Card dimensions — 2:3 aspect ratio */
export const CARD_WIDTH = 80;
export const CARD_HEIGHT = 120;

export function createCardSprite(card: Card): Sprite {
  const path = getCardTexturePath(card);
  const texture = Assets.get<Texture>(path);
  const sprite = new Sprite(texture);
  sprite.width = CARD_WIDTH;
  sprite.height = CARD_HEIGHT;
  sprite.eventMode = "static";
  sprite.cursor = "pointer";
  return sprite;
}

export function createCardBack(): Sprite {
  const texture = Assets.get<Texture>(getCardBackPath());
  const sprite = new Sprite(texture);
  sprite.width = CARD_WIDTH;
  sprite.height = CARD_HEIGHT;
  return sprite;
}
