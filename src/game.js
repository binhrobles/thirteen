import { GenerateStandardDeck, DealCards } from './cards';
import MakeMove from './moves/makeMove';
import Pass from './moves/pass';

export function setup(ctx) {
  return {
    lastPlay: null,
    playersInRound: [...ctx.playOrder],
    playersInGame: [...ctx.playOrder],
    winOrder: [],
    hands: DealCards(
      ctx.numPlayers,
      ctx.random.Shuffle(GenerateStandardDeck())
    ),
  };
}

// eslint-disable-next-line consistent-return
export function onBegin(G, ctx) {
  // if everyone (else other than the lastPlay.player) has passed, clear the board
  // lastPlayer.player may have gone `out`, so other condition would be playersInRound === 0
  if (
    (G.lastPlay &&
      G.lastPlay.player &&
      G.lastPlay.player === ctx.currentPlayer) ||
    G.playersInRound.length === 0
  ) {
    return {
      ...G,
      lastPlay: null,
      playersInRound: [...G.playersInGame],
    };
  }
}

// eslint-disable-next-line consistent-return
export function onEnd(G, ctx) {
  // if no more cards, this player is out
  if (G.hands[ctx.playOrderPos].length === 0) {
    const winOrder = [...G.winOrder];
    winOrder.push(ctx.playOrderPos);

    const playersInGame = [...G.playersInGame].filter(
      (x) => x !== ctx.currentPlayer
    );

    const playersInRound = [...G.playersInRound].filter(
      (x) => x !== ctx.currentPlayer
    );

    return {
      ...G,
      playersInGame,
      playersInRound,
      winOrder,
    };
  }
}

// eslint-disable-next-line consistent-return
export function endIf(G) {
  if (G.winOrder.length === 3) {
    return { winner: G.winOrder[0] };
  }
}

// Handles turn progression, but only cycles through `G.playersInRound`
export function next(G, ctx) {
  // if no players left in round, it means lastPlayer.player won with the play
  // and the nextPlayer should be person to left of lastPlay.player
  if (G.playersInRound.length === 0) {
    let nextPlayer = parseInt(G.lastPlay.player, 10);
    // go around the table looking for the next `in` player
    do {
      nextPlayer = (nextPlayer + 1) % ctx.numPlayers;
    } while (!G.playersInGame.includes(nextPlayer.toString()));

    return nextPlayer;
  }

  // otherwise, go around the table looking for the next `in` player
  let nextPlayer = ctx.playOrderPos;

  do {
    nextPlayer = (nextPlayer + 1) % ctx.numPlayers;

    // ensure player is in the round (hasn't passed or won)
  } while (!G.playersInRound.includes(nextPlayer.toString()));

  return nextPlayer;
}

const Game = {
  name: 'thirteen',
  setup,
  moves: { MakeMove, Pass },
  turn: {
    onBegin,
    onEnd,
    order: {
      first: () => 0, // TODO: should be the person with 3 of spades
      next,
    },
  },

  endIf,

  // phases: reorder -> play
};

export default Game;
