'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

type Company = {
  _id: string;
  campaignId: string;
  name: string;
  website?: string;
  websiteCandidates?: WebsiteCandidate[];
  websiteSelectionReasoning?: string;
  websiteSelectionConfidence?: number;
  status: string;
  summary?: string;
  industryTags?: string[];
  locationTags?: string[];
  keywordMatches?: string[];
  productsServices?: string[];
  painHypotheses?: string[];
  fitScore?: number;
  priority?: string;
  scoreBreakdown?: Record<string, number>;
  scoreReasoning?: string[];
  oversight?: {
    verdict?: string;
    fitConfidence?: number;
    signalQuality?: number;
    buyingLikelihood?: number;
    recommendedAngle?: string;
    risks?: string[];
    reasoning?: string;
    model?: string;
  };
};

type WebsiteCandidate = {
  rank?: number;
  title?: string;
  url?: string;
  domain?: string;
  snippet?: string;
};

type Evidence = {
  _id: string;
  sourceType: string;
  url: string;
  pageTitle?: string;
  cleanedText?: string;
  detectedKeywords?: string[];
  provider?: string;
  providerQuery?: string;
  retrievalStatus?: string;
  sourceConfidence?: number;
  providerStatus?: {
    provider?: string;
    status?: string;
    evidenceCount?: number;
    error?: string;
    attempted?: string[];
    retrievedAt?: string;
  };
  retrievedAt?: string;
};

type Signal = {
  _id: string;
  signalType: string;
  signalKey?: string;
  factType?: string;
  fact?: string;
  description?: string;
  relevanceScore?: number;
  confidence?: number;
  evidenceSnippet?: string;
  sourceUrl?: string;
  sourceType?: string;
  evidenceId?: string;
};

type Draft = {
  _id: string;
  channel: string;
  status: string;
  subject?: string;
  message?: string;
  selectedAngle?: string;
  reasoning?: string;
  sourcesUsed?: string[];
  riskFlags?: string[];
  qualityScore?: number;
  qualityPassed?: boolean;
};

type Contact = {
  _id: string;
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  roleMatchScore?: number;
  emailConfidence?: number;
  emailRoutingType?: string;
  emailRoutingNote?: string;
  source?: string;
  sourceUrl?: string;
  providerConfidence?: number;
  recommended?: boolean;
  status: string;
};

type ResearchJob = {
  _id: string;
  status: string;
  currentStep?: string;
  error?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export default function CompanyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.id;

  const [company, setCompany] = useState<Company | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [researchJobs, setResearchJobs] = useState<ResearchJob[]>([]);
  const [notice, setNotice] = useState('');
  const [websiteInput, setWebsiteInput] = useState('');
  const [isSavingWebsite, setIsSavingWebsite] = useState(false);
  const [isResearchingAction, setIsResearchingAction] = useState(false);
  const [isEnrichingAction, setIsEnrichingAction] = useState(false);
  const [isDraftAction, setIsDraftAction] = useState(false);
  const [isDraftMutation, setIsDraftMutation] = useState(false);
  const [factSourceFilter, setFactSourceFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [companyData, evidenceData, signalData, draftData, contactData, jobData] = await Promise.all([
        apiFetch<Company>(`/companies/${companyId}`),
        apiFetch<Evidence[]>(`/companies/${companyId}/evidence`),
        apiFetch<Signal[]>(`/companies/${companyId}/signals`),
        apiFetch<Draft[]>(`/companies/${companyId}/drafts`),
        apiFetch<Contact[]>(`/contacts?companyId=${companyId}`),
        apiFetch<ResearchJob[]>(`/research-jobs?companyId=${companyId}`),
      ]);
      setCompany(companyData);
      setEvidence(evidenceData);
      setSignals(signalData);
      setDrafts(draftData);
      setContacts(contactData);
      setResearchJobs(jobData);
    } catch (e) {
      console.error(e);
      setNotice('Could not load company data.');
    }
  }, [companyId]);

  const currentCompanyId = company?._id;
  const currentWebsite = company?.website ?? '';
  const activeResearchJob = researchJobs.find((job) => ['queued', 'running'].includes(job.status));
  const isWebsiteJobActive = company
    ? ['researching', 'research_pending'].includes(company.status)
    : false;
  const isBackendWorking = Boolean(activeResearchJob) || isWebsiteJobActive || isResearchingAction || isEnrichingAction || isDraftAction;

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (currentCompanyId) {
      setWebsiteInput(currentWebsite);
    }
  }, [currentCompanyId, currentWebsite]);

  useEffect(() => {
    if (!isBackendWorking) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchData();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [isBackendWorking, fetchData]);

  const evidenceById = useMemo(
    () => new Map(evidence.map((item) => [item._id, item])),
    [evidence],
  );

  const activeDraft = drafts.find((draft) => ['needs_review', 'pending_review', 'edited', 'approved'].includes(draft.status)) ?? drafts[0];
  const [selectedContactEmail, setSelectedContactEmail] = useState('');
  const sourceCoverage = useMemo(() => buildSourceCoverage(evidence), [evidence]);
  const usableEvidence = useMemo(() => evidence.filter(isUsableEvidence), [evidence]);
  const routingOnlyContacts = contacts.length > 0 && contacts.every((contact) => contact.emailRoutingType === 'general_inbox' || !contact.email);
  const draftBlockedReason = useMemo(
    () => draftBlockReason(company, activeDraft, signals, usableEvidence, contacts, sourceCoverage),
    [company, activeDraft, signals, usableEvidence, contacts, sourceCoverage],
  );
  const sourceTypes = useMemo(
    () => Array.from(new Set(signals.map((signal) => signal.sourceType).filter(Boolean))) as string[],
    [signals],
  );
  const filteredSignals = useMemo(
    () => signals.filter((signal) => factSourceFilter === 'all' || signal.sourceType === factSourceFilter),
    [signals, factSourceFilter],
  );

  const handleResearch = async () => {
    if (isBackendWorking) return;
    setIsResearchingAction(true);
    try {
      await apiFetch(`/companies/${companyId}/research`, { method: 'POST' });
      setNotice('Queued company research.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not queue company research.');
    } finally {
      setIsResearchingAction(false);
    }
  };

  const handleEnrichWebsite = async () => {
    if (isBackendWorking) return;
    setIsEnrichingAction(true);
    try {
      await apiFetch(`/companies/${companyId}/enrich-website`, { method: 'POST' });
      setNotice('Queued website re-check.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not queue website re-check.');
    } finally {
      setIsEnrichingAction(false);
    }
  };

  const saveWebsite = async (website: string) => {
    setIsSavingWebsite(true);
    try {
      const updatedCompany = await apiFetch<Company>(`/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website }),
      });
      setCompany(updatedCompany);
      setNotice(website.trim() ? 'Website updated.' : 'Website cleared.');
    } catch (e) {
      console.error(e);
      setNotice('Could not update website.');
    } finally {
      setIsSavingWebsite(false);
    }
  };

  const updateDraftText = (draftId: string, message: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft._id === draftId ? { ...draft, message } : draft)),
    );
  };

  const saveDraft = async (draft: Draft) => {
    if (isDraftMutation) return;
    setIsDraftMutation(true);
    try {
      await apiFetch<Draft>(`/drafts/${draft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.message ?? '', subject: draft.subject ?? '' }),
      });
      setNotice('Draft saved.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not save draft.');
    } finally {
      setIsDraftMutation(false);
    }
  };

  const approveDraft = async (draftId: string) => {
    if (isDraftMutation) return;
    setIsDraftMutation(true);
    try {
      await apiFetch<Draft>(`/drafts/${draftId}/approve`, { method: 'POST' });
      setNotice('Draft approved.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not approve draft.');
    } finally {
      setIsDraftMutation(false);
    }
  };

  const rejectDraft = async (draftId: string) => {
    if (isDraftMutation) return;
    setIsDraftMutation(true);
    try {
      await apiFetch<Draft>(`/drafts/${draftId}/reject`, { method: 'POST' });
      setNotice('Draft rejected.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not reject draft.');
    } finally {
      setIsDraftMutation(false);
    }
  };

  const regenerateDraft = async () => {
    if (isBackendWorking) return;
    setIsDraftAction(true);
    try {
      if (activeDraft) {
        await apiFetch(`/drafts/${activeDraft._id}/regenerate`, { method: 'POST' });
      } else {
        await apiFetch(`/companies/${companyId}/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forceDraft: true }),
        });
      }
      setNotice('Queued regeneration.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not queue regeneration.');
    } finally {
      setIsDraftAction(false);
    }
  };

  const sendDraft = async (draftId: string) => {
    if (isDraftMutation) return;
    setIsDraftMutation(true);
    try {
      await apiFetch(`/drafts/${draftId}/send`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactEmail: selectedContactEmail })
      });
      setNotice('Email sent successfully!');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not send email.');
    } finally {
      setIsDraftMutation(false);
    }
  };

  if (!company) return <div className="neo-container">Loading...</div>;

  return (
    <div className="neo-page">
      <main className="neo-container">
      <div className="neo-card mb-6">
        <Link href={`/campaigns/${company.campaignId}`} className="text-sm font-semibold text-slate-500 hover:text-slate-800">
          Back to campaign flow
        </Link>
        <div className="flex justify-between items-start mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">{company.name}</h1>
            <p className="text-slate-500 mt-1">
              Fit Score: {company.fitScore ?? '-'} {company.priority ? `/ ${company.priority}` : ''}
            </p>
            <p className="neo-pill mt-3 w-fit">{company.status}</p>
          </div>
          <div className="flex flex-wrap gap-3 justify-end">
            <button onClick={handleEnrichWebsite} disabled={isBackendWorking} className="neo-button-warning">
              {isEnrichingAction ? <><span className="neo-spinner mr-2" />Queueing...</> : 'Re-check Website'}
            </button>
            <button onClick={handleResearch} disabled={isBackendWorking || !company.website} className="neo-button">
              {isResearchingAction ? <><span className="neo-spinner mr-2" />Queueing...</> : 'Refresh Data'}
            </button>
            <button onClick={regenerateDraft} disabled={isBackendWorking} className="neo-button-primary">
              {isDraftAction ? <><span className="neo-spinner-invert mr-2" />Queueing...</> : 'Generate Draft'}
            </button>
          </div>
        </div>
        {notice && <p className="neo-inset mt-4 px-4 py-3 text-sm text-slate-600">{notice}</p>}
        {isBackendWorking && (
          <div className="neo-inset mt-4 flex items-start gap-3 px-4 py-3 text-sm text-slate-700">
            <span className="neo-spinner mt-0.5" />
            <div>
              <div className="font-bold text-slate-900">
                {activeResearchJob ? `Research ${activeResearchJob.status}: ${stepLabel(activeResearchJob.currentStep)}` : 'Backend pipeline is working'}
              </div>
              <div className="text-xs text-slate-500">
                This can take a little while while the worker crawls, calls the model, scores facts, finds contacts, or drafts outreach. Costly actions are disabled until it finishes.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Summary">
            <p className="text-gray-700">{company.summary || 'No summary available yet.'}</p>
            <TagRow values={company.industryTags ?? []} emptyLabel="No industry tags" />
            <TagRow values={company.keywordMatches ?? []} emptyLabel="No keyword matches" />
          </Panel>

          <Panel title="Score Explanation">
            {company.scoreBreakdown ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(company.scoreBreakdown).map(([label, value]) => (
                  <div key={label} className="neo-inset p-3">
                    <div className="text-xs text-slate-500 uppercase">{label}</div>
                    <div className="text-xl font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">No score breakdown yet.</p>
            )}
            {company.scoreReasoning && company.scoreReasoning.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1 mt-4">
                {company.scoreReasoning.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Qualification Facts">
            {usableEvidence.length === 0 && evidence.length > 0 && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Evidence was collected, but none is usable for qualification yet.
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase text-slate-500">Source</span>
              <select value={factSourceFilter} onChange={(event) => setFactSourceFilter(event.target.value)} className="neo-select w-auto">
                <option value="all">All sources</option>
                {sourceTypes.map((sourceType) => (
                  <option key={sourceType} value={sourceType}>{sourceType}</option>
                ))}
              </select>
            </div>
            {filteredSignals.length === 0 ? (
              <p className="text-gray-500 italic">No structured facts detected yet.</p>
            ) : (
              <ul className="space-y-3">
                {filteredSignals.map((signal) => (
                  <li key={signal._id} className="border-b border-gray-100 pb-3 last:border-0">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-gray-900">{signal.fact || signal.description || signal.signalType}</span>
                      <span className={`text-xs px-2 py-1 rounded ${signal.factType === 'negative_signal' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {signal.factType || 'fact'}
                      </span>
                    </div>
                    {signal.evidenceSnippet && <p className="text-sm text-gray-700 mt-1">{signal.evidenceSnippet}</p>}
                    <div className="text-xs text-gray-500 mt-1">
                      {Math.round((signal.confidence ?? 0) * 100)}% confidence / {Math.round((signal.relevanceScore ?? 0) * 100)} relevance
                      {signal.sourceType ? ` / ${signal.sourceType}` : ''}
                    </div>
                    {signal.sourceUrl && (
                      <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                        Source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Oversight">
            {!company.oversight ? (
              <p className="text-gray-500 italic">No oversight result yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs uppercase bg-gray-100 text-gray-700 px-2 py-1 rounded">{company.oversight.verdict}</span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                    Fit {Math.round((company.oversight.fitConfidence ?? 0) * 100)}%
                  </span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                    Signal {Math.round((company.oversight.signalQuality ?? 0) * 100)}%
                  </span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                    Buying {Math.round((company.oversight.buyingLikelihood ?? 0) * 100)}%
                  </span>
                </div>
                {company.oversight.recommendedAngle && (
                  <p className="text-sm text-gray-800">{company.oversight.recommendedAngle}</p>
                )}
                {company.oversight.reasoning && (
                  <p className="text-sm text-gray-600">{company.oversight.reasoning}</p>
                )}
                <TagRow values={company.oversight.risks ?? []} emptyLabel="" tone="risk" />
              </div>
            )}
          </Panel>

          <Panel title="Top Signals">
            {signals.length === 0 ? (
              <p className="text-gray-500 italic">No signals detected yet.</p>
            ) : (
              <ul className="space-y-3">
                {signals.map((signal) => (
                  <li key={signal._id} className="border-b border-gray-100 pb-3 last:border-0">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-gray-900">{signal.signalType}</span>
                      <span className="text-xs text-gray-500">
                        {Math.round((signal.relevanceScore ?? 0) * 100)} relevance
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{signal.description || signal.evidenceSnippet}</p>
                    {signal.sourceUrl && (
                      <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                        Source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Evidence">
            {evidence.length === 0 ? (
              <p className="text-gray-500 italic">No evidence collected yet.</p>
            ) : (
              <div className="space-y-4">
                {evidence.map((item) => (
                  <div key={item._id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex justify-between items-start gap-4">
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                        {item.pageTitle || item.url}
                      </a>
                      <span className={`text-xs px-2 py-1 rounded ${item.retrievalStatus === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                        {item.sourceType} {item.retrievalStatus ? `/ ${item.retrievalStatus}` : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-2 bg-gray-50 p-3 rounded">
                      {(item.cleanedText || '').slice(0, 420) || 'No text extracted.'}
                    </p>
                    <TagRow values={item.detectedKeywords ?? []} emptyLabel="" />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Contacts">
            {routingOnlyContacts && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Only routing inboxes are available. Use these for routing, not as direct personal emails.
              </div>
            )}
            {contacts.length === 0 ? (
              <p className="text-gray-500 italic">No contacts discovered yet.</p>
            ) : (
              <div className="space-y-4">
                {contacts.map((contact) => (
                  <div key={contact._id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {contact.name}
                        {contact.recommended && <span className="ml-2 text-xs bg-green-50 text-green-700 px-2 py-1 rounded">Recommended</span>}
                      </div>
                      <div className="text-sm text-gray-600">{contact.title || 'Unknown Title'}</div>
                      <div className="text-sm text-gray-500">{contact.email || 'No email found'}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Role match {Math.round((contact.roleMatchScore ?? 0) * 100)}%
                        {contact.emailConfidence ? ` / email ${Math.round(contact.emailConfidence * 100)}%` : ''}
                        {contact.emailRoutingType === 'general_inbox' ? ' / routed via general inbox' : ''}
                        {contact.providerConfidence ? ` / provider ${Math.round(contact.providerConfidence * 100)}%` : ''}
                        {contact.source ? ` / ${contact.source}` : ''}
                      </div>
                      {contact.emailRoutingNote && (
                        <div className="mt-1 text-xs text-amber-700">{contact.emailRoutingNote}</div>
                      )}
                      {contact.sourceUrl && (
                        <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                          Source page
                        </a>
                      )}
                    </div>
                    {contact.linkedinUrl && (
                      <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                        LinkedIn
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Source Coverage">
            {usableEvidence.length === 0 && evidence.length > 0 && (
              <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                No usable qualification evidence yet. Failed provider records are shown for audit only.
              </div>
            )}
            {sourceCoverage.usableSourceCategories <= 1 && usableEvidence.length > 0 && (
              <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Single-source qualification; enrich before outreach.
              </div>
            )}
            {sourceCoverage.failedProviders.length > 0 && (
              <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                Provider failures: {sourceCoverage.failedProviders.join(', ')}.
              </div>
            )}
            {sourceCoverage.disabledProviders.length > 0 && (
              <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Disabled providers: {sourceCoverage.disabledProviders.join(', ')}. Configure provider keys for broader enrichment.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <CoverageMetric label="Website" value={sourceCoverage.website} />
              <CoverageMetric label="Jobs/Careers" value={sourceCoverage.jobs} />
              <CoverageMetric label="LinkedIn" value={sourceCoverage.linkedin} />
              <CoverageMetric label="Search/Directory" value={sourceCoverage.searchDirectory} />
            </div>
            <div className="mt-4 space-y-2">
              {sourceCoverage.providers.map((provider) => (
                <div key={provider.name} className="neo-inset p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-slate-800">{provider.name}</span>
                    <span className="text-slate-500">{provider.count} items</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Last status: {provider.status}</div>
                  {provider.error && <div className="mt-1 text-xs text-red-600">{provider.error}</div>}
                </div>
              ))}
              {sourceCoverage.providers.length === 0 && (
                <p className="text-sm text-gray-500 italic">No source coverage yet.</p>
              )}
            </div>
          </Panel>

          <Panel title="Website Selection">
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase text-gray-500 font-medium">Current Website</div>
                {company.website ? (
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {company.website}
                  </a>
                ) : (
                  <p className="text-sm text-gray-500 italic">No website selected.</p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="website" className="text-xs uppercase text-gray-500 font-medium">
                  Manual Override
                </label>
                <div className="flex gap-2">
                  <input
                    id="website"
                    value={websiteInput}
                    onChange={(e) => setWebsiteInput(e.target.value)}
                    placeholder="https://example.com"
                    className="neo-input min-w-0 flex-1"
                  />
                  <button
                    onClick={() => void saveWebsite(websiteInput)}
                    disabled={isSavingWebsite || isBackendWorking}
                    className="neo-button-primary px-3"
                  >
                    {isSavingWebsite ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {company.website && (
                  <button
                    onClick={() => void saveWebsite('')}
                    disabled={isSavingWebsite || isBackendWorking}
                    className="text-xs text-slate-500 hover:text-red-700"
                  >
                    Clear website
                  </button>
                )}
              </div>
              {typeof company.websiteSelectionConfidence === 'number' && (
                <p className="text-sm text-gray-700">
                  Confidence: {Math.round(company.websiteSelectionConfidence * 100)}%
                </p>
              )}
              {company.websiteSelectionReasoning && (
                <p className="text-sm text-gray-700">{company.websiteSelectionReasoning}</p>
              )}
              {company.websiteCandidates && company.websiteCandidates.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase text-gray-500 font-medium">Candidates</div>
                  {company.websiteCandidates.map((candidate) => (
                    <div key={`${candidate.rank}-${candidate.url}`} className="neo-inset p-3">
                      <div className="flex justify-between gap-3">
                        <a
                          href={candidate.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 hover:underline truncate"
                        >
                          {candidate.title || candidate.domain || candidate.url}
                        </a>
                        <span className="text-xs text-gray-500">#{candidate.rank}</span>
                      </div>
                      {candidate.url && (
                        <button
                          onClick={() => void saveWebsite(candidate.url ?? '')}
                          disabled={isSavingWebsite || isBackendWorking}
                          className="mt-2 text-xs text-blue-700 hover:text-blue-900 disabled:text-gray-300"
                        >
                          Use this website
                        </button>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{candidate.domain}</p>
                      {candidate.snippet && <p className="text-xs text-gray-600 mt-2">{candidate.snippet}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Draft Message">
            {!activeDraft ? (
              <div className="space-y-2">
                <p className="text-gray-500 italic">No draft generated yet.</p>
                {draftBlockedReason && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {draftBlockedReason}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase text-gray-500 font-medium">Status</div>
                  <div className="text-sm text-gray-900">{activeDraft.status}</div>
                </div>
                {activeDraft.selectedAngle && (
                  <div>
                    <div className="text-xs uppercase text-gray-500 font-medium">Angle</div>
                    <p className="text-sm text-gray-700">{activeDraft.selectedAngle}</p>
                  </div>
                )}
                {activeDraft.subject && (
                  <input
                    value={activeDraft.subject}
                    onChange={(e) =>
                      setDrafts((current) =>
                        current.map((draft) =>
                          draft._id === activeDraft._id ? { ...draft, subject: e.target.value } : draft,
                        ),
                      )
                    }
                    className="neo-input"
                  />
                )}
                <textarea
                  className="neo-input h-56"
                  value={activeDraft.message ?? ''}
                  onChange={(e) => updateDraftText(activeDraft._id, e.target.value)}
                />
                {activeDraft.riskFlags && activeDraft.riskFlags.length > 0 && (
                  <TagRow values={activeDraft.riskFlags} emptyLabel="" tone="risk" />
                )}
                {activeDraft.sourcesUsed && activeDraft.sourcesUsed.length > 0 && (
                  <div>
                    <div className="text-xs uppercase text-gray-500 font-medium mb-2">Sources</div>
                    <div className="space-y-1">
                      {activeDraft.sourcesUsed.map((sourceId) => {
                        const source = evidenceById.get(sourceId);
                        return source ? (
                          <a
                            key={sourceId}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-blue-600 hover:underline"
                          >
                            {source.pageTitle || source.url}
                          </a>
                        ) : (
                          <div key={sourceId} className="text-xs text-gray-500">
                            {sourceId}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={isDraftMutation} onClick={() => void rejectDraft(activeDraft._id)} className="neo-button-danger">
                    {isDraftMutation ? 'Working...' : 'Reject'}
                  </button>
                  <button disabled={isDraftMutation} onClick={() => void saveDraft(activeDraft)} className="neo-button">
                    {isDraftMutation ? 'Working...' : 'Save'}
                  </button>
                  <button disabled={isBackendWorking} onClick={regenerateDraft} className="neo-button">
                    {isDraftAction ? 'Queueing...' : 'Regenerate'}
                  </button>
                  {activeDraft.status === 'approved' ? (
                    <div className="flex flex-col gap-2 col-span-2">
                      <select 
                        className="neo-select"
                        value={selectedContactEmail}
                        onChange={(e) => setSelectedContactEmail(e.target.value)}
                      >
                        <option value="">-- Select Contact to Send To --</option>
                        {contacts.filter(c => c.email).map(c => (
                          <option key={c._id} value={c.email}>{c.name} ({c.email})</option>
                        ))}
                      </select>
                      <button 
                        onClick={() => void sendDraft(activeDraft._id)} 
                        disabled={!selectedContactEmail || isDraftMutation}
                        className="neo-button-primary disabled:bg-gray-400"
                      >
                        {isDraftMutation ? 'Sending...' : 'Send Email'}
                      </button>
                    </div>
                  ) : (
                    <button disabled={isDraftMutation} onClick={() => void approveDraft(activeDraft._id)} className="neo-button-success">
                      {isDraftMutation ? 'Working...' : 'Approve'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
      </main>
    </div>
  );
}

function CoverageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="neo-inset p-3">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function buildSourceCoverage(evidence: Evidence[]) {
  const usable = evidence.filter(isUsableEvidence);
  const website = usable.filter((item) => item.sourceType.startsWith('website_')).length;
  const jobs = usable.filter((item) => ['website_jobs', 'website_careers', 'job_posting'].includes(item.sourceType)).length;
  const linkedin = usable.filter((item) => item.sourceType.startsWith('linkedin_')).length;
  const searchDirectory = usable.filter((item) =>
    ['search_result', 'website_directory', 'conference_page', 'association_member_page'].includes(item.sourceType),
  ).length;
  const providerMap = new Map<string, { name: string; count: number; status: string; error?: string }>();
  for (const item of evidence) {
    const name = item.providerStatus?.provider || item.provider || item.sourceType || 'unknown_provider';
    const current = providerMap.get(name) || { name, count: 0, status: 'unknown', error: undefined };
    current.count += 1;
    current.status = item.providerStatus?.status || item.retrievalStatus || current.status;
    current.error = item.providerStatus?.error || current.error;
    providerMap.set(name, current);
  }
  const failedProviders = Array.from(providerMap.values())
    .filter((provider) => provider.status === 'failed')
    .map((provider) => provider.name);
  const disabledProviders = Array.from(providerMap.values())
    .filter((provider) => provider.status === 'disabled')
    .map((provider) => provider.name);
  return {
    website,
    jobs,
    linkedin,
    searchDirectory,
    totalSources: [website, jobs, linkedin, searchDirectory].filter((value) => value > 0).length,
    usableSourceCategories: [website, jobs, linkedin, searchDirectory].filter((value) => value > 0).length,
    failedProviders,
    disabledProviders,
    providers: Array.from(providerMap.values()).sort((a, b) => b.count - a.count),
  };
}

function isUsableEvidence(item: Evidence) {
  const status = item.retrievalStatus || 'completed';
  const confidence = item.sourceConfidence ?? 0.75;
  const text = (item.cleanedText || '').trim();
  if (!['completed', 'metadata_only'].includes(status)) return false;
  if (confidence < 0.2) return false;
  if (text.toLowerCase().startsWith('provider ') && text.toLowerCase().includes(' could not retrieve ')) return false;
  if (status === 'metadata_only') return true;
  return text.length >= 80 || ['search_result', 'linkedin_company_profile'].includes(item.sourceType);
}

function draftBlockReason(
  company: Company | null,
  activeDraft: Draft | undefined,
  signals: Signal[],
  usableEvidence: Evidence[],
  contacts: Contact[],
  sourceCoverage: ReturnType<typeof buildSourceCoverage>,
) {
  if (!company || activeDraft) return '';
  if (company.status === 'researching' || company.status === 'research_pending') {
    return 'Research is still running. The draft will appear after qualification, contacts, and oversight finish.';
  }
  if (usableEvidence.length === 0) {
    return 'Draft blocked: no usable source-backed evidence is available yet.';
  }
  const score = company.fitScore ?? 0;
  if (score < 75) {
    const details = [];
    if (sourceCoverage.usableSourceCategories <= 1) details.push('single-source evidence');
    if (!hasHighConfidenceBuyingSignal(signals)) details.push('no high-confidence buying signal');
    if (sourceCoverage.disabledProviders.length > 0) details.push(`disabled provider: ${sourceCoverage.disabledProviders.join(', ')}`);
    return `Draft blocked: score ${score} is below the default draft threshold of 75${details.length ? ` (${details.join('; ')})` : ''}.`;
  }
  if (company.oversight?.verdict && !['approve', 'needs_human_check', 'skipped'].includes(company.oversight.verdict)) {
    return `Draft blocked: oversight verdict is ${company.oversight.verdict}.`;
  }
  if (signals.length === 0) {
    return 'Draft blocked: no structured facts were extracted from the evidence.';
  }
  if (contacts.length === 0) {
    return 'Draft blocked or delayed: no contacts have been discovered yet.';
  }
  return 'Draft has not been generated yet. Refresh research or generate a draft after reviewing qualification.';
}

function hasHighConfidenceBuyingSignal(signals: Signal[]) {
  return signals.some(
    (signal) =>
      ['buying_signal', 'hiring_signal'].includes(signal.factType || '') &&
      (signal.confidence ?? 0) >= 0.55 &&
      (signal.relevanceScore ?? 0) >= 0.5,
  );
}

function stepLabel(step?: string) {
  const labels: Record<string, string> = {
    crawl: 'crawling website',
    enrich_sources: 'enriching sources',
    extract_facts: 'extracting facts',
    profile: 'building company profile',
    signals: 'extracting structured signals',
    score: 'scoring opportunity',
    contact_discovery: 'finding contacts',
    oversight: 'running oversight',
    draft: 'drafting outreach',
    completed: 'completed',
  };
  return labels[step || ''] || step || 'queued';
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="neo-card">
      <h2 className="text-xl font-semibold mb-4 text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function TagRow({ values, emptyLabel, tone = 'default' }: { values: string[]; emptyLabel: string; tone?: 'default' | 'risk' }) {
  if (values.length === 0) {
    return emptyLabel ? <p className="text-sm text-gray-500 italic mt-3">{emptyLabel}</p> : null;
  }

  const classes =
    tone === 'risk'
      ? 'bg-red-50 text-red-700 border-red-100'
      : 'bg-blue-50 text-blue-700 border-blue-100';

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {values.map((value) => (
        <span key={value} className={`text-xs border rounded-full px-2 py-1 ${classes}`}>
          {value}
        </span>
      ))}
    </div>
  );
}
