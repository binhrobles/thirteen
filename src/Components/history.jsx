import React from 'react';
import PropTypes from 'prop-types';
import { List, Space } from 'antd';
import Play from '../Play';
import Card from '../Card';
import Hand from './hand';

const History = (props) => {
  const { log, playerNames } = props;

  // auto scroll to list footer, whenever there's a new log item
  const bottomRef = React.useRef(null);
  React.useEffect(() => {
    bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const renderLogItem = (entry) => {
    switch (entry.event) {
      case 'move':
        return (
          <>
            <Hand cards={entry.play.cards.sort(Card.Compare)} />
            Remaining: {entry.play.cardsRemaining}
          </>
        );
      case 'pass':
        return (
          <>
            <div>Passed</div>
            Remaining: {entry.cardsRemaining}
          </>
        );
      case 'power':
        return <>has power</>;
      case 'win':
        return <>is out! 🎆</>;
      default:
        return <></>;
    }
  };

  const renderItem = (play) => (
    <List.Item style={{ justifyContent: 'center' }}>
      <Space>
        {playerNames[parseInt(play.player, 10)]}
        {renderLogItem(play)}
      </Space>
    </List.Item>
  );

  return (
    <List
      style={{
        textAlign: 'center',
        maxHeight: '50vh',
        overflow: 'auto',
        width: '100%',
      }}
      dataSource={log}
      footer={<div ref={bottomRef} />}
      renderItem={renderItem}
    />
  );
};

History.propTypes = {
  log: PropTypes.arrayOf(Play).isRequired,
  playerNames: PropTypes.arrayOf(PropTypes.string),
};

History.defaultProps = {
  playerNames: ['Adri', 'Binh', 'Chris', 'Drake'],
};

export default History;
