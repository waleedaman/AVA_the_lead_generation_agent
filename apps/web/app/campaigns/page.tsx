import Link from 'next/link';
import { apiFetch } from '../lib/api';

export const dynamic = 'force-dynamic';

type Campaign = {
  _id: string;
  name: string;
  tone?: string;
  channel?: string;
  createdAt?: string;
};

async function getCampaigns(): Promise<Campaign[]> {
  try {
    return await apiFetch<Campaign[]>('/campaigns', { cache: 'no-store' });
  } catch (e) {
    console.error('Failed to fetch campaigns', e);
    return [];
  }
}

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();
  const latest = campaigns[0];

  return (
    <main className="neo-page">
      <div className="neo-container space-y-6">
        <section className="neo-card">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <div className="neo-pill mb-4 w-fit">Aegis SafeForge pipeline</div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-950">Lead Generation Console</h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                Work one campaign from left to right: configure the industry profile, add companies, enrich websites, run research, review evidence, then approve outreach.
              </p>
            </div>
            <div className="neo-inset p-4">
              <div className="text-sm font-semibold text-slate-500">Next step</div>
              <div className="mt-2 text-xl font-bold text-slate-950">
                {latest ? 'Continue the active campaign' : 'Create your first campaign'}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {latest && <Link href={`/campaigns/${latest._id}`} className="neo-button-primary">Continue Flow</Link>}
                <Link href="/profile" className="neo-button">Outbound Profile</Link>
                <Link href="/campaigns/new" className="neo-button">New Campaign</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          {['1. Profile', '2. Configure', '3. Add leads', '4. Research', '5. Review'].map((label) => (
            <div key={label} className="neo-card-soft">
              <div className="text-sm font-bold text-slate-800">{label}</div>
              <div className="mt-2 text-xs text-slate-500">
                {label.includes('Profile') && 'Define your company, product, proof points, and CTA.'}
                {label.includes('Configure') && 'Choose an industry preset and buying signals.'}
                {label.includes('Add') && 'Import CSV or discover from configured sources.'}
                {label.includes('Research') && 'Extract facts, score opportunities, and find contacts.'}
                {label.includes('Review') && 'Approve drafts only after evidence review.'}
              </div>
            </div>
          ))}
        </section>

        <section className="neo-card">
          <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Campaigns</h2>
              <p className="text-sm text-slate-500">{campaigns.length} configured workspaces</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/profile" className="neo-button">Outbound Profile</Link>
              <Link href="/outreach" className="neo-button">Outreach Directory</Link>
              <Link href="/campaigns/new" className="neo-button-primary">Create Campaign</Link>
            </div>
          </div>

          {campaigns.length === 0 ? (
            <div className="neo-inset p-10 text-center">
              <h3 className="text-lg font-bold text-slate-900">No campaigns yet</h3>
              <p className="mt-2 text-sm text-slate-500">Start with an industry preset, then the app will guide the rest of the flow.</p>
              <Link href="/campaigns/new" className="neo-button-primary mt-5">Create Campaign</Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {campaigns.map((camp) => (
                <Link key={camp._id} href={`/campaigns/${camp._id}`} className="neo-card-soft block transition hover:-translate-y-0.5">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">{camp.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {camp.channel ?? 'email'} / {camp.tone ?? 'technical'}
                        {camp.createdAt ? ` / created ${new Date(camp.createdAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span className="neo-button-primary w-fit">Open Flow</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
