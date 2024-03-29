import React from 'react';
import PropTypes from 'prop-types';
import { List, Space } from 'antd';
import Emoji from 'a11y-react-emoji';
import Play from '../../Game/Play';
import Card from '../../Game/Card';
import { Avatar, Hand } from '../../Components';

function History(props) {
  const { log, playerNames } = props;

  // auto scroll to list footer, whenever there's a new log item
  const bottomRef = React.useRef(null);
  React.useEffect(() => {
    bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [log]);

  const getPlayerName = (playerID) => {
    return playerNames[parseInt(playerID, 10)];
  };

  const renderLogItem = (entry) => {
    switch (entry.event) {
      case 'move':
        return (
          <>
            <Hand cards={[...entry.play.cards].sort(Card.Compare)} />
            {entry.play.suited && 'Suited'}
          </>
        );
      case 'pass':
        return <div>Passed</div>;
      case 'power':
        return <>has power</>;
      case 'win':
        return (
          <>
            is out! <Emoji symbol="🎇" label="fireworks" />
          </>
        );
      default:
        return <></>;
    }
  };

  const renderItem = (entry) => (
    <List.Item style={{ justifyContent: 'center', color: 'white' }}>
      <Space
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          maxWidth: '100vw',
        }}
      >
        <Avatar playerName={getPlayerName(entry.player)} />
        {renderLogItem(entry)}
      </Space>
    </List.Item>
  );

  return (
    <List
      style={{
        textAlign: 'center',
        maxHeight: '60vh',
        overflow: 'auto',
        width: '100%',
      }}
      dataSource={log}
      footer={<div ref={bottomRef} />}
      renderItem={renderItem}
    />
  );
}

History.propTypes = {
  log: PropTypes.arrayOf(Play).isRequired,
  playerNames: PropTypes.arrayOf(PropTypes.string),
};

History.defaultProps = {
  playerNames: ['Adri', 'Binh', 'Chris', 'Drake'],
};

export default History;
