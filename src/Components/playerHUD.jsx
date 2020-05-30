import React from 'react';
import PropTypes from 'prop-types';
import { List } from 'antd';
import Card from '../Card';
import Avatar from './avatar';

function PlayerHUD(props) {
  const { cards, currentPlayer, playersIn, playerNames } = props;

  const renderPlayerStatus = (playerID) => {
    let base = 10;
    let max = 70;
    let opacity = 1.0;

    // emphasize the person who's turn it is
    if (playerID.toString() === currentPlayer) {
      base = Math.floor(base * 1.4);
      max = Math.floor(max * 1.4);
    }

    // dim those who passed this round
    if (!playersIn.includes(playerID.toString())) {
      opacity = 0.4;
    }

    return (
      <Avatar
        playerName={playerNames[playerID]}
        withName
        cardCount={cards[playerID].length}
        style={{
          width: `${base}vw`,
          height: `${base}vw`,
          maxWidth: max,
          maxHeight: max,
          opacity,
        }}
      />
    );
  };

  return (
    <List
      style={{
        textAlign: 'center',
        width: '100%',
        color: 'white',
        minHeight: '130px',
      }}
      // rips keys from cards object and transforms them into integers
      // representing player IDs
      dataSource={Object.keys(cards).map((s) => parseInt(s, 10))}
      renderItem={renderPlayerStatus}
    />
  );
}

PlayerHUD.propTypes = {
  cards: PropTypes.objectOf(PropTypes.arrayOf(Card)).isRequired,
  currentPlayer: PropTypes.string.isRequired,
  playersIn: PropTypes.arrayOf(PropTypes.number).isRequired,
  playerNames: PropTypes.arrayOf(PropTypes.string),
};

PlayerHUD.defaultProps = {
  playerNames: ['Adri', 'Binh', 'Chris', 'Drake'],
};

export default PlayerHUD;