import React from 'react';
import { UserCircle, Mail, MapPin, Briefcase, Calendar, Edit3, Github, Twitter, Linkedin } from 'lucide-react';

export function Profile() {
  return (
    <div className="flex-1 bg-[#121216] overflow-y-auto">
      <div className="h-48 bg-[#18181b] border-b border-[#27272a] relative overflow-hidden shrink-0 flex items-end px-8 pb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex items-center gap-6">
          <div className="w-24 h-24 bg-[#27272a] rounded-full border-4 border-[#121216] flex items-center justify-center text-gray-500 overflow-hidden relative group cursor-pointer">
            <UserCircle size={80} strokeWidth={1} />
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit3 size={24} className="text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-100">Alex Designer</h1>
            <p className="text-[#10b981] font-medium flex items-center gap-2">
              Senior Product Designer
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4 border-b border-[#27272a] pb-2">About</h2>
            <ul className="space-y-4 text-sm text-gray-400">
              <li className="flex items-center gap-3"><Mail size={16} className="text-gray-500" /> alex@magicplanner.dev</li>
              <li className="flex items-center gap-3"><MapPin size={16} className="text-gray-500" /> San Francisco, CA</li>
              <li className="flex items-center gap-3"><Briefcase size={16} className="text-gray-500" /> Figma Inc.</li>
              <li className="flex items-center gap-3"><Calendar size={16} className="text-gray-500" /> Joined March 2024</li>
            </ul>
          </div>
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4 border-b border-[#27272a] pb-2">Links</h2>
            <div className="flex gap-4">
              <Github className="text-gray-500 hover:text-white cursor-pointer transition-colors" size={20} />
              <Twitter className="text-gray-500 hover:text-[#1da1f2] cursor-pointer transition-colors" size={20} />
              <Linkedin className="text-gray-500 hover:text-[#0a66c2] cursor-pointer transition-colors" size={20} />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4 border-b border-[#27272a] pb-2">Activity Overview</h2>
            <div className="text-gray-400 text-sm py-8 text-center border-2 border-dashed border-[#27272a] rounded-md">
              Activity chart will be generated here based on recent commits.
            </div>
          </div>
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6">
            <div className="flex items-center justify-between mb-4 border-b border-[#27272a] pb-2">
              <h2 className="text-lg font-semibold text-gray-200">Recent Contributions</h2>
            </div>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-[#10b981]/20 flex items-center justify-center shrink-0">
                  <Edit3 size={14} className="text-[#10b981]" />
                </div>
                <div>
                  <p className="text-sm text-gray-200 font-medium">Refined AI generation parameters</p>
                  <p className="text-xs text-gray-500">Magic Planner V1 • 2 hours ago</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Edit3 size={14} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-200 font-medium">Added new state badges to SidebarTree</p>
                  <p className="text-xs text-gray-500">Design System Workspace • Yesterday</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
