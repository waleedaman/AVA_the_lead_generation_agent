'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';

type ProductProfile = {
  _id?: string;
  key?: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
  companyName: string;
  productName: string;
  website: string;
  productPageUrl: string;
  description: string;
  valueProposition: string;
  painPointsSolved: string[];
  differentiators: string[];
  proofPoints: string[];
  complianceClaimsToAvoid: string[];
  senderName: string;
  senderRole: string;
  defaultCta: string;
};

const emptyProfile: ProductProfile = {
  companyName: '',
  productName: '',
  website: '',
  productPageUrl: '',
  description: '',
  valueProposition: '',
  painPointsSolved: [],
  differentiators: [],
  proofPoints: [],
  complianceClaimsToAvoid: [],
  senderName: '',
  senderRole: '',
  defaultCta: '',
};

export default function ProductProfilePage() {
  const [profile, setProfile] = useState<ProductProfile>(emptyProfile);
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiFetch<ProductProfile>('/product-profile')
      .then((data) => setProfile({ ...emptyProfile, ...data }))
      .catch((error) => {
        console.error(error);
        setNotice('Could not load the product profile.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const readiness = useMemo(() => {
    const checks = [
      Boolean(profile.companyName.trim()),
      Boolean(profile.productName.trim()),
      Boolean(profile.description.trim()),
      Boolean(profile.valueProposition.trim()),
      Boolean(profile.senderName.trim()),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [profile]);

  const updateField = <K extends keyof ProductProfile>(key: K, value: ProductProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = async () => {
    setIsSaving(true);
    setNotice('');
    try {
      const saved = await apiFetch<ProductProfile>('/product-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editableProfilePayload(profile)),
      });
      setProfile({ ...emptyProfile, ...saved });
      setNotice('Profile saved. Future drafts will use this context.');
    } catch (error) {
      console.error(error);
      setNotice('Could not save the profile.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="neo-page">
        <div className="neo-container">
          <div className="neo-card flex items-center gap-3">
            <span className="neo-spinner" />
            <span className="text-sm font-semibold text-slate-600">Loading profile...</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="neo-page">
      <div className="neo-container space-y-6">
        <section className="neo-card">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <Link href="/campaigns" className="text-sm font-semibold text-slate-500 hover:text-slate-800">
                Campaigns
              </Link>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Outbound Profile</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Define the company, product, proof points, and claims the agent should use when composing outreach.
              </p>
            </div>
            <div className="neo-inset min-w-52 p-4">
              <div className="text-xs font-semibold uppercase text-slate-500">Draft context readiness</div>
              <div className="mt-2 text-3xl font-bold text-slate-950">{readiness}%</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-300">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${readiness}%` }} />
              </div>
            </div>
          </div>
          {notice && <div className="neo-inset mt-4 px-4 py-3 text-sm text-slate-600">{notice}</div>}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="neo-card space-y-4">
            <h2 className="text-xl font-bold text-slate-950">Company And Product</h2>
            <Field label="Company name" value={profile.companyName} onChange={(value) => updateField('companyName', value)} />
            <Field label="Product name" value={profile.productName} onChange={(value) => updateField('productName', value)} />
            <Field label="Company website" value={profile.website} onChange={(value) => updateField('website', value)} />
            <Field label="Product page" value={profile.productPageUrl} onChange={(value) => updateField('productPageUrl', value)} />
            <TextArea label="What the product does" value={profile.description} onChange={(value) => updateField('description', value)} />
            <TextArea label="Core value proposition" value={profile.valueProposition} onChange={(value) => updateField('valueProposition', value)} />
          </div>

          <div className="neo-card space-y-4">
            <h2 className="text-xl font-bold text-slate-950">Outbound Voice</h2>
            <Field label="Sender name" value={profile.senderName} onChange={(value) => updateField('senderName', value)} />
            <Field label="Sender role" value={profile.senderRole} onChange={(value) => updateField('senderRole', value)} />
            <TextArea label="Default CTA" value={profile.defaultCta} onChange={(value) => updateField('defaultCta', value)} />
            <ListField label="Pain points solved" values={profile.painPointsSolved} onChange={(value) => updateField('painPointsSolved', value)} />
            <ListField label="Differentiators" values={profile.differentiators} onChange={(value) => updateField('differentiators', value)} />
            <ListField label="Proof points" values={profile.proofPoints} onChange={(value) => updateField('proofPoints', value)} />
            <ListField label="Claims to avoid" values={profile.complianceClaimsToAvoid} onChange={(value) => updateField('complianceClaimsToAvoid', value)} />
          </div>
        </section>

        <section className="neo-card flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Ready for campaigns</h2>
            <p className="mt-1 text-sm text-slate-500">Saved profile context is included in future draft-generation prompts.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/campaigns" className="neo-button">Back to Campaigns</Link>
            <button onClick={saveProfile} disabled={isSaving} className="neo-button-primary">
              {isSaving ? <><span className="neo-spinner-invert mr-2" />Saving...</> : 'Save Profile'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function editableProfilePayload(profile: ProductProfile) {
  return {
    companyName: profile.companyName,
    productName: profile.productName,
    website: profile.website,
    productPageUrl: profile.productPageUrl,
    description: profile.description,
    valueProposition: profile.valueProposition,
    painPointsSolved: profile.painPointsSolved,
    differentiators: profile.differentiators,
    proofPoints: profile.proofPoints,
    complianceClaimsToAvoid: profile.complianceClaimsToAvoid,
    senderName: profile.senderName,
    senderRole: profile.senderRole,
    defaultCta: profile.defaultCta,
  };
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase text-slate-500">{label}</span>
      <input className="neo-input" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase text-slate-500">{label}</span>
      <textarea className="neo-input min-h-28" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ListField({ label, values, onChange }: { label: string; values: string[]; onChange: (value: string[]) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase text-slate-500">{label}</span>
      <textarea
        className="neo-input min-h-24"
        value={(values ?? []).join('\n')}
        onChange={(event) => onChange(event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))}
      />
    </label>
  );
}
