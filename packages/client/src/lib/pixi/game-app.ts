import { Application, Container, Text } from "pixi.js";
import type { GameState } from "@thirteen/game-logic";
import { Combo } from "@thirteen/game-logic";
import {
  createCardSprite,
  createCardBack,
  getCardWidth,
  getCardHeight,
  getOpponentCardWidth,
  getOpponentCardHeight,
} from "./card-sprite.js";

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
    const cardW = getCardWidth(screenH);
    const cardH = getCardHeight(screenH);
    const selectedLift = cardH * 0.2; // 20% of card height, matching Godot

    // Scale cards to fit if hand is large — 5% margin on each side like Godot
    const maxHandWidth = screenW * 0.9;
    const overlap = Math.min(
      cardW * 0.7,
      hand.length > 1
        ? (maxHandWidth - cardW) / (hand.length - 1)
        : cardW,
    );
    const totalWidth =
      hand.length > 0
        ? overlap * (hand.length - 1) + cardW
        : 0;
    const startX = (screenW - totalWidth) / 2;
    // Player hand at bottom — Godot places it around 82% of screen
    const baseY = screenH * 0.82;

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const sprite = createCardSprite(card);
      sprite.width = cardW;
      sprite.height = cardH;
      sprite.x = startX + i * overlap;
      sprite.y = selectedCards.has(card.value)
        ? baseY - selectedLift
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
    const cardW = getCardWidth(screenH);
    const cardH = getCardHeight(screenH);
    // Play area centered vertically between 25%-66% like Godot
    const centerY = screenH * 0.38;
    const labelFontSize = Math.round(screenH * 0.025); // 2.5% of viewport

    if (state.lastPlay) {
      const cards = state.lastPlay.cards;
      // Available width avoiding opponent areas (Godot: 11.5%-88.5%)
      const availableWidth = screenW * 0.77;
      const overlap = Math.min(
        cardW * 0.6,
        cards.length > 1
          ? (availableWidth - cardW) / (cards.length - 1)
          : cardW,
      );
      const totalWidth =
        cards.length > 0
          ? overlap * (cards.length - 1) + cardW
          : 0;
      const startX = (screenW - totalWidth) / 2;

      for (let i = 0; i < cards.length; i++) {
        const sprite = createCardSprite(cards[i]);
        sprite.width = cardW;
        sprite.height = cardH;
        sprite.x = startX + i * overlap;
        sprite.y = centerY;
        sprite.eventMode = "none";
        this.playAreaContainer.addChild(sprite);
      }

      // Combo label
      const label = new Text({
        text: Combo[state.lastPlay.combo],
        style: { fontSize: labelFontSize, fill: 0xffffff, fontFamily: "monospace" },
      });
      label.x = screenW / 2 - label.width / 2;
      label.y = centerY - labelFontSize * 1.5;
      this.playAreaContainer.addChild(label);
    } else {
      // Power indicator
      const powerFontSize = Math.round(screenH * 0.03);
      const text = new Text({
        text: "Power!",
        style: {
          fontSize: powerFontSize,
          fill: 0xffcc00,
          fontFamily: "monospace",
          fontWeight: "bold",
        },
      });
      text.x = screenW / 2 - text.width / 2;
      text.y = centerY + cardH / 2 - powerFontSize / 2;
      this.playAreaContainer.addChild(text);
    }
  }

  private renderOpponents(state: GameState, humanPlayer: number): void {
    for (const c of this.opponentContainers) c.removeChildren();

    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const opW = getOpponentCardWidth(screenH);
    const opH = getOpponentCardHeight(screenH);
    const fontSize = Math.round(screenH * 0.02); // 2% of viewport
    const labelGap = fontSize * 1.4;

    // Positions matching Godot anchors: left 25%-45%, top ~0%, right 25%-45%
    const positions = [
      { x: screenW * 0.05, y: screenH * 0.3, label: "left" },
      { x: screenW / 2, y: screenH * 0.02, label: "top" },
      { x: screenW * 0.95, y: screenH * 0.3, label: "right" },
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
          fontSize,
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
        const smallW = opW * 0.5;
        const smallH = opH * 0.5;
        const smallOverlap = smallW * 0.4;
        const maxShow = Math.min(cardCount, 8);

        for (let j = 0; j < maxShow; j++) {
          const back = createCardBack();
          back.width = smallW;
          back.height = smallH;

          if (pos.label === "left") {
            back.x = pos.x + j * smallOverlap;
            back.y = pos.y + labelGap;
          } else if (pos.label === "top") {
            const totalW = smallOverlap * (maxShow - 1) + smallW;
            back.x = pos.x - totalW / 2 + j * smallOverlap;
            back.y = pos.y + labelGap;
          } else {
            const totalW = smallOverlap * (maxShow - 1) + smallW;
            back.x = pos.x - totalW + j * smallOverlap;
            back.y = pos.y + labelGap;
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
