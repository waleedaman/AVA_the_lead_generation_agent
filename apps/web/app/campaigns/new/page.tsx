'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

const presets = {
  blank: {
    targetIndustries: '',
    targetRoles: '',
    regions: '',
    keywords: '',
    exclusionKeywords: '',
    discoverySources: [
      'website:https://www.dspace.com/en/inc/home/products.cfm',
      'website:https://www.dspace.com/en/inc/home/applicationfields.cfm',
      'website:https://www.dspace.com/en/inc/home/career.cfm',
      'search:dSPACE ISO 26262',
      'search:dSPACE ADAS HIL SIL',
      'jobs:dSPACE functional safety engineer',
    ].join('\n'),
    offer: 'Aegis SafeForge helps engineering teams use AI-assisted workflows for compliance-oriented engineering work.',
    industryProfile: {
      targetCompanyTypes: [],
      buyingSignals: [],
      negativeSignals: [],
      targetRoles: [],
      regions: [],
      minimumScoreForContacts: 50,
      minimumScoreForOversight: 70,
      minimumScoreForDraft: 75,
    },
  },
  automotive: {
    targetIndustries: 'automotive, embedded systems, functional safety, engineering consulting',
    targetRoles: 'Functional Safety Manager, Head of Safety, Systems Engineering Manager, Engineering Director, CTO',
    regions: 'Germany, DACH',
    keywords: 'ISO 26262, HARA, TARA, ADAS, safety engineer hiring, systems engineer hiring',
    exclusionKeywords: 'company_size < 10, no engineering team',
    discoverySources: '',
    offer: 'Aegis SafeForge helps engineering teams reduce functional safety, cybersecurity, and requirements traceability effort with AI-assisted workflows.',
    industryProfile: {
      targetCompanyTypes: [
        'consultancy',
        'tier 1 supplier',
        'engineering service provider',
        'simulation and validation',
        'testing tools provider',
        'embedded software tools',
      ],
      buyingSignals: ['ISO 26262', 'HARA', 'TARA', 'ADAS', 'safety engineer hiring', 'systems engineer hiring'],
      negativeSignals: ['company_size < 10', 'no engineering team'],
      targetRoles: ['Functional Safety Manager', 'Head of Safety', 'Systems Engineering Manager', 'Engineering Director', 'CTO'],
      regions: ['Germany', 'DACH'],
      minimumScoreForContacts: 50,
      minimumScoreForOversight: 60,
      minimumScoreForDraft: 75,
    },
  },
  medical: {
    targetIndustries: 'medical devices, healthtech, regulated software',
    targetRoles: 'Head of Quality, Software Engineering Manager, Risk Manager, CTO',
    regions: 'Germany, DACH',
    keywords: 'IEC 62304, ISO 14971, safety engineer, risk analysis, software lifecycle',
    exclusionKeywords: 'no software team, distributor only',
    discoverySources: '',
    offer: 'Aegis SafeForge helps regulated engineering teams prepare source-backed risk and compliance workflows with less manual coordination.',
    industryProfile: {
      targetCompanyTypes: ['medical device manufacturer', 'engineering consultancy', 'regulated software provider'],
      buyingSignals: ['IEC 62304', 'ISO 14971', 'safety engineer', 'risk analysis', 'software lifecycle'],
      negativeSignals: ['no software team', 'distributor only'],
      targetRoles: ['Head of Quality', 'Software Engineering Manager', 'Risk Manager', 'CTO'],
      regions: ['Germany', 'DACH'],
      minimumScoreForContacts: 50,
      minimumScoreForOversight: 70,
      minimumScoreForDraft: 75,
    },
  },
  rail: {
    targetIndustries: 'rail, railway systems, signalling, transportation engineering',
    targetRoles: 'Safety Manager, RAMS Manager, Systems Engineering Manager, Engineering Director',
    regions: 'Germany, DACH',
    keywords: 'EN 50126, EN 50128, EN 50129, RAMS, safety case',
    exclusionKeywords: 'operator only, no engineering team',
    discoverySources: '',
    offer: 'Aegis SafeForge helps safety-critical engineering teams organize evidence, risk analysis, and compliance workflows with AI assistance.',
    industryProfile: {
      targetCompanyTypes: ['rail engineering consultancy', 'signalling supplier', 'systems integrator'],
      buyingSignals: ['EN 50126', 'EN 50128', 'EN 50129', 'RAMS', 'safety case'],
      negativeSignals: ['operator only', 'no engineering team'],
      targetRoles: ['Safety Manager', 'RAMS Manager', 'Systems Engineering Manager', 'Engineering Director'],
      regions: ['Germany', 'DACH'],
      minimumScoreForContacts: 50,
      minimumScoreForOversight: 70,
      minimumScoreForDraft: 75,
    },
  },
  aerospace: {
    targetIndustries: 'aerospace, avionics, defense engineering',
    targetRoles: 'Safety Manager, Systems Engineering Manager, Software Engineering Manager, CTO',
    regions: 'Germany, DACH',
    keywords: 'ARP4761, DO-178C, DO-254, safety assessment, certification evidence',
    exclusionKeywords: 'no software team, distributor only',
    discoverySources: '',
    offer: 'Aegis SafeForge helps safety-critical engineering teams structure evidence, requirements, and risk workflows with AI assistance.',
    industryProfile: {
      targetCompanyTypes: ['aerospace supplier', 'avionics engineering provider', 'systems engineering consultancy'],
      buyingSignals: ['ARP4761', 'DO-178C', 'DO-254', 'safety assessment', 'certification evidence'],
      negativeSignals: ['no software team', 'distributor only'],
      targetRoles: ['Safety Manager', 'Systems Engineering Manager', 'Software Engineering Manager', 'CTO'],
      regions: ['Germany', 'DACH'],
      minimumScoreForContacts: 50,
      minimumScoreForOversight: 70,
      minimumScoreForDraft: 75,
    },
  },
};

export default function NewCampaignPage() {
  const router = useRouter();
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof presets>('automotive');
  const [formData, setFormData] = useState({
    name: '',
    targetIndustries: presets.automotive.targetIndustries,
    targetRoles: presets.automotive.targetRoles,
    regions: presets.automotive.regions,
    keywords: presets.automotive.keywords,
    exclusionKeywords: presets.automotive.exclusionKeywords,
    discoverySources: presets.automotive.discoverySources,
    offer: presets.automotive.offer,
    cta: 'Would it be useful to see a short demo?',
    tone: 'technical',
    channel: 'email',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Split string inputs into arrays where appropriate
    const preset = presets[selectedPreset];
    const targetIndustries = formData.targetIndustries.split(',').map(s => s.trim()).filter(Boolean);
    const targetRoles = formData.targetRoles.split(',').map(s => s.trim()).filter(Boolean);
    const regions = formData.regions.split(',').map(s => s.trim()).filter(Boolean);
    const keywords = formData.keywords.split(',').map(s => s.trim()).filter(Boolean);
    const exclusionKeywords = formData.exclusionKeywords.split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
      name: formData.name,
      targetIndustries,
      targetRoles,
      regions,
      keywords,
      exclusionKeywords,
      offer: formData.offer,
      cta: formData.cta,
      tone: formData.tone,
      channel: formData.channel,
      industryProfile: {
        ...preset.industryProfile,
        targetRoles,
        regions,
        buyingSignals: keywords,
        negativeSignals: exclusionKeywords,
        discoverySources: formData.discoverySources.split('\n').map(s => s.trim()).filter(Boolean),
      },
    };

    try {
      await apiFetch('/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      router.push('/campaigns');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Create New Campaign</h1>
        <Link href="/campaigns" className="text-gray-500 hover:text-gray-700">Cancel</Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6 border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700">Industry Preset</label>
          <select
            value={selectedPreset}
            onChange={(e) => {
              const presetName = e.target.value as keyof typeof presets;
              const preset = presets[presetName];
              setSelectedPreset(presetName);
              setFormData((current) => ({
                ...current,
                targetIndustries: preset.targetIndustries,
                targetRoles: preset.targetRoles,
                regions: preset.regions,
                keywords: preset.keywords,
                exclusionKeywords: preset.exclusionKeywords,
                discoverySources: preset.discoverySources,
                offer: preset.offer,
              }));
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 px-3 py-2"
          >
            <option value="automotive">Automotive</option>
            <option value="medical">Medical Devices</option>
            <option value="rail">Rail</option>
            <option value="aerospace">Aerospace</option>
            <option value="blank">Blank</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Campaign Name</label>
          <input 
            type="text" 
            name="name" 
            required 
            value={formData.name} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 px-3 py-2" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Target Industries (comma-separated)</label>
          <input 
            type="text" 
            name="targetIndustries" 
            value={formData.targetIndustries} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 px-3 py-2" 
            placeholder="e.g. automotive, functional safety"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Target Roles (comma-separated)</label>
          <input 
            type="text" 
            name="targetRoles" 
            value={formData.targetRoles} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 px-3 py-2" 
            placeholder="e.g. CEO, VP of Sales, CTO"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Keywords (comma-separated)</label>
          <input 
            type="text" 
            name="keywords" 
            value={formData.keywords} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 px-3 py-2" 
            placeholder="e.g. ISO 26262, ASPICE"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Discovery Sources</label>
          <textarea
            name="discoverySources"
            value={formData.discoverySources}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 px-3 py-2"
            rows={4}
            placeholder={'One per line: website:https://example.com/products, search:Company ISO 26262, jobs:Company functional safety engineer'}
          />
          <p className="mt-2 text-xs text-gray-500">
            Typed sources help enrichment: website:, search:, jobs:, directory:, linkedin:.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Offer / Value Prop</label>
          <textarea 
            name="offer" 
            value={formData.offer} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 px-3 py-2" 
            rows={3} 
            placeholder="A short demo of Aegis SafeForge..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Call To Action (CTA)</label>
          <input 
            type="text" 
            name="cta" 
            value={formData.cta} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
            placeholder="Would it be useful to see a short demo?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Tone</label>
            <select 
              name="tone" 
              value={formData.tone} 
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="technical">Technical</option>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="concise">Concise</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Channel</label>
            <select 
              name="channel" 
              value={formData.channel} 
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="email">Email</option>
              <option value="linkedin">LinkedIn</option>
              <option value="generic">Generic</option>
            </select>
          </div>
        </div>

        <div className="pt-4">
          <button 
            type="submit" 
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Create Campaign
          </button>
        </div>
      </form>
    </div>
  );
}
