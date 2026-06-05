import React, { useState } from 'react';
import StoryFeed from '../components/StoryFeed';
import ListPage from '../components/ListPage';

const STORY_LOG_TABS = [
  { key: 'stories', label: 'Stories' },
  { key: 'list', label: 'List' },
];

export default function StoryLog({
  stories,
  loading,
  error,
  passphrase,
  onRefresh,
  userName,
  onSubmitClick,
  lastUpdated,
}) {
  const [activeTab, setActiveTab] = useState('stories');

  return (
    <div>
      <div className="tp-tab-bar" style={{ marginBottom: '1rem' }}>
        {STORY_LOG_TABS.map(tab => (
          <button
            key={tab.key}
            className={`tp-tab-btn${activeTab === tab.key ? ' tp-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'stories' && (
        <StoryFeed
          stories={stories}
          loading={loading}
          error={error}
          passphrase={passphrase}
          onRefresh={onRefresh}
          userName={userName}
          onSubmitClick={onSubmitClick}
          lastUpdated={lastUpdated}
        />
      )}

      {activeTab === 'list' && (
        <section className="section">
          <ListPage passphrase={passphrase} userName={userName} />
        </section>
      )}
    </div>
  );
}
