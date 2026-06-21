'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

type Campaign = {
  _id: string;
  name: string;
  tone?: string;
  channel?: string;
};

type Company = {
  _id: string;
  name: string;
  website?: string;
  status: string;
  fitScore?: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  oversight?: { verdict?: string };
  lastResearchedAt?: string;
  lastResearchError?: string;
};

type Draft = {
  _id: string;
  companyId?: string | { _id?: string } | null;
  status: string;
  selectedAngle?: string;
};

type Signal = {
  _id: string;
  companyId: string;
  signalType: string;
  fact?: string;
  description?: string;
  relevanceScore?: number;
};

type ImportResult = {
  imported: number;
  skipped: number;
};

type QueueResult = {
  queued: number;
  skipped: number;
};

type ResearchJob = {
  _id: string;
  companyId: string;
  status: string;
  currentStep?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
};

const workflowLabels = [
  'Outbound profile',
  'Configure campaign',
  'Add companies',
  'Find websites',
  'Enrich sources',
  'Extract facts',
  'Score',
  'Contacts',
  'Review',
];

function draftCompanyId(draft: Draft): string {
  if (!draft.companyId) return '';
  return typeof draft.companyId === 'string' ? draft.companyId : draft.companyId._id ?? '';
}

function statusTone(status: string): string {
  if (status === 'draft_ready') return 'text-emerald-700';
  if (status === 'researching') return 'text-indigo-700';
  if (status === 'research_pending') return 'text-amber-700';
  if (status === 'researched') return 'text-blue-700';
  if (status === 'failed' || status === 'missing_info') return 'text-red-700';
  return 'text-slate-600';
}

export default function CampaignDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.id;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [researchJobs, setResearchJobs] = useState<ResearchJob[]>([]);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [pendingCompanyIds, setPendingCompanyIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [quickFilter, setQuickFilter] = useState('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [campaignData, companyData, draftData, jobData] = await Promise.all([
        apiFetch<Campaign>(`/campaigns/${campaignId}`),
        apiFetch<Company[]>(`/companies?campaignId=${campaignId}`),
        apiFetch<Draft[]>(`/campaigns/${campaignId}/drafts`),
        apiFetch<ResearchJob[]>(`/campaigns/${campaignId}/research-jobs`),
      ]);

      setCampaign(campaignData);
      setCompanies(companyData);
      setDrafts(draftData);
      setResearchJobs(jobData);

      const signalGroups = await Promise.all(
        companyData.map((company) =>
          apiFetch<Signal[]>(`/companies/${company._id}/signals`).catch(() => []),
        ),
      );
      setSignals(signalGroups.flat());
    } catch (e) {
      console.error(e);
      setNotice('Could not load campaign data.');
    }
  }, [campaignId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const hasActiveJobs = companies.some((company) =>
      ['researching', 'research_pending'].includes(company.status),
    );
    if (!hasActiveJobs) return;
    const intervalId = window.setInterval(() => void fetchData(), 3000);
    return () => window.clearInterval(intervalId);
  }, [companies, fetchData]);

  const analytics = useMemo(() => {
    const scoredCompanies = companies.filter((company) => typeof company.fitScore === 'number');
    const qualified = companies.filter((company) => (company.fitScore ?? 0) >= 50).length;
    const readyForReview = companies.filter((company) => ['draft_ready', 'researched'].includes(company.status)).length;
    const averageScore =
      scoredCompanies.length === 0
        ? 0
        : Math.round(scoredCompanies.reduce((sum, company) => sum + (company.fitScore ?? 0), 0) / scoredCompanies.length);

    return {
      imported: companies.length,
      missingWebsites: companies.filter((company) => !company.website || company.status === 'missing_info').length,
      researching: companies.filter((company) => ['researching', 'research_pending'].includes(company.status)).length,
      researched: companies.filter((company) => ['researched', 'draft_ready', 'approved', 'rejected'].includes(company.status)).length,
      qualified,
      readyForReview,
      draftsGenerated: drafts.length,
      approvedDrafts: drafts.filter((draft) => draft.status === 'approved').length,
      averageScore,
    };
  }, [companies, drafts]);

  const latestJobByCompany = useMemo(() => {
    const jobs = new Map<string, ResearchJob>();
    for (const job of researchJobs) {
      const current = jobs.get(job.companyId);
      const jobTime = new Date(job.createdAt ?? job.startedAt ?? 0).getTime();
      const currentTime = new Date(current?.createdAt ?? current?.startedAt ?? 0).getTime();
      if (!current || jobTime > currentTime) jobs.set(job.companyId, job);
    }
    return jobs;
  }, [researchJobs]);

  const activeJobs = useMemo(
    () => researchJobs.filter((job) => ['queued', 'running'].includes(job.status)),
    [researchJobs],
  );

  const isBackendWorking = isQueueing || isEnriching || isDiscovering || activeJobs.length > 0;

  const currentStepIndex = useMemo(() => {
    const activeStep = activeJobs[0]?.currentStep;
    if (activeStep) {
      const stepMap: Record<string, number> = {
        crawl: 3,
        linkedin: 4,
        enrich_sources: 4,
        extract_facts: 5,
        signals: 5,
        score: 6,
        contact_discovery: 7,
        oversight: 8,
        draft: 8,
      };
      if (typeof stepMap[activeStep] === 'number') return stepMap[activeStep];
    }
    if (analytics.imported === 0) return 1;
    if (analytics.missingWebsites > 0) return 2;
    if (analytics.researched === 0 || analytics.researching > 0) return 4;
    if (analytics.readyForReview > 0) return 8;
    if (analytics.approvedDrafts > 0) return 8;
    return 8;
  }, [activeJobs, analytics]);

  const nextAction = useMemo(() => {
    if (analytics.imported === 0) {
      return {
        title: 'Add companies',
        body: 'Import a CSV or discover companies from configured sources.',
        primary: 'Import CSV',
        secondary: 'Discover',
      };
    }
    if (analytics.missingWebsites > 0) {
      return {
        title: 'Find missing websites',
        body: `${analytics.missingWebsites} companies need a website before research can run.`,
        primary: 'Fill Missing Info',
        secondary: '',
      };
    }
    if (analytics.researched === 0 || analytics.researching > 0) {
      return {
        title: analytics.researching > 0 ? 'Research is running' : 'Run research',
        body: analytics.researching > 0 ? 'The pipeline is crawling, extracting facts, scoring, and preparing review packages.' : 'Start the qualification pipeline for all companies with websites.',
        primary: analytics.researching > 0 ? 'Refresh' : 'Run Research',
        secondary: '',
      };
    }
    if (analytics.readyForReview > 0) {
      return {
        title: 'Review qualified leads',
        body: 'Open companies with evidence, oversight, contacts, and drafts ready for human approval.',
        primary: 'Review Leads',
        secondary: 'Review Drafts',
      };
    }
    return {
      title: 'Approve outreach',
      body: 'Review the latest drafts, approve the best ones, then send or export from the outreach queue.',
      primary: 'Review Drafts',
      secondary: 'Outreach Directory',
    };
  }, [analytics]);

  const visibleCompanies = useMemo(
    () =>
      companies.filter((company) => {
        if (statusFilter !== 'all' && company.status !== statusFilter) return false;
        if (priorityFilter !== 'all' && company.priority !== priorityFilter) return false;
        if (quickFilter === 'missing_website' && company.website) return false;
        if (quickFilter === 'draft_ready' && company.status !== 'draft_ready') return false;
        if (quickFilter === 'failed' && company.status !== 'failed') return false;
        if (quickFilter === 'qualified' && (company.fitScore ?? 0) < 50) return false;
        if (quickFilter === 'needs_oversight' && ((company.fitScore ?? 0) < 70 || company.oversight?.verdict)) return false;
        if (quickFilter === 'ready_for_review' && !['draft_ready', 'researched'].includes(company.status)) return false;
        if (quickFilter === 'rejected_by_evidence' && company.oversight?.verdict !== 'reject') return false;
        return true;
      }),
    [companies, statusFilter, priorityFilter, quickFilter],
  );

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await apiFetch<ImportResult>(`/companies/import/${campaignId}`, {
        method: 'POST',
        body: formData,
      });
      setNotice(`Imported ${result.imported}; skipped ${result.skipped}.`);
      setIsImportOpen(false);
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFillMissingInfo = async () => {
    if (isBackendWorking) return;
    setIsEnriching(true);
    try {
      const result = await apiFetch<QueueResult>(`/companies/enrich/${campaignId}`, { method: 'POST' });
      setNotice(`Queued ${result.queued} companies for enrichment.`);
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Failed to enqueue enrichment jobs.');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleRunResearch = async () => {
    if (isBackendWorking) return;
    setIsQueueing(true);
    try {
      const result = await apiFetch<QueueResult>(`/campaigns/${campaignId}/research-all`, { method: 'POST' });
      setNotice(`Queued ${result.queued} companies for research; skipped ${result.skipped}.`);
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Failed to enqueue campaign research.');
    } finally {
      setIsQueueing(false);
    }
  };

  const handleDiscoverCompanies = async () => {
    if (isBackendWorking) return;
    setIsDiscovering(true);
    try {
      const result = await apiFetch<ImportResult>(`/campaigns/${campaignId}/discover-companies`, { method: 'POST' });
      setNotice(`Discovered ${result.imported}; skipped ${result.skipped}.`);
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Failed to discover companies from configured sources.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleResearchCompany = async (companyId: string) => {
    if (pendingCompanyIds.has(companyId)) return;
    setPendingCompanyIds((current) => new Set(current).add(companyId));
    try {
      await apiFetch(`/companies/${companyId}/research`, { method: 'POST' });
      setNotice('Queued company research.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not queue company research.');
    } finally {
      setPendingCompanyIds((current) => {
        const next = new Set(current);
        next.delete(companyId);
        return next;
      });
    }
  };

  const handleEnrichCompanyWebsite = async (companyId: string) => {
    if (pendingCompanyIds.has(companyId)) return;
    setPendingCompanyIds((current) => new Set(current).add(companyId));
    try {
      await apiFetch(`/companies/${companyId}/enrich-website`, { method: 'POST' });
      setNotice('Queued website re-check.');
      await fetchData();
    } catch (e) {
      console.error(e);
      setNotice('Could not queue website re-check.');
    } finally {
      setPendingCompanyIds((current) => {
        const next = new Set(current);
        next.delete(companyId);
        return next;
      });
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!window.confirm(`Delete ${companyName}? This removes it from this campaign.`)) return;
    try {
      await apiFetch(`/companies/${companyId}`, { method: 'DELETE' });
      setCompanies((current) => current.filter((company) => company._id !== companyId));
      setDrafts((current) => current.filter((draft) => draftCompanyId(draft) !== companyId));
      setSignals((current) => current.filter((signal) => signal.companyId !== companyId));
      setNotice('Company deleted.');
    } catch (e) {
      console.error(e);
      setNotice('Could not delete company.');
    }
  };

  const performPrimaryAction = () => {
    if (nextAction.primary === 'Import CSV') setIsImportOpen(true);
    if (nextAction.primary === 'Fill Missing Info') void handleFillMissingInfo();
    if (nextAction.primary === 'Run Research') void handleRunResearch();
    if (nextAction.primary === 'Refresh') void fetchData();
    if (nextAction.primary === 'Review Leads') setQuickFilter('ready_for_review');
    if (nextAction.primary === 'Review Drafts') window.location.href = '/drafts';
  };

  const performSecondaryAction = () => {
    if (nextAction.secondary === 'Discover') void handleDiscoverCompanies();
    if (nextAction.secondary === 'Review Drafts') window.location.href = '/drafts';
    if (nextAction.secondary === 'Outreach Directory') window.location.href = '/outreach';
  };

  const topSignalForCompany = (companyId: string): Signal | undefined =>
    signals
      .filter((signal) => signal.companyId === companyId)
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))[0];

  const draftStatusForCompany = (companyId: string): string =>
    drafts.find((draft) => draftCompanyId(draft) === companyId)?.status ?? '-';

  if (!campaign) return <div className="neo-container">Loading...</div>;

  return (
    <div className="neo-page">
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="neo-card w-full max-w-md">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Import Companies</h2>
                <p className="mt-1 text-sm text-slate-500">Upload a CSV with company names, websites, LinkedIn IDs, and notes.</p>
              </div>
              <button onClick={() => setIsImportOpen(false)} className="neo-button px-3">Close</button>
            </div>
            <div
              className="neo-inset cursor-pointer p-10 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files.item(0);
                if (file) void handleFileUpload(file);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className={isUploading ? 'font-semibold text-blue-700' : 'text-slate-500'}>
                {isUploading ? 'Uploading...' : 'Drop CSV here or click to browse'}
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.item(0);
                  if (file) void handleFileUpload(file);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <main className="neo-container space-y-6">
        <section className="neo-card">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <Link href="/campaigns" className="text-sm font-semibold text-slate-500 hover:text-slate-800">Campaigns</Link>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{campaign.name}</h1>
              <p className="mt-2 text-sm text-slate-500">{campaign.channel ?? 'email'} / {campaign.tone ?? 'technical'} workflow</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/profile" className="neo-button">Outbound Profile</Link>
              <Link href="/drafts" className="neo-button">Draft Queue</Link>
              <Link href="/outreach" className="neo-button">Outreach Directory</Link>
            </div>
          </div>
          {notice && <div className="neo-inset mt-5 px-4 py-3 text-sm text-slate-700">{notice}</div>}
          {isBackendWorking && (
            <div className="neo-inset mt-5 flex flex-col gap-3 px-4 py-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <span className="neo-spinner" />
                <div>
                  <div className="font-bold text-slate-900">Backend pipeline is working</div>
                  <div className="text-xs text-slate-500">
                    Crawling, extracting facts, scoring, finding contacts, or drafting. Controls are locked to avoid duplicate LLM/API calls.
                  </div>
                </div>
              </div>
              <button onClick={() => void fetchData()} className="neo-button px-3 py-1.5">Refresh status</button>
            </div>
          )}
        </section>

        <section className="neo-card">
          <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold">Linear Lead Flow</h2>
              <p className="mt-1 text-sm text-slate-500">Complete each stage from left to right. The highlighted stage is the next useful action.</p>
            </div>
            <div className="neo-pill">{activeJobs.length > 0 ? `${activeJobs.length} active jobs` : 'Ready'}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-9">
            {workflowLabels.map((label, index) => {
              const isActive = index === currentStepIndex;
              const isDone = index < currentStepIndex;
              return (
                <div key={label} className={`neo-card-soft ${isActive ? 'ring-2 ring-blue-500/60' : ''}`}>
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${isDone ? 'bg-emerald-100 text-emerald-700' : isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {index + 1}
                  </div>
                  <div className="text-sm font-semibold text-slate-800">{label}</div>
                </div>
              );
            })}
          </div>
          <div className="neo-inset mt-5 grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h3 className="font-bold text-slate-950">{nextAction.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{nextAction.body}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={performPrimaryAction} disabled={isBackendWorking && nextAction.primary !== 'Refresh'} className="neo-button-primary">
                {isBackendWorking && nextAction.primary !== 'Refresh' ? <><span className="neo-spinner-invert mr-2" />Working...</> : nextAction.primary}
              </button>
              {nextAction.secondary && (
                <button onClick={performSecondaryAction} disabled={isBackendWorking} className="neo-button">
                  {isDiscovering ? <><span className="neo-spinner mr-2" />Discovering...</> : nextAction.secondary}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Companies" value={analytics.imported} />
          <Metric label="Missing Websites" value={analytics.missingWebsites} />
          <Metric label="Qualified" value={analytics.qualified} />
          <Metric label="Avg Score" value={analytics.averageScore} />
          <Metric label="Researched" value={analytics.researched} />
          <Metric label="Ready Review" value={analytics.readyForReview} />
          <Metric label="Drafts" value={analytics.draftsGenerated} />
          <Metric label="Approved" value={analytics.approvedDrafts} />
        </section>

        <section className="neo-card">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-xl font-bold">Lead Queue</h2>
              <p className="text-sm text-slate-500">{visibleCompanies.length} of {companies.length} companies shown</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="neo-select w-auto">
                <option value="all">All statuses</option>
                <option value="missing_info">Missing info</option>
                <option value="imported">Imported</option>
                <option value="research_pending">Research pending</option>
                <option value="researching">Researching</option>
                <option value="researched">Researched</option>
                <option value="draft_ready">Draft ready</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="failed">Failed</option>
              </select>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="neo-select w-auto">
                <option value="all">All priorities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select value={quickFilter} onChange={(e) => setQuickFilter(e.target.value)} className="neo-select w-auto">
                <option value="all">All leads</option>
                <option value="missing_website">Missing website</option>
                <option value="draft_ready">Draft ready</option>
                <option value="qualified">Qualified</option>
                <option value="ready_for_review">Ready for review</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="neo-table min-w-[1040px]">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Website</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Score</th>
                  <th className="px-4 py-2">Top Fact</th>
                  <th className="px-4 py-2">Draft</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCompanies.length === 0 ? (
                  <tr>
                    <td className="neo-inset px-6 py-12 text-center text-sm text-slate-500" colSpan={7}>
                      No leads match the current filters.
                    </td>
                  </tr>
                ) : (
                  visibleCompanies.map((company) => {
                    const signal = topSignalForCompany(company._id);
                    const latestJob = latestJobByCompany.get(company._id);
                    const companyIsActive = ['researching', 'research_pending'].includes(company.status) || pendingCompanyIds.has(company._id) || ['queued', 'running'].includes(latestJob?.status ?? '');
                    return (
                      <tr key={company._id} className="neo-table-row">
                        <td className="rounded-l-xl px-4 py-4">
                          <div className="font-semibold text-slate-950">{company.name}</div>
                          {company.lastResearchError && <div className="mt-1 max-w-xs truncate text-xs text-red-700">{company.lastResearchError}</div>}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {company.website ? (
                            <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                              {company.website.replace(/^https?:\/\//, '')}
                            </a>
                          ) : (
                            <span className="text-slate-400">Missing</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className={`text-sm font-semibold ${statusTone(company.status)}`}>{company.status}</div>
                          {latestJob && <div className="text-xs text-slate-500">{latestJob.status}{latestJob.currentStep ? ` / ${latestJob.currentStep}` : ''}</div>}
                          {companyIsActive && <div className="mt-1 flex items-center gap-2 text-xs text-blue-700"><span className="neo-spinner" />Working</div>}
                          {latestJob?.error && <div className="max-w-xs truncate text-xs text-red-700">{latestJob.error}</div>}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">{company.fitScore ?? '-'} {company.priority ? `/ ${company.priority}` : ''}</td>
                        <td className="max-w-xs truncate px-4 py-4 text-sm text-slate-700" title={signal?.fact || signal?.description}>
                          {signal?.fact || signal?.description || signal?.signalType || '-'}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">{draftStatusForCompany(company._id)}</td>
                        <td className="rounded-r-xl px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => void handleResearchCompany(company._id)}
                              disabled={!company.website || companyIsActive}
                              className="neo-button px-3 py-1.5"
                            >
                              {companyIsActive ? 'Working' : 'Research'}
                            </button>
                            {(!company.website || company.status === 'missing_info') && (
                              <button
                                onClick={() => void handleEnrichCompanyWebsite(company._id)}
                                disabled={companyIsActive}
                                className="neo-button-warning px-3 py-1.5"
                              >
                                Website
                              </button>
                            )}
                            <Link href={`/companies/${company._id}`} className="neo-button-primary px-3 py-1.5">Open</Link>
                            <button disabled={companyIsActive} onClick={() => void handleDeleteCompany(company._id, company.name)} className="neo-button-danger px-3 py-1.5">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="neo-card-soft">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-slate-950">{value}</div>
    </div>
  );
}
