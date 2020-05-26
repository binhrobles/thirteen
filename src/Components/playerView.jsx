import React from 'react';
import PropTypes from 'prop-types';
import { Button, Divider, Space, Popconfirm, Row } from 'antd';
import Hand from './hand';
import Card from '../Card';

function PlayerView(props) {
  const { cards, currentPlayer, playersIn, isActive, moves } = props;
  const [selected, updateSelected] = React.useState([]);

  function selectCard(id) {
    updateSelected((prev) => prev.concat(id));
  }

  function clear() {
    updateSelected([]);
  }

  // should only return IDs
  function playMove() {
    moves.MakeMove(selected);

    // TODO: we don't get feedback on the result of the move: https://github.com/nicolodavis/boardgame.io/issues/592
    // so check if we're still active, or something, implying the move didn't fire

    clear();
  }

  const statusBar = (
    <div>
      Players remaining: {playersIn.join(', ')} Waiting on Player{' '}
      {currentPlayer}
    </div>
  );
  const cardPlaceholder = <div style={{ minHeight: 120 }} />;

  // TODO: break into smaller components
  return (
    <>
      <Row align="center">
        {isActive ? (
          <Space direction="vertical" align="center">
            {selected.length ? (
              <Hand cards={cards.filter((_, idx) => selected.includes(idx))} />
            ) : (
              cardPlaceholder
            )}
            <Space>
              {selected.length > 0 ? (
                <div>
                  <Button type="primary" onClick={playMove}>
                    Play it!
                  </Button>
                  <Button type="default" onClick={clear}>
                    Clear
                  </Button>
                </div>
              ) : (
                <Popconfirm
                  title="Really?"
                  okText="Really."
                  cancelText="No"
                  onConfirm={moves.Pass}
                >
                  <Button type="default">Pass</Button>
                </Popconfirm>
              )}
            </Space>
          </Space>
        ) : (
          cardPlaceholder
        )}
      </Row>
      <div style={{ position: 'fixed', bottom: 0 }}>
        <Row align="center">{isActive || statusBar}</Row>
        <Divider style={{ margin: '10px 0' }} />
        <Row align="center">
          <Hand cards={cards} isActive={isActive} onSelect={selectCard} />
        </Row>
      </div>
    </>
  );
}

PlayerView.propTypes = {
  cards: PropTypes.arrayOf(Card).isRequired,
  currentPlayer: PropTypes.string.isRequired,
  playersIn: PropTypes.arrayOf(PropTypes.string).isRequired,
  moves: PropTypes.shape({
    Pass: PropTypes.func,
    MakeMove: PropTypes.func,
  }).isRequired,
  isActive: PropTypes.bool.isRequired,
};

export default PlayerView;
