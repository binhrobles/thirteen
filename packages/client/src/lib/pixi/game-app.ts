import { Application, Container, Text, Graphics } from "pixi.js";
import { Combo } from "@thirteen/game-logic";
import type { GameStateView } from "../stores/types.js";
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
  playerHandScrollArea: Container; // Inner container that moves for scrolling
  playAreaContainer: Container;
  opponentContainers: Container[];
  private cardClickHandler: ((cardValue: number) => void) | null = null;
  private playAreaClickHandler: (() => void) | null = null;

  // Scrolling state
  private scrollX = 0;
  private isDragging = false;
  private dragStartX = 0;
  private scrollStartX = 0;
  private maxScrollX = 0;
  private handAreaWidth = 0;
  private totalHandWidth = 0;
  private handMask: Graphics | null = null;
  private dragDistance = 0;
  private static readonly DRAG_THRESHOLD = 10; // pixels before considering it a drag

  // Momentum scrolling
  private velocityX = 0;
  private lastPointerX = 0;
  private lastPointerTime = 0;
  private momentumAnimation: number | null = null;
  private static readonly MOMENTUM_FRICTION = 0.95; // Higher = less friction (0-1)
  private static readonly MIN_VELOCITY = 0.1; // Stop animation below this velocity

  /** Detect if we're likely on a mobile device */
  private isMobile(): boolean {
    // Check for touch capability and small screen
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const smallScreen = window.innerWidth < 768;
    return hasTouch && smallScreen;
  }

  constructor(app: Application) {
    this.app = app;

    this.playerHandContainer = new Container();
    this.playerHandScrollArea = new Container();
    this.playerHandContainer.addChild(this.playerHandScrollArea);
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

    this.setupScrollHandling();
  }

  private setupScrollHandling(): void {
    // Make stage interactive for scroll handling
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on("pointerdown", (e) => {
      const screenH = this.app.screen.height;
      const handY = screenH * 0.82;
      // Only start drag if in hand area
      if (e.global.y >= handY - getCardHeight(screenH) * 0.2) {
        this.isDragging = true;
        this.dragStartX = e.global.x;
        this.scrollStartX = this.scrollX;
        this.dragDistance = 0;

        // Stop any ongoing momentum
        this.stopMomentum();
        this.velocityX = 0;
        this.lastPointerX = e.global.x;
        this.lastPointerTime = Date.now();
      }
    });

    this.app.stage.on("pointermove", (e) => {
      if (!this.isDragging) return;

      const now = Date.now();
      const dt = now - this.lastPointerTime;

      if (dt > 0) {
        // Calculate velocity (pixels per ms)
        const velocityDx = (e.global.x - this.lastPointerX) / dt;
        // Smooth velocity with exponential moving average
        this.velocityX = this.velocityX * 0.5 + velocityDx * 0.5;
      }

      this.lastPointerX = e.global.x;
      this.lastPointerTime = now;

      const dx = e.global.x - this.dragStartX;
      this.dragDistance = Math.abs(dx);
      this.scrollX = Math.max(
        -this.maxScrollX,
        Math.min(0, this.scrollStartX + dx),
      );
      this.playerHandScrollArea.x = this.scrollX;
    });

    this.app.stage.on("pointerup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.startMomentum();
      }
    });

    this.app.stage.on("pointerupoutside", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.startMomentum();
      }
    });

    // Mouse wheel / trackpad scrolling
    this.app.canvas.addEventListener("wheel", (e) => {
      const screenH = this.app.screen.height;
      const handY = screenH * 0.82;
      const canvasRect = this.app.canvas.getBoundingClientRect();
      const mouseY = e.clientY - canvasRect.top;

      // Only scroll if mouse is in hand area
      if (mouseY >= handY - getCardHeight(screenH) * 0.2) {
        e.preventDefault();
        // Use deltaX for horizontal scroll, fall back to deltaY for vertical scroll wheels
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        this.scrollX = Math.max(
          -this.maxScrollX,
          Math.min(0, this.scrollX - delta),
        );
        this.playerHandScrollArea.x = this.scrollX;
      }
    }, { passive: false });
  }

  /** Check if the last interaction was a drag (vs a tap) */
  private wasDrag(): boolean {
    return this.dragDistance > GameApp.DRAG_THRESHOLD;
  }

  private stopMomentum(): void {
    if (this.momentumAnimation !== null) {
      cancelAnimationFrame(this.momentumAnimation);
      this.momentumAnimation = null;
    }
  }

  private startMomentum(): void {
    // Only apply momentum if there's significant velocity
    if (Math.abs(this.velocityX) < GameApp.MIN_VELOCITY) {
      return;
    }

    // Convert velocity from px/ms to px/frame (assuming 60fps)
    this.velocityX *= 16.67; // ~1000ms/60fps

    const applyMomentumFrame = () => {
      // Apply velocity to scroll position
      this.scrollX = Math.max(
        -this.maxScrollX,
        Math.min(0, this.scrollX + this.velocityX),
      );
      this.playerHandScrollArea.x = this.scrollX;

      // Apply friction
      this.velocityX *= GameApp.MOMENTUM_FRICTION;

      // Check for bounce at edges
      if (this.scrollX <= -this.maxScrollX || this.scrollX >= 0) {
        // At edge, dampen velocity more aggressively
        this.velocityX *= 0.5;
      }

      // Continue animation if velocity is still significant
      if (Math.abs(this.velocityX) > GameApp.MIN_VELOCITY) {
        this.momentumAnimation = requestAnimationFrame(applyMomentumFrame);
      } else {
        this.momentumAnimation = null;
      }
    };

    this.momentumAnimation = requestAnimationFrame(applyMomentumFrame);
  }

  onCardClick(handler: (cardValue: number) => void): void {
    this.cardClickHandler = handler;
  }

  onPlayAreaClick(handler: () => void): void {
    this.playAreaClickHandler = handler;
  }

  updateFromState(
    state: GameStateView,
    selectedCards: Set<number>,
    humanPlayer: number,
  ): void {
    this.renderPlayerHand(state, selectedCards, humanPlayer);
    this.renderPlayArea(state, humanPlayer);
    this.renderOpponents(state, humanPlayer);
  }

  private renderPlayerHand(
    state: GameStateView,
    selectedCards: Set<number>,
    humanPlayer: number,
  ): void {
    const hasPassed = !state.playersInRound[humanPlayer];

    // Clear scroll area but keep it in the container
    this.playerHandScrollArea.removeChildren();

    const hand = state.getHand(humanPlayer);
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const cardW = getCardWidth(screenH);
    const cardH = getCardHeight(screenH);
    const selectedLift = cardH * 0.2; // 20% of card height
    const sidePadding = screenW * 0.05; // 5% padding on sides

    // Player hand at bottom
    const baseY = screenH * 0.82;

    let cardSpacing: number;
    let startX: number;

    if (this.isMobile()) {
      // Mobile: No overlap, full cards with margin, scrollable carousel
      const cardMargin = cardW * 0.05;
      cardSpacing = cardW + cardMargin;
      this.totalHandWidth =
        hand.length > 0 ? sidePadding * 2 + hand.length * cardW + (hand.length - 1) * cardMargin : 0;
      this.handAreaWidth = screenW;
      this.maxScrollX = Math.max(0, this.totalHandWidth - this.handAreaWidth);
      this.scrollX = Math.max(-this.maxScrollX, Math.min(0, this.scrollX));
      this.playerHandScrollArea.x = this.scrollX;
      startX = sidePadding;

      // Create or update mask for clipping
      if (this.handMask) {
        this.handMask.clear();
      } else {
        this.handMask = new Graphics();
        this.playerHandContainer.addChild(this.handMask);
      }
      this.handMask.rect(0, baseY - selectedLift - 5, screenW, cardH + selectedLift + 10);
      this.handMask.fill(0xffffff);
      this.playerHandContainer.mask = this.handMask;
    } else {
      // Desktop: Overlap cards to fit on screen, centered
      const maxHandWidth = screenW * 0.9;
      const overlap = Math.min(
        cardW * 0.7,
        hand.length > 1 ? (maxHandWidth - cardW) / (hand.length - 1) : cardW,
      );
      cardSpacing = overlap;
      const totalWidth = hand.length > 0 ? overlap * (hand.length - 1) + cardW : 0;
      startX = (screenW - totalWidth) / 2;

      // No scrolling needed on desktop
      this.maxScrollX = 0;
      this.scrollX = 0;
      this.playerHandScrollArea.x = 0;

      // Remove mask on desktop
      this.playerHandContainer.mask = null;
      if (this.handMask) {
        this.handMask.clear();
      }
    }

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const sprite = createCardSprite(card);
      sprite.width = cardW;
      sprite.height = cardH;

      if (hasPassed) {
        sprite.tint = 0x808080;
      }

      sprite.x = startX + i * cardSpacing;
      sprite.y = selectedCards.has(card.value) ? baseY - selectedLift : baseY;
      sprite.zIndex = i;

      // Only trigger click if it wasn't a drag
      sprite.on("pointerup", () => {
        if (!this.wasDrag()) {
          this.cardClickHandler?.(card.value);
        }
      });

      this.playerHandScrollArea.addChild(sprite);
    }

    this.playerHandScrollArea.sortableChildren = true;
  }

  private renderPlayArea(state: GameStateView, humanPlayer: number): void {
    this.playAreaContainer.removeChildren();

    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const cardW = getCardWidth(screenH);
    const cardH = getCardHeight(screenH);
    // Play area centered vertically
    const centerY = screenH * 0.3;
    const labelFontSize = Math.round(screenH * 0.025); // 2.5% of viewport

    const playerIsActive =
      state.currentPlayer === humanPlayer &&
      !state.isGameOver();

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
        sprite.eventMode = "static";
        sprite.cursor = "pointer";
        sprite.on("pointerup", () => {
          this.playAreaClickHandler?.();
        });
        this.playAreaContainer.addChild(sprite);
      }
    }
  }

  private renderOpponents(state: GameStateView, humanPlayer: number): void {
    for (const c of this.opponentContainers) c.removeChildren();

    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const opponentCardWidth = getOpponentCardWidth(screenH);
    const opponentCardHeight = getOpponentCardHeight(screenH);
    const fontSize = Math.round(screenH * 0.02); // 2% of viewport

    // Positions matching Godot anchors: left 25%-45%, top ~0%, right 25%-45%
    const positions = [
      { x: 0, y: screenH * 0.3, label: "left" },
      { x: screenW / 2, y: 0, label: "top" },
      { x: screenW, y: screenH * 0.3, label: "right" },
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
      // const hasWon = !state.playersInGame[playerId];

      let overlap;
      if (cardCount > 6) {
        overlap = opponentCardWidth * 0.2;
      } else {
        overlap = opponentCardWidth * 0.4;
      };

      // Show small card backs for card count
      for (let j = 0; j < cardCount; j++) {
        const back = createCardBack();
        back.width = opponentCardWidth;
        back.height = opponentCardHeight;
        back.anchor.set(0.5);

        if (hasPassed) {
          back.tint = 0x808080;
        }

        if (pos.label === "left") {
          back.x = pos.x;
          back.y = pos.y + j * overlap;
          back.rotation = Math.PI / 2;
        } else if (pos.label === "top") {
          const totalW = opponentCardWidth + overlap * (cardCount - 1);
          back.x = pos.x - totalW / 2 + j * overlap + opponentCardWidth / 2;
          back.y = pos.y;
        } else {
          back.x = pos.x;
          back.y = pos.y + j * overlap;
          back.rotation = -Math.PI / 2;
        }

        container.addChild(back);
      }
    }
  }

  destroy(): void {
    this.stopMomentum();
    this.app.destroy(true);
  }
}
