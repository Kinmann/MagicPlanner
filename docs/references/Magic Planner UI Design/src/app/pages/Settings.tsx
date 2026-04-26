import React from 'react';
import { Settings2, Save, Bell, Shield, Key } from 'lucide-react';

export function Settings() {
  return (
    <div className="flex-1 bg-[#121216] overflow-y-auto p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full">
        <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-3 mb-8">
          <Settings2 className="text-[#10b981]" size={32} />
          Settings
        </h1>
        
        <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <Bell size={20} className="text-gray-400" />
            Notifications
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300">Email Notifications</p>
                <p className="text-sm text-gray-500">Receive daily summaries</p>
              </div>
              <div className="w-12 h-6 bg-[#10b981] rounded-full relative cursor-pointer">
                <div className="absolute right-1 top-1 w-4 h-4 bg-[#18181b] rounded-full" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300">AI Node Generation Alerts</p>
                <p className="text-sm text-gray-500">Notify when AI finishes generating nodes</p>
              </div>
              <div className="w-12 h-6 bg-[#27272a] rounded-full relative cursor-pointer border border-[#3f3f46]">
                <div className="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <Shield size={20} className="text-gray-400" />
            Privacy & Security
          </h2>
          <div className="space-y-4">
            <button className="flex items-center gap-2 text-gray-300 hover:text-white bg-[#27272a] px-4 py-2 rounded-md transition-colors w-full sm:w-auto">
              <Key size={16} />
              Change Password
            </button>
            <p className="text-sm text-gray-500">Enable two-factor authentication for added security in your profile settings.</p>
          </div>
        </div>
        
        <div className="flex justify-end">
          <button className="flex items-center gap-2 bg-[#10b981] hover:bg-[#059669] text-[#121216] font-semibold px-6 py-2 rounded-md transition-colors">
            <Save size={18} />
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
