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
  { key: 'discover', label: 'Discover' },
  { key: 'generate', label: 'Generate' },
  { key: 'scriptAnalyzer', label: 'Script Analyzer' },
  { key: 'topical', label: 'Topical' },
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

  return (
    <section className="section tp-page">
      <div className="tp-page-header">
        <h2>Create</h2>
      </div>

      <div className="tp-tab-bar">
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
    </section>
  );
}
