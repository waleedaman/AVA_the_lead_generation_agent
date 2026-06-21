'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch, API_BASE_URL } from '../lib/api';

type Campaign = {
  _id: string;
  name: string;
};

type Draft = {
  _id: string;
  companyId: string | { _id: string; name?: string };
  subject?: string;
  selectedAngle?: string;
  angle?: { selected_angle?: string } | string;
  status: string;
};

export default function OutreachDirectoryPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  
  // Manual Add Form State
  const [manualName, setManualName] = useState('');
  const [manualWebsite, setManualWebsite] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDraftsAndCampaigns = useCallback(async () => {
    try {
      const [allDrafts, camps] = await Promise.all([
        apiFetch<Draft[]>('/drafts'),
        apiFetch<Campaign[]>('/campaigns'),
      ]);
      setDrafts(allDrafts.filter((draft) => draft.status === 'approved'));
      setCampaigns(camps);
      const firstCampaign = camps[0];
      if (firstCampaign) {
        setSelectedCampaignId((current) => current || firstCampaign._id);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void fetchDraftsAndCampaigns();
  }, [fetchDraftsAndCampaigns]);

  const handleExportCsv = () => {
    window.location.href = `${API_BASE_URL}/drafts/export/csv`;
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedCampaignId) return alert('Please select a campaign first.');
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/companies/import/${selectedCampaignId}`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        alert('Companies imported successfully!');
        setIsImportModalOpen(false);
      } else {
        const err = await res.json();
        alert(`Import failed: ${err.message}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId || !manualName) return alert('Campaign and Company Name are required.');
    
    try {
      const res = await fetch(`${API_BASE_URL}/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          name: manualName,
          website: manualWebsite || undefined,
        })
      });
      
      if (res.ok) {
        alert('Company added successfully!');
        setIsManualModalOpen(false);
        setManualName('');
        setManualWebsite('');
      } else {
        alert('Failed to add company');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto text-gray-900">
      
      {/* Import CSV Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Import Companies (CSV)</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Campaign</label>
              <select 
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="" disabled>Select a campaign...</option>
                {campaigns.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:bg-gray-50"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <span className="text-blue-600 font-medium">Uploading...</span>
              ) : (
                <span className="text-gray-500">Click to browse your CSV</span>
              )}
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.item(0);
                  if (file) {
                    void handleFileUpload(file);
                  }
                }}
              />
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Company Manually</h2>
            <form onSubmit={handleManualSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Campaign</label>
                <select 
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="" disabled>Select a campaign...</option>
                  {campaigns.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input 
                  type="text" 
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Website (Optional)</label>
                <input 
                  type="text" 
                  value={manualWebsite}
                  onChange={(e) => setManualWebsite(e.target.value)}
                  placeholder="e.g. example.com"
                  className="w-full border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button 
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-blue-600 text-white font-medium px-4 py-2 rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Link href="/campaigns" className="text-blue-600 hover:underline mb-2 inline-block">&larr; Back to Campaigns</Link>
        <div className="flex justify-between items-center mt-2">
          <h1 className="text-3xl font-bold">Outreach Directory</h1>
          <div className="space-x-3">
            <button 
              onClick={() => setIsManualModalOpen(true)}
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 font-medium"
            >
              Add Company
            </button>
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 font-medium"
            >
              Import CSV
            </button>
            <button 
              onClick={handleExportCsv}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-medium"
            >
              Export to CSV
            </button>
          </div>
        </div>
      </div>
      
      <p className="text-gray-600 mb-8 text-lg">
        Master view of all approved leads across your campaigns ready for outreach.
      </p>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Angle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {drafts.length === 0 ? (
              <tr>
                <td className="px-6 py-12 whitespace-nowrap text-sm text-gray-500 text-center" colSpan={4}>
                  No approved drafts available. Review your pending drafts to build your outreach list.
                </td>
              </tr>
            ) : (
              drafts.map((draft) => {
                const companyLabel =
                  typeof draft.companyId === 'string' ? draft.companyId : draft.companyId.name || draft.companyId._id;
                const angle =
                  draft.selectedAngle ||
                  (typeof draft.angle === 'string' ? draft.angle : draft.angle?.selected_angle) ||
                  '';
                return (
                  <tr key={draft._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{companyLabel}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{draft.subject}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={angle}>{angle}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        Approved
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
