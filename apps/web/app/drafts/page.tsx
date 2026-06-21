'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, API_BASE_URL } from '../lib/api';

type CompanySummary = {
  _id: string;
  name: string;
  website?: string;
};

type Draft = {
  _id: string;
  companyId: string | CompanySummary;
  channel: string;
  status: string;
  subject?: string;
  message?: string;
  selectedAngle?: string;
  sourcesUsed?: string[];
  riskFlags?: string[];
  qualityScore?: number;
};

type Evidence = {
  _id: string;
  url: string;
  pageTitle?: string;
  cleanedText?: string;
};

function companyName(draft: Draft): string {
  return typeof draft.companyId === 'string' ? draft.companyId : draft.companyId.name;
}

export default function DraftReviewQueuePage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sources, setSources] = useState<Record<string, Evidence>>({});
  const [notice, setNotice] = useState('');

  const pendingDrafts = useMemo(
    () => drafts.filter((draft) => ['needs_review', 'pending_review', 'edited', 'approved'].includes(draft.status)),
    [drafts],
  );

  const fetchDrafts = useCallback(async () => {
    try {
      const draftData = await apiFetch<Draft[]>('/drafts');
      setDrafts(draftData);

      const sourceIds = Array.from(new Set(draftData.flatMap((draft) => draft.sourcesUsed ?? [])));
      const sourcePairs = await Promise.all(
        sourceIds.map(async (sourceId) => {
          try {
            const evidence = await apiFetch<Evidence>(`/evidence/${sourceId}`);
            return [sourceId, evidence] as const;
          } catch {
            return null;
          }
        }),
      );

      setSources(
        Object.fromEntries(sourcePairs.filter((pair): pair is readonly [string, Evidence] => pair !== null)),
      );
    } catch (e) {
      console.error(e);
      setNotice('Could not load drafts.');
    }
  }, []);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => current.map((draft) => (draft._id === id ? { ...draft, ...patch } : draft)));
  };

  const saveDraft = async (draft: Draft) => {
    try {
      await apiFetch<Draft>(`/drafts/${draft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: draft.subject ?? '', message: draft.message ?? '' }),
      });
      setNotice('Draft saved.');
      await fetchDrafts();
    } catch (e) {
      console.error(e);
      setNotice('Could not save draft.');
    }
  };

  const approveDraft = async (id: string) => {
    try {
      await apiFetch<Draft>(`/drafts/${id}/approve`, { method: 'POST' });
      setNotice('Draft approved.');
      await fetchDrafts();
    } catch (e) {
      console.error(e);
      setNotice('Could not approve draft.');
    }
  };

  const rejectDraft = async (id: string) => {
    try {
      await apiFetch<Draft>(`/drafts/${id}/reject`, { method: 'POST' });
      setNotice('Draft rejected.');
      await fetchDrafts();
    } catch (e) {
      console.error(e);
      setNotice('Could not reject draft.');
    }
  };

  const sendDraft = async (id: string) => {
    try {
      await apiFetch<Draft>(`/drafts/${id}/send`, { method: 'POST' });
      setNotice('Email sent.');
      await fetchDrafts();
    } catch (e) {
      console.error(e);
      setNotice('Could not send email.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-8 text-gray-900">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Draft Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">{pendingDrafts.length} drafts need review</p>
        </div>
        <a
          href={`${API_BASE_URL}/drafts/export/csv`}
          target="_blank"
          rel="noreferrer"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Export Approved CSV
        </a>
      </div>

      {notice && <p className="mb-4 text-sm text-gray-600">{notice}</p>}

      <div className="space-y-6">
        {pendingDrafts.map((draft) => (
          <div key={draft._id} className="bg-white shadow rounded-lg border border-gray-200 p-6 flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2 gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{companyName(draft)}</h2>
                  <p className="text-sm text-gray-500">{draft.selectedAngle || 'No selected angle'}</p>
                </div>
                <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">{draft.channel}</span>
              </div>
              <div className="text-sm text-gray-500 mb-4">Quality Score: {draft.qualityScore ?? '-'}/10</div>

              <input
                className="w-full font-medium mb-2 border border-gray-300 rounded p-2 text-sm"
                value={draft.subject ?? ''}
                placeholder="Subject"
                onChange={(e) => updateDraft(draft._id, { subject: e.target.value })}
              />

              <textarea
                className="w-full h-36 p-3 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                value={draft.message ?? ''}
                onChange={(e) => updateDraft(draft._id, { message: e.target.value })}
              />

              {draft.riskFlags && draft.riskFlags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {draft.riskFlags.map((flag) => (
                    <span key={flag} className="text-xs border border-red-100 bg-red-50 text-red-700 rounded-full px-2 py-1">
                      {flag}
                    </span>
                  ))}
                </div>
              )}

              {draft.sourcesUsed && draft.sourcesUsed.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs uppercase text-gray-500 font-medium mb-2">Sources</div>
                  <div className="space-y-2">
                    {draft.sourcesUsed.map((sourceId) => {
                      const source = sources[sourceId];
                      return source ? (
                        <div key={sourceId} className="border border-blue-100 bg-blue-50 rounded p-2">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-700 hover:underline"
                          >
                            {source.pageTitle || source.url}
                          </a>
                          {source.cleanedText && (
                            <p className="text-xs text-gray-600 mt-1">
                              {source.cleanedText.slice(0, 220)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span key={sourceId} className="text-xs text-gray-500 border border-gray-200 rounded-full px-2 py-1">
                          {sourceId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="w-full lg:w-48 flex lg:flex-col gap-3 justify-center">
              {draft.status === 'approved' ? (
                <button onClick={() => void sendDraft(draft._id)} className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 w-full font-bold">
                  Send Email
                </button>
              ) : (
                <>
                  <button onClick={() => void approveDraft(draft._id)} className="bg-green-600 text-white py-2 rounded hover:bg-green-700 w-full">
                    Approve
                  </button>
                  <button onClick={() => void saveDraft(draft)} className="bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200 w-full">
                    Save Edit
                  </button>
                  <button onClick={() => void rejectDraft(draft._id)} className="bg-red-100 text-red-700 py-2 rounded hover:bg-red-200 w-full">
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {pendingDrafts.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-white border border-gray-200 rounded-lg">
            No drafts pending review.
          </div>
        )}
      </div>
    </div>
  );
}
