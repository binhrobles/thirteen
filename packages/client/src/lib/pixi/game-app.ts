import { Application, Container, Text } from "pixi.js";
import type { GameState } from "@thirteen/game-logic";
import { Combo } from "@thirteen/game-logic";
import {
  createCardSprite,
  createCardBack,
  CARD_WIDTH,
  CARD_HEIGHT,
} from "./card-sprite.js";

const SELECTED_LIFT = 20;

export class GameApp {
  app: Application;
  /** Containers */
  playerHandContainer: Container;
  playAreaContainer: Container;
  opponentContainers: Container[];
  private cardClickHandler: ((cardValue: number) => void) | null = null;

  constructor(app: Application) {
    this.app = app;

    this.playerHandContainer = new Container();
    this.playAreaContainer = new Container();
    this.opponentContainers = [
      new Container(), // player 1 (left)
      new Container(), // player 2 (top)
      new Container(), // player 3 (right)
    ];

    app.stage.addChild(this.playAreaContainer);
    app.stage.addChild(this.playerHandContainer);
    for (const c of this.opponentContainers) {
      app.stage.addChild(c);
    }
  }

  onCardClick(handler: (cardValue: number) => void): void {
    this.cardClickHandler = handler;
  }

  updateFromState(
    state: GameState,
    selectedCards: Set<number>,
    humanPlayer: number,
  ): void {
    this.renderPlayerHand(state, selectedCards, humanPlayer);
    this.renderPlayArea(state);
    this.renderOpponents(state, humanPlayer);
  }

  private renderPlayerHand(
    state: GameState,
    selectedCards: Set<number>,
    humanPlayer: number,
  ): void {
    this.playerHandContainer.removeChildren();

    const hand = state.getHand(humanPlayer);
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;

    // Scale cards to fit if hand is large
    const maxHandWidth = screenW - 20;
    const overlap = Math.min(
      CARD_WIDTH * 0.7,
      hand.length > 1
        ? (maxHandWidth - CARD_WIDTH) / (hand.length - 1)
        : CARD_WIDTH,
    );
    const totalWidth =
      hand.length > 0
        ? overlap * (hand.length - 1) + CARD_WIDTH
        : 0;
    const startX = (screenW - totalWidth) / 2;
    const baseY = screenH - CARD_HEIGHT - 70; // leave room for buttons

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const sprite = createCardSprite(card);
      sprite.x = startX + i * overlap;
      sprite.y = selectedCards.has(card.value)
        ? baseY - SELECTED_LIFT
        : baseY;
      sprite.zIndex = i;

      sprite.on("pointerdown", () => {
        this.cardClickHandler?.(card.value);
      });

      this.playerHandContainer.addChild(sprite);
    }

    this.playerHandContainer.sortableChildren = true;
  }

  private renderPlayArea(state: GameState): void {
    this.playAreaContainer.removeChildren();

    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const centerY = screenH * 0.35;

    if (state.lastPlay) {
      const cards = state.lastPlay.cards;
      const overlap = Math.min(CARD_WIDTH * 0.6, CARD_WIDTH);
      const totalWidth =
        cards.length > 0
          ? overlap * (cards.length - 1) + CARD_WIDTH
          : 0;
      const startX = (screenW - totalWidth) / 2;

      for (let i = 0; i < cards.length; i++) {
        const sprite = createCardSprite(cards[i]);
        sprite.x = startX + i * overlap;
        sprite.y = centerY;
        sprite.eventMode = "none";
        this.playAreaContainer.addChild(sprite);
      }

      // Combo label
      const label = new Text({
        text: Combo[state.lastPlay.combo],
        style: { fontSize: 16, fill: 0xffffff, fontFamily: "monospace" },
      });
      label.x = screenW / 2 - label.width / 2;
      label.y = centerY - 25;
      this.playAreaContainer.addChild(label);
    } else {
      // Power indicator
      const text = new Text({
        text: "Power!",
        style: {
          fontSize: 24,
          fill: 0xffcc00,
          fontFamily: "monospace",
          fontWeight: "bold",
        },
      });
      text.x = screenW / 2 - text.width / 2;
      text.y = centerY + CARD_HEIGHT / 2 - 12;
      this.playAreaContainer.addChild(text);
    }
  }

  private renderOpponents(state: GameState, humanPlayer: number): void {
    for (const c of this.opponentContainers) c.removeChildren();

    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;

    // Opponents: seats 1, 2, 3 relative to human (0)
    const positions = [
      { x: 15, y: screenH * 0.35, label: "left" },
      { x: screenW / 2, y: 15, label: "top" },
      { x: screenW - 15, y: screenH * 0.35, label: "right" },
    ];

    for (let i = 0; i < 3; i++) {
      const playerId = (humanPlayer + 1 + i) % 4;
      const pos = positions[i];
      const container = this.opponentContainers[i];
      const cardCount = state.getHand(playerId).length;
      const isActive =
        state.currentPlayer === playerId &&
        !state.isGameOver();
      const hasPassed = !state.playersInRound[playerId];
      const hasWon = !state.playersInGame[playerId];

      let statusText = `P${playerId + 1}: ${cardCount} cards`;
      if (hasWon) statusText = `P${playerId + 1}: Won!`;
      else if (hasPassed) statusText = `P${playerId + 1}: Passed`;

      const text = new Text({
        text: statusText,
        style: {
          fontSize: 14,
          fill: isActive ? 0xffcc00 : hasWon ? 0x44ff44 : hasPassed ? 0x888888 : 0xffffff,
          fontFamily: "monospace",
          fontWeight: isActive ? "bold" : "normal",
        },
      });

      if (pos.label === "left") {
        text.x = pos.x;
        text.y = pos.y;
      } else if (pos.label === "top") {
        text.x = pos.x - text.width / 2;
        text.y = pos.y;
      } else {
        text.x = pos.x - text.width;
        text.y = pos.y;
      }

      container.addChild(text);

      // Show small card backs for card count
      if (!hasWon) {
        const backScale = 0.3;
        const smallW = CARD_WIDTH * backScale;
        const smallOverlap = smallW * 0.4;
        const maxShow = Math.min(cardCount, 8);

        for (let j = 0; j < maxShow; j++) {
          const back = createCardBack();
          back.width = smallW;
          back.height = CARD_HEIGHT * backScale;

          if (pos.label === "left") {
            back.x = pos.x + j * smallOverlap;
            back.y = pos.y + 22;
          } else if (pos.label === "top") {
            const totalW = smallOverlap * (maxShow - 1) + smallW;
            back.x = pos.x - totalW / 2 + j * smallOverlap;
            back.y = pos.y + 22;
          } else {
            const totalW = smallOverlap * (maxShow - 1) + smallW;
            back.x = pos.x - totalW + j * smallOverlap;
            back.y = pos.y + 22;
          }

          container.addChild(back);
        }
      }
    }
  }

  destroy(): void {
    this.app.destroy(true);
  }
}
