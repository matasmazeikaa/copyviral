'use client'
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import toast from "react-hot-toast";
import { useState } from "react";
import { 
    Crown, 
    Sparkles, 
    LogOut, 
    FolderOpen,
    ChevronRight,
    Menu,
    X
} from "lucide-react";
import Logo from "../Logo";

export default function Header() {
    const pathname = usePathname();
    const { user, signOut, isPremium, usageInfo } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Hide header on editor and login pages
    if (pathname.startsWith("/projects/") || pathname === "/login") {
        return null;
    }

    const handleSignOut = async () => {
        try {
            await signOut();
            toast.success('Signed out successfully');
            setIsMobileMenuOpen(false);
        } catch (error) {
            toast.error('Failed to sign out');
        }
    };

    const navLinks: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    ];

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50 safe-top">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
                <div className="flex justify-between items-center">
                    {/* Logo */}
                    <Link href="/" className="flex items-center group hover:opacity-90 transition-opacity">
                        <Logo className="text-white" />
                    </Link>

                    {/* Desktop Navigation */}
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

                    {/* Desktop Right Section */}
                    <div className="hidden sm:flex items-center gap-3">
                        {user ? (
                            <>
                                {/* Subscription Badge */}
                                <Link
                                    href="/subscription"
                                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-all duration-200 ${
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
                                                {usageInfo ? `${usageInfo.used}/${typeof usageInfo.limit === 'number' ? usageInfo.limit : 3}` : '-/-'}
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
                                className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-sm font-semibold rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-200"
                            >
                                Get Started
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="sm:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                        aria-label="Toggle menu"
                    >
                        {isMobileMenuOpen ? (
                            <X className="w-5 h-5" />
                        ) : (
                            <Menu className="w-5 h-5" />
                        )}
                    </button>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="sm:hidden mt-3 pt-3 border-t border-slate-800 animate-slide-up">
                        {user ? (
                            <div className="space-y-3">
                                {/* User Info */}
                                <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
                                    {user.user_metadata?.avatar_url ? (
                                        <img
                                            src={user.user_metadata.avatar_url}
                                            alt={user.email || 'User'}
                                            className="w-10 h-10 rounded-full ring-2 ring-slate-700"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                            <span className="text-sm font-bold text-white">
                                                {(user.email?.[0] || 'U').toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white truncate">
                                            {user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                                        </p>
                                        <p className="text-xs text-slate-400 truncate">{user.email}</p>
                                    </div>
                                </div>

                                {/* Subscription Status */}
                                <Link
                                    href="/subscription"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                                        isPremium 
                                            ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
                                            : 'bg-slate-800/80 border border-slate-700/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        {isPremium ? (
                                            <Crown className="w-5 h-5 text-yellow-400" />
                                        ) : (
                                            <Sparkles className="w-5 h-5 text-purple-400" />
                                        )}
                                        <span className="text-sm font-medium text-white">
                                            {isPremium ? 'Pro Plan' : 'Free Plan'}
                                        </span>
                                    </div>
                                    {!isPremium && (
                                        <span className="text-xs text-slate-400">
                                            {usageInfo ? `${usageInfo.used}/${typeof usageInfo.limit === 'number' ? usageInfo.limit : 3}` : '-/-'} credits
                                        </span>
                                    )}
                                </Link>

                                {/* Sign Out */}
                                <button
                                    onClick={handleSignOut}
                                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span className="text-sm font-medium">Sign Out</span>
                                </button>
                            </div>
                        ) : (
                            <Link
                                href="/login"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="flex items-center justify-center gap-2 w-full p-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl"
                            >
                                Get Started
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
}
