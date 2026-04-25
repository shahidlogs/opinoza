import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetWallet, useGetMe } from "@workspace/api-client-react";
import { playCoinSound, isSoundEnabled, toggleSound } from "@/lib/coin-sound";
import NotificationBell from "@/components/NotificationBell";

const navLinks = [
  { href: "/questions", label: "Browse", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" },
  { href: "/insights", label: "Insights", icon: "M3 3v18h18M7 16l4-4 4 4 4-4" },
  { href: "/how-it-works", label: "How It Works", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" },
];

const authLinks = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { href: "/wallet", label: "Wallet", icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M21 12a2 2 0 0 1 0 4H5a2 2 0 0 0 0 4h16v-4" },
  { href: "/ask", label: "Ask", icon: "M12 5v14M5 12h14" },
  { href: "/invite", label: "Invite", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { href: "/profile", label: "Profile", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
];

function SoundToggle() {
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = toggleSound();
    setSoundOn(next);
  };
  return (
    <button
      onClick={handleToggle}
      title={soundOn ? "Sound on — click to mute" : "Sound off — click to enable"}
      className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-all"
    >
      {soundOn ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      )}
    </button>
  );
}

function WalletBadge() {
  const { data: wallet } = useGetWallet();
  const [bouncing, setBouncing] = useState(false);
  const [floaties, setFloaties] = useState<number[]>([]);
  const floatIdRef = useRef(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const cents = (e as CustomEvent).detail?.cents ?? 1;

      // Play sound
      playCoinSound();

      // Bounce the badge
      setBouncing(true);
      setTimeout(() => setBouncing(false), 600);

      // Add a floating coin label
      const id = ++floatIdRef.current;
      setFloaties(prev => [...prev, id]);
      setTimeout(() => setFloaties(prev => prev.filter(f => f !== id)), 1200);
    };

    window.addEventListener("coin-earned", handler);
    return () => window.removeEventListener("coin-earned", handler);
  }, []);

  if (!wallet) return null;
  const cents = wallet.balanceCents;
  const display = cents >= 100 ? `$${(cents / 100).toFixed(2)}` : `${cents}¢`;

  return (
    <div className="relative flex items-center">
      {/* Floating "+1¢" chips */}
      <AnimatePresence>
        {floaties.map(id => (
          <motion.span
            key={id}
            initial={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            animate={{ opacity: 0, y: -32, x: "-50%", scale: 1.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="pointer-events-none absolute left-1/2 top-0 z-50 text-xs font-extrabold text-amber-500 select-none whitespace-nowrap drop-shadow-sm"
            style={{ translateX: "-50%" }}
          >
            +1¢
          </motion.span>
        ))}
      </AnimatePresence>

      <Link href="/wallet">
        <motion.div
          animate={bouncing
            ? { scale: [1, 1.25, 0.9, 1.12, 1], rotate: [0, -6, 5, -3, 0] }
            : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.5, ease: "easeOut" }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/30 hover:bg-amber-400/25 transition-all cursor-pointer"
        >
          <motion.svg
            width="13" height="13" viewBox="0 0 24 24" fill="currentColor"
            animate={bouncing ? { rotate: [0, -15, 15, -8, 0] } : { rotate: 0 }}
            transition={{ duration: 0.5 }}
            className="text-amber-500"
          >
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
          </motion.svg>
          <span className="text-xs font-bold text-amber-700 tabular-nums">{display}</span>
        </motion.div>
      </Link>
    </div>
  );
}

function AdminBadge() {
  const { data: me } = useGetMe();
  if (!me?.isAdmin && !me?.isEditor) return null;
  const label = me?.isAdmin ? "Admin" : "Moderation";
  return (
    <Link href="/admin">
      <motion.div
        whileHover={{ scale: 1.05 }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-navy-800 gold-gradient text-white cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        {label}
      </motion.div>
    </Link>
  );
}

function NavLink({ href, label, isActive, onClick }: { href: string; label: string; isActive: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick}>
      <span className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
        isActive
          ? "text-amber-700 bg-amber-50"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
      }`}>
        {label}
        {isActive && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-lg bg-amber-50 -z-10"
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          />
        )}
      </span>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me } = useGetMe();

  const closeMenu = () => setMenuOpen(false);
  const handleSignOut = () => signOut({ redirectUrl: "/" });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-white/95 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="flex items-center gap-1 cursor-pointer shrink-0"
            >
              <svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 drop-shadow-sm">
                <defs>
                  <radialGradient id="nav-coin-g" cx="38%" cy="30%" r="75%" fx="38%" fy="30%">
                    <stop offset="0%"   stopColor="#fef3c7"/>
                    <stop offset="42%"  stopColor="#fbbf24"/>
                    <stop offset="100%" stopColor="#d97706"/>
                  </radialGradient>
                  <radialGradient id="nav-edge-g" cx="50%" cy="50%" r="50%">
                    <stop offset="80%"  stopColor="#d97706" stopOpacity="0"/>
                    <stop offset="100%" stopColor="#92400e" stopOpacity="0.5"/>
                  </radialGradient>
                </defs>
                <circle cx="32" cy="32" r="30" fill="url(#nav-coin-g)"/>
                <circle cx="32" cy="32" r="30" fill="url(#nav-edge-g)"/>
                <circle cx="32" cy="32" r="30" fill="none" stroke="#b45309" strokeWidth="1.5" opacity="0.55"/>
                <circle cx="32" cy="32" r="18" fill="none" stroke="#1e3a5f" strokeWidth="7"/>
                <circle cx="32" cy="32" r="18" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.25"/>
                <path d="M 18 20 A 17 17 0 0 1 34 14" stroke="white" strokeWidth="3.5" fill="none" opacity="0.45" strokeLinecap="round"/>
              </svg>
              <span className="font-extrabold text-xl tracking-tight text-[#1e3a5f]">
                pinoza
              </span>
            </motion.div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 px-6">
            {navLinks.map(link => (
              <NavLink key={link.href} href={link.href} label={link.label} isActive={location === link.href} />
            ))}
            <Show when="signed-in">
              {authLinks.map(link => (
                <NavLink key={link.href} href={link.href} label={link.label} isActive={location === link.href} />
              ))}
            </Show>
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-2 shrink-0">
            <Show when="signed-in">
              <AdminBadge />
              <WalletBadge />
              <NotificationBell />
              <SoundToggle />
              <Link href="/profile">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="hidden md:flex w-8 h-8 rounded-full gold-gradient items-center justify-center shadow-sm cursor-pointer"
                >
                  <span className="text-xs font-bold text-white">
                    {(me?.name?.[0] || user?.firstName?.[0] || user?.username?.[0] || "U").toUpperCase()}
                  </span>
                </motion.div>
              </Link>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSignOut}
                title="Sign out"
                className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </motion.button>
            </Show>
            <Show when="signed-out">
              <Link href="/sign-in">
                <button className="hidden md:block px-3.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  Sign in
                </button>
              </Link>
              <Link href="/sign-up">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold gold-gradient text-white shadow-sm hover:opacity-90 transition-opacity"
                >
                  Join Free
                </motion.button>
              </Link>
            </Show>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
              className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <motion.svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                animate={{ rotate: menuOpen ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                {menuOpen
                  ? <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>
                  : <><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></>
                }
              </motion.svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t border-border bg-white overflow-hidden"
            >
              <div className="px-4 py-4 flex flex-col gap-1">
                {navLinks.map(link => (
                  <Link key={link.href} href={link.href} onClick={closeMenu}>
                    <span className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
                      location === link.href
                        ? "text-amber-700 bg-amber-50"
                        : "text-foreground hover:bg-muted"
                    }`}>
                      {link.label}
                    </span>
                  </Link>
                ))}

                <Show when="signed-in">
                  <div className="h-px bg-border my-2" />
                  {authLinks.map(link => (
                    <Link key={link.href} href={link.href} onClick={closeMenu}>
                      <span className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
                        location === link.href
                          ? "text-amber-700 bg-amber-50"
                          : "text-foreground hover:bg-muted"
                      }`}>
                        {link.label}
                      </span>
                    </Link>
                  ))}
                  <div className="h-px bg-border my-2" />
                  <WalletBadge />
                  <button
                    onClick={() => { closeMenu(); handleSignOut(); }}
                    className="w-full mt-2 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign Out
                  </button>
                </Show>

                <Show when="signed-out">
                  <div className="h-px bg-border my-2" />
                  <div className="flex gap-2 mt-1">
                    <Link href="/sign-in" onClick={closeMenu} className="flex-1">
                      <button className="w-full py-3 rounded-xl border border-border text-sm font-medium text-foreground">Sign in</button>
                    </Link>
                    <Link href="/sign-up" onClick={closeMenu} className="flex-1">
                      <button className="w-full py-3 rounded-xl gold-gradient text-white text-sm font-semibold">Join Free</button>
                    </Link>
                  </div>
                </Show>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main content */}
      <main className="flex-1 page-enter">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <defs>
                  <radialGradient id="foot-coin-g" cx="38%" cy="30%" r="75%" fx="38%" fy="30%">
                    <stop offset="0%"   stopColor="#fef3c7"/>
                    <stop offset="42%"  stopColor="#fbbf24"/>
                    <stop offset="100%" stopColor="#d97706"/>
                  </radialGradient>
                  <radialGradient id="foot-edge-g" cx="50%" cy="50%" r="50%">
                    <stop offset="80%"  stopColor="#d97706" stopOpacity="0"/>
                    <stop offset="100%" stopColor="#92400e" stopOpacity="0.5"/>
                  </radialGradient>
                </defs>
                <circle cx="32" cy="32" r="30" fill="url(#foot-coin-g)"/>
                <circle cx="32" cy="32" r="30" fill="url(#foot-edge-g)"/>
                <circle cx="32" cy="32" r="30" fill="none" stroke="#b45309" strokeWidth="1.5" opacity="0.55"/>
                <circle cx="32" cy="32" r="18" fill="none" stroke="#1e3a5f" strokeWidth="7"/>
                <path d="M 18 20 A 17 17 0 0 1 34 14" stroke="white" strokeWidth="3.5" fill="none" opacity="0.4" strokeLinecap="round"/>
              </svg>
              <span className="font-bold tracking-tight text-[#1e3a5f]">pinoza</span>
              <span className="text-border">·</span>
              <span className="text-sm text-muted-foreground">Answer questions, earn rewards</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <Link href="/questions"><span className="hover:text-foreground transition-colors cursor-pointer">Browse</span></Link>
              <Link href="/insights"><span className="hover:text-foreground transition-colors cursor-pointer">Insights</span></Link>
              <Link href="/ask"><span className="hover:text-foreground transition-colors cursor-pointer">Ask</span></Link>
              <span className="text-border hidden sm:inline">·</span>
              <Link href="/privacy"><span className="hover:text-foreground transition-colors cursor-pointer">Privacy Policy</span></Link>
              <Link href="/terms"><span className="hover:text-foreground transition-colors cursor-pointer">Terms</span></Link>
              <Link href="/contact"><span className="hover:text-foreground transition-colors cursor-pointer">Contact</span></Link>
              <Link href="/about"><span className="hover:text-foreground transition-colors cursor-pointer">About</span></Link>
              <Link href="/how-it-works"><span className="hover:text-foreground transition-colors cursor-pointer">How It Works</span></Link>
              <Link href="/blog"><span className="hover:text-foreground transition-colors cursor-pointer">Blog</span></Link>
              <span className="text-border hidden sm:inline">·</span>
              <Link href="/safety"><span className="hover:text-foreground transition-colors cursor-pointer text-blue-600 hover:text-blue-700">Child Safety Policy</span></Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
