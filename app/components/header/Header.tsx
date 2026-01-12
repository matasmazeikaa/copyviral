'use client'
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import toast from "react-hot-toast";
import { 
    Crown, 
    Sparkles, 
    LogOut, 
    FolderOpen,
    Zap,
    ChevronRight
} from "lucide-react";

export default function Header() {
    const pathname = usePathname();
    const { user, signOut, isPremium, usageInfo } = useAuth();

    // Hide header on editor and login pages
    if (pathname.startsWith("/projects/") || pathname === "/login") {
        return null;
    }

    const handleSignOut = async () => {
        try {
            await signOut();
            toast.success('Signed out successfully');
        } catch (error) {
            toast.error('Failed to sign out');
        }
    };

    const navLinks = [
    ];

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
            <div className="max-w-7xl mx-auto px-6 py-3">
                <div className="flex justify-between items-center">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25 group-hover:shadow-purple-500/40 transition-shadow">
                            <Zap className="w-5 h-5 text-white" fill="white" />
                        </div>
                        <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 group-hover:from-purple-300 group-hover:to-pink-300 transition-all">
                            CopyViral
                        </span>
                    </Link>

                    {/* Navigation */}
                    <nav className="hidden md:flex items-center">
                        <ul className="flex items-center gap-1">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href;
                                const Icon = link.icon;
                                return (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                                isActive
                                                    ? 'bg-slate-800 text-white'
                                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {link.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    {/* Right Section */}
                    <div className="flex items-center gap-3">
                        {user ? (
                            <>
                                {/* Subscription Badge */}
                                <Link
                                    href="/subscription"
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 ${
                                        isPremium 
                                            ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10'
                                            : 'bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600'
                                    }`}
                                >
                                    {isPremium ? (
                                        <>
                                            <Crown className="w-4 h-4 text-yellow-400" />
                                            <span className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                                                Pro
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 text-purple-400" />
                                            <span className="text-sm font-medium text-slate-300">
                                                {usageInfo?.used || 0}/{typeof usageInfo?.limit === 'number' ? usageInfo.limit : 3}
                                            </span>
                                            <ChevronRight className="w-3 h-3 text-purple-400" />
                                        </>
                                    )}
                                </Link>

                                {/* User Avatar & Menu */}
                                <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
                                    {user.user_metadata?.avatar_url ? (
                                        <img
                                            src={user.user_metadata.avatar_url}
                                            alt={user.email || 'User'}
                                            className="w-8 h-8 rounded-full ring-2 ring-slate-700 ring-offset-2 ring-offset-slate-950"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                            <span className="text-xs font-bold text-white">
                                                {(user.email?.[0] || 'U').toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="hidden lg:block">
                                        <p className="text-sm font-medium text-white truncate max-w-[120px]">
                                            {user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleSignOut}
                                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-200"
                                        title="Sign Out"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-sm font-semibold rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-200"
                            >
                                Get Started
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
