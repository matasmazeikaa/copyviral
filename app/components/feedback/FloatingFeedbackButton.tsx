"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { ReportIssueModal } from "./ReportIssueModal";
import { useAuth } from "@/app/contexts/AuthContext";

export function FloatingFeedbackButton() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { user } = useAuth();

    // Only show for authenticated users
    if (!user) return null;

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-white rounded-full shadow-lg transition-all duration-200 group"
                title="Report an issue"
            >
                <MessageSquarePlus className="w-5 h-5" />
                <span className="text-sm font-medium">Feedback</span>
            </button>

            <ReportIssueModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
            />
        </>
    );
}
