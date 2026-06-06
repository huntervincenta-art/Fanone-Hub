import React, { useState } from 'react';
import FindStories from '../components/FindStories';
import {
  SmartInput,
  ScriptDisplay,
  HistoryLog,
  ScriptAnalyzer,
  TopicalTab,
  detectInputType,
} from './TopicPulse';

const CREATE_TABS = [
  { key: 'discover',       label: 'Discover',        icon: '🔍', subtitle: 'Find breaking stories from approved news sources' },
  { key: 'generate',       label: 'Generate',        icon: '✍️', subtitle: 'Turn a URL, video, or topic into a ready-to-shoot script' },
  { key: 'scriptAnalyzer', label: 'Script Analyzer',  icon: '📊', subtitle: 'Analyze a script against proven performance angles' },
  { key: 'topical',        label: 'Topical',          icon: '🧵', subtitle: 'Auto-cluster articles into thesis-level narratives' },
];

// ── Generate tab (lifted from TopicPulse main component) ────────────────────

function GenerateTab({ passphrase, userName }) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState(null);
  const [genInputType, setGenInputType] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const handleGenerate = async (input, inputType) => {
    setGenerating(true);
    setGenError('');
    setGenResult(null);
    setGenInputType(inputType);

    try {
      let res;
      if (inputType === 'video') {
        res = await fetch('/api/fanone-hub/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
          body: JSON.stringify({ youtubeUrl: input, user: userName }),
        });
      } else if (inputType === 'article') {
        res = await fetch('/api/fanone/generate-script-from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
          body: JSON.stringify({ url: input, user: userName }),
        });
      } else {
        res = await fetch('/api/fanone-hub/topic-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
          body: JSON.stringify({ topic: input, user: userName }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      if (inputType === 'video') {
        setGenResult(JSON.stringify(data.result));
      } else {
        setGenResult(data.script);
      }
      setHistoryKey(k => k + 1);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <SmartInput onGenerate={handleGenerate} loading={generating} />

      {genError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{genError}</div>}
      {generating && (
        <div className="tp-generating">
          <div className="tp-spinner" />
          <span>Generating script... this may take a minute.</span>
        </div>
      )}
      {genResult && (
        <ScriptDisplay
          script={genResult}
          inputType={genInputType}
          onClose={() => setGenResult(null)}
        />
      )}

      <HistoryLog key={historyKey} passphrase={passphrase} />
    </>
  );
}

// ── Main Create page ────────────────────────────────────────────────────────

export default function Create({ passphrase, userName }) {
  const [activeTab, setActiveTab] = useState('discover');
  const currentTab = CREATE_TABS.find(t => t.key === activeTab) || CREATE_TABS[0];

  return (
    <div className="create-page">
      <div className="create-page-header">
        <h2>Create</h2>
        <p className="create-page-subtitle">Build scripts, discover stories, and analyze content</p>
      </div>

      <div className="tp-tab-bar create-tab-bar">
        {CREATE_TABS.map(tab => (
          <button
            key={tab.key}
            className={`tp-tab-btn${activeTab === tab.key ? ' tp-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="dash-card create-page-body">
        <div className="create-section-header">
          <span className="create-section-icon">{currentTab.icon}</span>
          <div>
            <h3 className="create-section-title">{currentTab.label}</h3>
            <p className="create-section-subtitle">{currentTab.subtitle}</p>
          </div>
        </div>

        {activeTab === 'discover' && (
          <FindStories passphrase={passphrase} userName={userName} />
        )}

        {activeTab === 'generate' && (
          <GenerateTab passphrase={passphrase} userName={userName} />
        )}

        {activeTab === 'scriptAnalyzer' && (
          <ScriptAnalyzer passphrase={passphrase} />
        )}

        {activeTab === 'topical' && (
          <TopicalTab passphrase={passphrase} userName={userName} />
        )}
      </div>

      {activeTab === 'discover' && (
        <div className="create-tip">
          <strong>Tip:</strong> Use <em>Add to Available</em> to save a story for the team, <em>Claim It</em> to assign it to yourself, or <em>Generate Script</em> to create a full MFS script package from the article.
        </div>
      )}
    </div>
  );
}
