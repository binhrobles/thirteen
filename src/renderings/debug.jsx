import React from 'react';
import PropTypes from 'prop-types';
import { Row } from 'antd';
import 'antd/dist/antd.css';
import Card from '../Card';
import Play from '../Play';
import PlayerView from '../Components/playerView';
import History from '../Components/history';

function Debug(props) {
  const { G, ctx, playerID, isActive, moves } = props;

  return (
    <>
      <Row
        align="center"
        style={{
          minHeight: '50vh',
        }}
      >
        <History log={G.log} />
      </Row>
      {playerID && (
        <PlayerView
          cards={G.hands[playerID]}
          currentPlayer={ctx.currentPlayer}
          isActive={isActive}
          moves={moves}
        />
      )}
    </>
  );
}

Debug.propTypes = {
  G: PropTypes.shape({
    hands: PropTypes.arrayOf(PropTypes.arrayOf(Card)),
    log: PropTypes.arrayOf(Play),
    lastPlay: PropTypes.instanceOf(Card),
  }).isRequired,
  ctx: PropTypes.shape({
    numPlayers: PropTypes.number,
    currentPlayer: PropTypes.string,
  }).isRequired,
  moves: PropTypes.shape({
    Pass: PropTypes.func,
    MakeMove: PropTypes.func,
  }).isRequired,
  playerID: PropTypes.string.isRequired,
  isActive: PropTypes.bool.isRequired,
};

export default Debug;
