'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

// Helper to gate SSR/CSR differences
const isBrowser = typeof window !== 'undefined';

// ------------------------------
// Types
// ------------------------------
export type Tier = 'T1' | 'T2' | 'T3';
export interface Participant {
  id: number;
  name: string;
  phoneOriginal: string;
  phoneNorm: string; // 10 digits e.g. 09xxxxxxxx
  phoneLast3: string; // last 3
  tier: Tier;
}
export interface Prize {
  id: string;
  label: string;
  subtitle: string;
  group: string;
  eligible: Tier[];
}
interface TestResult { name: string; ok: boolean; err?: string }
interface ConfettiPiece { id: number; left: number; duration: number; delay: number; size: number; rotate: number }

// ------------------------------
// Helpers
// ------------------------------
function hashStringToInt32(str: string): number {
  let h = 2166136261 >>> 0; // FNV-1a basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0,1)
  };
}

function rngIntUnbiased(rng: () => number, n: number): number {
  if (n <= 0) return 0;
  const max = 0xffffffff;
  const limit = max - ((max + 1) % n);
  while (true) {
    const u = Math.floor(rng() * 4294967296);
    if (u <= limit) return u % n;
  }
}

function normalizePhone(raw: string | number | null | undefined): string | null {
  if (!raw && raw !== 0) return null;
  let digits = ('' + raw).replace(/\D+/g, '');
  if (digits.startsWith('251') && digits.length >= 12) {
    const last9 = digits.slice(-9);
    digits = '0' + last9;
  }
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) return null;
  return digits;
}

function maskPhoneLast3(phone: string): string {
  const last3 = phone.slice(-3);
  return `•••••${last3}`;
}

function phoneToPairs10(phone10: string): string[] {
  return [0, 2, 4, 6, 8].map((i) => phone10.slice(i, i + 2));
}

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}

// Sandbox-safe URL replace (no-ops in about:srcdoc/blob)
function canReplaceHistory(): boolean {
  try {
    const u = new URL(window.location.href);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!window.history?.replaceState;
  } catch {
    return false;
  }
}
function safeReplaceQueryParam(key: string, value: string | null): void {
  if (!isBrowser || !canReplaceHistory()) return;
  try {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.replaceState(null, '', url.toString());
  } catch {}
}

// ------------------------------
// Sample data & prizes
// ------------------------------
function generateSampleParticipants(count = 5000): Participant[] {
  const out: Participant[] = [];
  for (let i = 0; i < count; i++) {
    const id = i + 1;
    const rest = Math.floor(Math.random() * 1_00_00_00_00)
      .toString()
      .padStart(8, '0');
    const phone = '09' + rest;
    let tier: Tier = 'T3';
    if (i < Math.floor(count * 0.24)) tier = 'T1'; // ~1200
    else if (i < Math.floor(count * 0.66)) tier = 'T2'; // ~2100
    out.push({ id, name: `Participant ${id.toString().padStart(4, '0')}`, phoneOriginal: phone, phoneNorm: phone, phoneLast3: phone.slice(-3), tier });
  }
  return out;
}

function buildDefaultPrizes(): Prize[] {
  const prizes: Prize[] = [];
  for (let i = 0; i < 10; i++) prizes.push({ id: `G-${i + 1}`, label: `Grand Prize ${i + 1}`, subtitle: '', group: 'Grand', eligible: ['T1'] });
  for (let i = 0; i < 40; i++) prizes.push({ id: `M-${i + 1}`, label: `Major Prize ${i + 1}`, subtitle: 'Smart Watch Series X', group: 'Major', eligible: ['T1', 'T2'] });
  for (let i = 0; i < 50; i++) prizes.push({ id: `GN-${i + 1}`, label: `General Prize ${i + 1}`, subtitle: '', group: 'General', eligible: ['T1', 'T2', 'T3'] });
  return prizes;
}

// ------------------------------
// Self-tests (open with ?test=1)
// ------------------------------
function runSelfTests(): TestResult[] {
  const results: TestResult[] = [];
  const t = (name: string, fn: () => void) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, err: String(e) });
    }
  };
  t('normalize local 10-digit', () => {
    const v = normalizePhone('0912345678');
    if (v !== '0912345678') throw new Error('bad normalize');
  });
  t('normalize +251 prefix', () => {
    const v = normalizePhone('+251912345678');
    if (v !== '0912345678') throw new Error('bad +251 normalize: ' + v);
  });
  t('normalize 251 no plus', () => {
    const v = normalizePhone('251912345678');
    if (v !== '0912345678') throw new Error('bad 251 normalize: ' + v);
  });
  t('reject short', () => {
    const v = normalizePhone('09123');
    if (v !== null) throw new Error('expected null');
  });
  t('pairs split', () => {
    const ps = phoneToPairs10('0912345678');
    const expect = ['09', '12', '34', '56', '78'];
    if (JSON.stringify(ps) !== JSON.stringify(expect)) throw new Error('bad pairs');
  });
  t('mulberry32 deterministic', () => {
    const r1 = mulberry32(42),
      r2 = mulberry32(42);
    for (let i = 0; i < 10; i++) if (r1() !== r2()) throw new Error('nondeterministic');
  });
  t('hash stability', () => {
    const a = hashStringToInt32('abc'),
      b = hashStringToInt32('abc');
    if (a !== b) throw new Error('hash changed');
  });
  return results;
}

// ------------------------------
// Confetti (simple CSS/DOM confetti without external libs)
// ------------------------------
function Confetti({ show }: { show: boolean }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  useEffect(() => {
    if (!show) {
      setPieces([]);
      return;
    }
    const N = 120; // number of pieces
    const p: ConfettiPiece[] = new Array(N).fill(0).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: 2000 + Math.random() * 2500,
      delay: Math.random() * 250,
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 360,
    }));
    setPieces(p);
    const timer = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(timer);
  }, [show]);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((c) => (
        <div
          key={c.id}
          style={{
            position: 'absolute',
            left: `${c.left}%`,
            top: `-10%`,
            width: `${c.size}px`,
            height: `${c.size * 0.6}px`,
            background: ['#D97706', '#2563EB', '#0D9488', '#F5F5F3'][c.id % 4],
            transform: `rotate(${c.rotate}deg)`,
            animation: `fall ${c.duration}ms ease-in ${c.delay}ms forwards` as any,
            borderRadius: 2,
            opacity: 0.9,
          }}
        />
      ))}
      <style>{`@keyframes fall { to { transform: translateY(120vh) rotate(720deg); opacity: 0.8; } }`}</style>
    </div>
  );
}

// ------------------------------
// CSV parsers
// ------------------------------
function parseParticipantsCSV(text: string): Participant[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxName = header.indexOf('name');
  const idxPhone = header.indexOf('phone');
  const idxTier = header.indexOf('tier');
  if (idxName === -1 || idxPhone === -1 || idxTier === -1) return [];
  const out: Participant[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length < 3) continue;
    const name = row[idxName]?.trim();
    const phoneRaw = row[idxPhone]?.trim();
    const tierRaw = row[idxTier]?.trim().toUpperCase();
    const phoneNorm = normalizePhone(phoneRaw);
    if (!name || !phoneNorm) continue;
    const tier = (['T1', 'T2', 'T3'] as const).includes(tierRaw as Tier) ? (tierRaw as Tier) : 'T3';
    out.push({ id: out.length + 1, name, phoneOriginal: phoneRaw, phoneNorm, phoneLast3: phoneNorm.slice(-3), tier });
  }
  return out;
}

// Expected headers for prizes CSV (order):
// id,label,group,subtitle,eligible
function parsePrizesCSV(text: string): Prize[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxId = header.indexOf('id');
  const idxLabel = header.indexOf('label');
  const idxGroup = header.indexOf('group');
  const idxSub = header.indexOf('subtitle');
  const idxElig = header.indexOf('eligible');
  if (idxId === -1 || idxLabel === -1) return [];
  const out: Prize[] = [];
  const seenIds = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    const rawId = row[idxId]?.trim();
    const rawLabel = row[idxLabel]?.trim();
    if (!rawLabel) continue;
    let id = rawId || `P-${i}`;
    // Ensure unique IDs (avoid collapsing prizes with same group/label)
    if (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);

    const rawElig = (idxElig !== -1 ? row[idxElig] : '')?.trim() || 'T1,T2,T3';
    const elig = rawElig
      .split(/[|,\s]+/)
      .map((x) => x.toUpperCase())
      .filter((x): x is Tier => ['T1', 'T2', 'T3'].includes(x));
    const group = (idxGroup !== -1 ? row[idxGroup] : '')?.trim() || 'General';
    const subtitle = (idxSub !== -1 ? row[idxSub] : '')?.trim() || '';
    out.push({ id, label: rawLabel, subtitle, group, eligible: elig.length ? elig : ['T1', 'T2', 'T3'] });
  }
  return out;
}

// ------------------------------
// App
// ------------------------------
export default function App() {
  // Setup gate (must provide participants + prizes before show)
  const [setupOpen, setSetupOpen] = useState<boolean>(true);

  // SETTINGS (slide-over)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [eventTitle, setEventTitle] = useState<string>('New Year Draw 2018');
  // SSR-safe seed state: placeholder on server, sync real value on mount
  const [seedText, setSeedText] = useState<string>(() => {
    if (isBrowser) {
      const stored = localStorage.getItem('lottery_seed');
      if (stored && /^\d+$/.test(stored)) {
        const n = Number(stored);
        if (n >= 1 && n <= 100) return stored;
      }
      // Default: random integer 1..100
      return String(Math.floor(Math.random() * 100) + 1);
    }
    return 'seed-build';
  });
  const [maskWinnerPhone, setMaskWinnerPhone] = useState<boolean>(true); // default masked
  useEffect(() => {
    if (!isBrowser) return;
    if (seedText === 'seed-build') {
      const stored = localStorage.getItem('lottery_seed');
      let s: string | null = null;
      if (stored && /^\d+$/.test(stored)) {
        const n = Number(stored);
        if (n >= 1 && n <= 100) s = stored;
      }
      if (!s) s = String(Math.floor(Math.random() * 100) + 1);
      setSeedText(s);
      return;
    }
    localStorage.setItem('lottery_seed', seedText);
  }, [seedText]);

  // Clock for top-right
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = useMemo(() => now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), [now]);

  // Data
  const [participants, setParticipants] = useState<Participant[]>([]); // start empty
  const [frozen, setFrozen] = useState<boolean>(false);
  const dedupedParticipants = useMemo<Participant[]>(() => {
    const seen = new Set<string>();
    const out: Participant[] = [];
    for (const p of participants) {
      if (!p.phoneNorm || seen.has(p.phoneNorm)) continue;
      seen.add(p.phoneNorm);
      out.push(p);
    }
    return out;
  }, [participants]);

  // Prizes and winners
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [currentPrizeIndex, setCurrentPrizeIndex] = useState<number>(0);
  const [winnersByPrizeId, setWinnersByPrizeId] = useState<Record<string, number>>({}); // { [prizeId]: participantId }
  const winnersSet = useMemo(() => new Set<number>(Object.values(winnersByPrizeId)), [winnersByPrizeId]);
  const currentPrize: Prize | undefined = prizes[currentPrizeIndex];

  // Group draw mode
  const [groupMode, setGroupMode] = useState<boolean>(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const groupNames = useMemo<string[]>(() => {
    const s = new Set<string>();
    for (const p of prizes) s.add(p.group);
    return Array.from(s);
  }, [prizes]);
  useEffect(() => {
    if (!selectedGroup && groupNames.length) setSelectedGroup(groupNames[0]);
  }, [groupNames, selectedGroup]);
  const activeGroupPrizes = useMemo<Prize[]>(() => {
    if (!groupMode) return [];
    return prizes.filter((pz) => pz.group === selectedGroup);
  }, [groupMode, prizes, selectedGroup]);

  // Group-mode: per-card reveal state (independent cards)
  type CardReveal = { pairs: string[]; step: number; done: boolean; spin?: string; spinning?: boolean };
  const [groupRevealByPrizeId, setGroupRevealByPrizeId] = useState<Record<string, CardReveal>>({});
  const groupSpinIntervalRef = useRef<number | null>(null);

  // Ensure reveal state exists for each active group prize; clean up stale
  useEffect(() => {
    if (!groupMode) return;
    setGroupRevealByPrizeId((prev) => {
      const next: Record<string, CardReveal> = {};
      for (const pz of activeGroupPrizes) {
        next[pz.id] = prev[pz.id] || { pairs: ['--', '--', '--', '--', '--'], step: 0, done: false };
      }
      return next;
    });
  }, [groupMode, activeGroupPrizes.map((p) => p.id).join('|')]);

  const eligibleForCurrent = useMemo<Participant[]>(() => {
    const cp = currentPrize;
    if (!cp) return [];
    return dedupedParticipants.filter((p) => cp.eligible.includes(p.tier) && !winnersSet.has(p.id));
  }, [currentPrize, dedupedParticipants, winnersSet]);

  // Reveal state (sequential flash pulls)
  const [revealedPairs, setRevealedPairs] = useState<string[]>(['--', '--', '--', '--', '--']);
  const [revealStep, setRevealStep] = useState<number>(0); // 0..5
  const [spinning, setSpinning] = useState<boolean>(false);
  const [spinValue, setSpinValue] = useState<string>('--');
  const spinIntervalRef = useRef<number | null>(null);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  // Derived: remaining pool under current prefix
  const remainingList = useMemo<Participant[]>(() => {
    let pool = eligibleForCurrent;
    if (revealStep > 0) {
      pool = pool.filter((p) => {
        const ps = phoneToPairs10(p.phoneNorm);
        for (let i = 0; i < revealStep; i++) if (ps[i] !== revealedPairs[i]) return false;
        return true;
      });
    }
    return pool;
  }, [eligibleForCurrent, revealedPairs, revealStep]);

  // Group-mode: union of remaining candidates across active group prizes,
  // based on each card's individual revealed prefix so far
  const groupRemaining = useMemo<Participant[]>(() => {
    if (!groupMode) return [];
    const used = winnersSet;
    const out: Participant[] = [];
    const seenP = new Set<number>();
    for (const pz of activeGroupPrizes) {
      if (winnersByPrizeId[pz.id]) continue; // already has a winner, not in game
      const rv = groupRevealByPrizeId[pz.id];
      let pool = dedupedParticipants.filter((p) => pz.eligible.includes(p.tier) && !used.has(p.id));
      if (rv && rv.step > 0) {
        pool = pool.filter((p) => {
          const ps = phoneToPairs10(p.phoneNorm);
          for (let i = 0; i < rv.step; i++) if (ps[i] !== rv.pairs[i]) return false;
          return true;
        });
      }
      for (const p of pool) {
        if (!seenP.has(p.id)) { seenP.add(p.id); out.push(p); }
      }
    }
    return out;
  }, [groupMode, activeGroupPrizes, dedupedParticipants, winnersSet, groupRevealByPrizeId, winnersByPrizeId]);

  // If exactly one participant remains, auto-complete reveal & finalize winner
  useEffect(() => {
    if (groupMode) return; // only for single-prize mode
    const cp = currentPrize;
    if (!cp) return;
    const cpId = cp.id;
    if (winnersByPrizeId[cpId]) return;
    if (remainingList.length === 1 && revealStep < 5 && !spinning) {
      const only = remainingList[0];
      const pairs = phoneToPairs10(only.phoneNorm);
      stopSpin();
      setRevealedPairs(pairs);
      setRevealStep(5);
      setWinnersByPrizeId((prev) => ({ ...prev, [cpId]: only.id }));
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(t);
    }
  }, [groupMode, remainingList, revealStep, spinning, currentPrize, winnersByPrizeId]);

  // Master PRF for reproducibility per prize+step
  const prfForStep = (step: number, extra = ''): (() => number) => {
    const scope = groupMode ? `GROUP:${selectedGroup}` : (currentPrize?.id || 'NOPRIZE');
    const base = `${seedText}|${scope}|step:${step}|prefix:${revealedPairs.join('')}|${extra}`;
    const seed = hashStringToInt32(base);
    return mulberry32(seed);
  };

  // Weighted pick next pair ~ proportional to counts among remaining participants
  function pickNextPairWeighted(): string | null {
    if (groupMode && activeGroupPrizes.length === 0) return null;
    if (!groupMode && !currentPrize) return null;
    if (revealStep >= 5) return null;
    const counts: Record<string, number> = {};
    const pool = groupMode ? groupRemaining : remainingList;
    for (const p of pool) {
      const pair = phoneToPairs10(p.phoneNorm)[revealStep];
      counts[pair] = (counts[pair] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    const total = entries.reduce((s, [, c]) => s + c, 0);
    const rng = prfForStep(revealStep + 1);
    let r = rng() * total;
    for (const [pair, c] of entries) {
      if ((r -= c) <= 0) return pair;
    }
    return entries[entries.length - 1][0];
  }

  function resetRound(): void {
    stopSpin();
    setRevealedPairs(['--', '--', '--', '--', '--']);
    setRevealStep(0);
    setSpinning(false);
    setSpinValue('--');
    setShowConfetti(false);
  }

  // Group-mode helpers: reset/next/prev group
  function resetCurrentGroup(): void {
    if (!groupMode) return;
    setGroupRevealByPrizeId((prev) => {
      const next = { ...prev } as Record<string, CardReveal>;
      for (const pz of prizes.filter((p) => p.group === selectedGroup)) {
        next[pz.id] = { pairs: ['--', '--', '--', '--', '--'], step: 0, done: false };
      }
      return next;
    });
    setWinnersByPrizeId((prev) => {
      const copy = { ...prev } as Record<string, number>;
      for (const pz of prizes.filter((p) => p.group === selectedGroup)) delete copy[pz.id];
      return copy;
    });
    setShowConfetti(false);
  }

  function nextGroup(): void {
    if (!groupMode || groupNames.length === 0) return;
    const idx = Math.max(0, groupNames.indexOf(selectedGroup));
    const next = groupNames[(idx + 1) % groupNames.length];
    setSelectedGroup(next);
  }
  function prevGroup(): void {
    if (!groupMode || groupNames.length === 0) return;
    const idx = Math.max(0, groupNames.indexOf(selectedGroup));
    const prev = groupNames[(idx - 1 + groupNames.length) % groupNames.length];
    setSelectedGroup(prev);
  }

  function nextPrize(): void {
    resetRound();
    setCurrentPrizeIndex((i) => Math.min(i + 1, prizes.length - 1));
  }

  function undoLastPrize(): void {
    let idx = currentPrizeIndex;
    const pid = prizes[idx]?.id;
    if (!winnersByPrizeId[pid] && idx > 0) idx = idx - 1;
    const pid2 = prizes[idx]?.id;
    if (!pid2) return;
    const copy = { ...winnersByPrizeId } as Record<string, number>;
    delete copy[pid2];
    setWinnersByPrizeId(copy);
    setCurrentPrizeIndex(idx);
    resetRound();
  }

  // Rewritten DRAW (Flash) implementation (ASCII-safe)
  function drawFlash(): void {
    // Group mode: stepwise reveal per card across the group
    if (groupMode) {
      if (activeGroupPrizes.length === 0) return;

      // Start spin on all in-play cards (not done, no winner yet)
      setGroupRevealByPrizeId((prev) => {
        const next = { ...prev } as Record<string, CardReveal>;
        for (const pz of activeGroupPrizes) {
          if (winnersByPrizeId[pz.id]) continue;
          const r = next[pz.id] || { pairs: ['--', '--', '--', '--', '--'], step: 0, done: false };
          if (r.done || r.step >= 5) continue;
          next[pz.id] = { ...r, spinning: true, spin: r.spin ?? '--' };
        }
        return next;
      });

      if (groupSpinIntervalRef.current) {
        window.clearInterval(groupSpinIntervalRef.current);
        groupSpinIntervalRef.current = null;
      }
      // Update spin digits every 50ms across all spinning cards
      groupSpinIntervalRef.current = window.setInterval(() => {
        setGroupRevealByPrizeId((prev) => {
          const next = { ...prev } as Record<string, CardReveal>;
          for (const id in next) {
            const r = next[id];
            if (r?.spinning) {
              const v = Math.floor(Math.random() * 100).toString().padStart(2, '0');
              next[id] = { ...r, spin: v };
            }
          }
          return next;
        });
      }, 50);

      // After short delay, stop spinning and lock chosen pair per card
      window.setTimeout(() => {
        if (groupSpinIntervalRef.current) {
          window.clearInterval(groupSpinIntervalRef.current);
          groupSpinIntervalRef.current = null;
        }

        const nextReveals: Record<string, CardReveal> = { ...groupRevealByPrizeId };
        const usedGlobal = new Set<number>(Object.values(winnersByPrizeId));

        for (const pz of activeGroupPrizes) {
          if (winnersByPrizeId[pz.id]) continue;
          const r0 = nextReveals[pz.id] || { pairs: ['--', '--', '--', '--', '--'], step: 0, done: false };
          if (r0.done || r0.step >= 5) continue;

          // Build pool for this prize based on its own prefix
          let pool = dedupedParticipants.filter((p) => pz.eligible.includes(p.tier) && !usedGlobal.has(p.id));
          if (r0.step > 0) {
            pool = pool.filter((p) => {
              const ps = phoneToPairs10(p.phoneNorm);
              for (let i = 0; i < r0.step; i++) if (ps[i] !== r0.pairs[i]) return false;
              return true;
            });
          }

          // Weighted pick for this step for this prize (deterministic)
          const counts: Record<string, number> = {};
          for (const p of pool) {
            const pair = phoneToPairs10(p.phoneNorm)[r0.step];
            counts[pair] = (counts[pair] || 0) + 1;
          }
          const entries = Object.entries(counts);
          let chosen: string;
          if (entries.length === 0) {
            const rng = mulberry32(hashStringToInt32(`${seedText}|PRIZE:${pz.id}|step:${r0.step}|fallback`));
            chosen = Math.floor(rng() * 100).toString().padStart(2, '0');
          } else {
            const total = entries.reduce((s, [, c]) => s + c, 0);
            const rng = (() => {
              const base = `${seedText}|PRIZE:${pz.id}|step:${r0.step}|prefix:${r0.pairs.slice(0, r0.step).join('')}`;
              return mulberry32(hashStringToInt32(base));
            })();
            let rnum = rng() * total;
            chosen = entries[entries.length - 1][0];
            for (const [pair, c] of entries) if ((rnum -= c) <= 0) { chosen = pair; break; }
          }
          const newPairs = r0.pairs.slice();
          newPairs[r0.step] = chosen;
          nextReveals[pz.id] = { pairs: newPairs, step: r0.step + 1, done: false, spinning: false, spin: undefined };
        }

        // Finalize winners for any that reached 5
        const updates: Record<string, number> = {};
        const used = new Set<number>(Object.values(winnersByPrizeId));
        for (const pz of activeGroupPrizes) {
          const r = nextReveals[pz.id];
          if (!r || r.step < 5 || r.done || winnersByPrizeId[pz.id]) continue;
          let pool = dedupedParticipants.filter((p) => pz.eligible.includes(p.tier) && !used.has(p.id));
          pool = pool.filter((p) => {
            const ps = phoneToPairs10(p.phoneNorm);
            for (let i = 0; i < 5; i++) if (ps[i] !== r.pairs[i]) return false;
            return true;
          });
          const winner = pool[0];
          if (winner) {
            updates[pz.id] = winner.id;
            used.add(winner.id);
            nextReveals[pz.id] = { ...r, done: true };
          }
        }

        setGroupRevealByPrizeId(nextReveals);
        if (Object.keys(updates).length) {
          setWinnersByPrizeId((prev) => ({ ...prev, ...updates }));
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 3500);
        }
      }, 900);

      return;
    }
    if (spinning) return;
    const currentPrizeId = currentPrize?.id;
    if (!groupMode) {
      if (!currentPrizeId) return;
      if (winnersByPrizeId[currentPrizeId]) return; // already assigned
      if (remainingList.length === 1) return;
    } else {
      if (activeGroupPrizes.length === 0) return;
    }

    // Start spin animation cycling 00..99 while we compute final selection
    const rngAnim = prfForStep(revealStep + 1, 'anim');
    setSpinning(true);
    stopSpin();
    spinIntervalRef.current = window.setInterval(() => {
      const v = Math.floor(rngAnim() * 100).toString().padStart(2, '0');
      setSpinValue(v);
    }, 50);

    // After duration, lock to chosen pair and advance
    const chosen = pickNextPairWeighted();
    if (!chosen) {
      stopSpin();
      setSpinning(false);
      alert('No candidates match the current prefix. Check your list and prize eligibility.');
      return;
    }

    window.setTimeout((): void => {
      stopSpin();
      const next = revealedPairs.slice();
      next[revealStep] = chosen;
      setRevealedPairs(next);
      const ns = revealStep + 1;
      setRevealStep(ns);
      setSpinning(false);

      if (ns >= 5) {
        if (!groupMode) {
          const finalPool = remainingList.filter((p) => {
            const ps = phoneToPairs10(p.phoneNorm);
            for (let i = 0; i < 5; i++) if (ps[i] !== next[i]) return false;
            return true;
          });
          const winner = finalPool[0] || remainingList[0];
          if (!winner) {
            alert('No participant matched the final digits - please verify inputs.');
            return;
          }
          setWinnersByPrizeId((prev) => ({ ...prev, [currentPrizeId!]: winner.id }));
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 3500);
        } else {
          const updates: Record<string, number> = {};
          const used = new Set<number>(Object.values(winnersByPrizeId));
          for (const pz of activeGroupPrizes) {
            const pool = dedupedParticipants
              .filter((p) => pz.eligible.includes(p.tier) && !used.has(p.id))
              .filter((p) => {
                const ps = phoneToPairs10(p.phoneNorm);
                for (let i = 0; i < 5; i++) if (ps[i] !== next[i]) return false;
                return true;
              });
            const win = pool[0];
            if (win) {
              updates[pz.id] = win.id;
              used.add(win.id);
            }
          }
          if (Object.keys(updates).length === 0) {
            alert('No participants matched for this group - adjust data or tiers.');
          } else {
            setWinnersByPrizeId((prev) => ({ ...prev, ...updates }));
            setShowConfetti(true);
            window.setTimeout(() => setShowConfetti(false), 3500);
          }
        }
      }
    }, 1200);
  }

  function stopSpin(): void {
    if (spinIntervalRef.current) {
      window.clearInterval(spinIntervalRef.current);
      spinIntervalRef.current = null;
    }
  }

  // CSV loaders
  function handleParticipantsCSVFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string) || '';
      const parsed = parseParticipantsCSV(text);
      if (parsed.length === 0) {
        alert('Participants CSV empty/invalid. Headers: name,phone,tier');
        return;
      }
      setParticipants(parsed);
      setFrozen(false);
      setCurrentPrizeIndex(0);
      setWinnersByPrizeId({});
      resetRound();
      // If prizes are already loaded, auto-enable the play state
      if (parsed.length > 0 && prizes.length > 0) {
        setSetupOpen(false);
      }
    };
    reader.readAsText(f);
  }
  function handlePrizesCSVFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string) || '';
      const parsed = parsePrizesCSV(text);
      if (parsed.length === 0) {
        alert('Prizes CSV empty/invalid. Headers order: id,label,group,subtitle,eligible');
        return;
      }
      setPrizes(parsed);
      setCurrentPrizeIndex(0);
      setWinnersByPrizeId({});
      resetRound();
      // If participants are already loaded, auto-enable the play state
      if (parsed.length > 0 && dedupedParticipants.length > 0) {
        setSetupOpen(false);
      }
    };
    reader.readAsText(f);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (setupOpen) return; // ignore while in setup
      if (e.key === ' ') {
        e.preventDefault();
        drawFlash();
      } else if (e.key.toLowerCase() === 'n') {
        if (groupMode) nextGroup(); else nextPrize();
      } else if (e.key.toLowerCase() === 'u') {
        if (!groupMode) undoLastPrize();
      } else if (e.key.toLowerCase() === 'r') {
        if (groupMode) resetCurrentGroup(); else resetRound();
      } else if (e.key.toLowerCase() === 'p') {
        if (groupMode) prevGroup();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setupOpen, groupMode, revealStep, revealedPairs, currentPrizeIndex, winnersByPrizeId, remainingList]);

  const progress = useMemo(() => ({ done: Object.keys(winnersByPrizeId).length, total: prizes.length || 100 }), [winnersByPrizeId, prizes.length]);
  const currentPrizeId = currentPrize?.id;
  const currentWinner = currentPrizeId
    ? dedupedParticipants.find((p) => p.id === winnersByPrizeId[currentPrizeId]) ?? null
    : null;

  // ------------------------------
  // UI: Presenter + Settings Panel
  // ------------------------------
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0B0B0B] text-[#F5F5F3] select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div className="text-xl md:text-2xl font-semibold">{eventTitle}</div>
        <div className="flex items-center gap-4 text-sm md:text-base opacity-90">
          {currentPrize ? `Prize ${progress.done + 1} of ${progress.total}` : `All prizes ready`}
          <div className="flex items-center gap-2">
            <span className="inline-flex w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            <span>{timeStr}</span>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="relative grid grid-cols-12 gap-6 px-6 pb-28 h-[calc(100%-72px)]">
        {/* Confetti overlay */}
        <Confetti show={showConfetti} />

        <div className="col-span-12 lg:col-span-8 min-h-0 flex flex-col gap-6">
          {/* Meta + Cards */}
          <div className="rounded-2xl p-5 bg-[#161616]/80 border border-[#27272A] shadow-lg flex flex-col min-h-0">
            {/* Meta row */}
            <div className="flex items-start justify-between gap-4">
              <div>
                { !groupMode && currentPrize && ( 
                  <div className="text-lg md:text-xl font-semibold">
                    {currentPrize.group === 'Major' ? 'Major Prize' : currentPrize.label}
                    {currentPrize.subtitle ? <span> • {currentPrize.subtitle}</span> : null}
                  </div>
                )}
                { !groupMode && currentPrize && ( 
                  <div className="mt-2 flex items-center gap-2 text-sm opacity-90">
                    {currentPrize.eligible.map((t) => (
                      <span
                        key={t}
                        className={
                          classNames(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            t === 'T1' && 'bg-[#D97706]/20 text-[#F1C27D] border border-[#D97706]/30',
                            t === 'T2' && 'bg-[#2563EB]/20 text-[#A6C8FF] border border-[#2563EB]/30',
                            t === 'T3' && 'bg-[#0D9488]/20 text-[#74E0D6] border border-[#0D9488]/30'
                          )
                        }
                      >
                        {t}
                      </span>
                    ))}
                    <span className="opacity-60">•</span>
                    <span>Remaining pool: {eligibleForCurrent.length}</span>
                  </div>
                )}
              </div>
              <div className="text-sm opacity-80" />
            </div>

            {/* Meta label above cards */}
            <div className="mt-4 text-xs uppercase tracking-wider opacity-60">Meta</div>

            {/* Five Cards (single) or Group grid */}
            {!groupMode ? (
              <div className="mt-2 grid grid-cols-5 gap-3">
                {revealedPairs.map((p, i) => {
                  const active = i === revealStep && !currentWinner;
                  return (
                    <div
                      key={i}
                      className={
                        classNames(
                          'relative rounded-2xl border bg-[#0E0E0E] h-24 md:h-28 flex items-center justify-center text-3xl md:text-5xl font-extrabold tracking-widest overflow-hidden',
                          active
                            ? 'border-amber-400/60 shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_0_30px_rgba(245,158,11,0.25)]'
                            : 'border-[#27272A]'
                        )
                      }
                    >
                      {active && <div className="absolute inset-0 bg-gradient-to-b from-amber-300/25 via-transparent to-amber-400/10" />}
                      <div className="relative z-10">{i < revealStep ? p : active && spinning ? spinValue : p}</div>
                      <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-black/40 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2 overflow-y-auto min-h-0 max-h-[48vh] pr-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {activeGroupPrizes.map((pz) => {
                  const rv = groupRevealByPrizeId[pz.id] || { pairs: ['--', '--', '--', '--', '--'], step: 0, done: false };
                  const wid = winnersByPrizeId[pz.id];
                  const w = wid ? dedupedParticipants.find((pp) => pp.id === wid) : null;
                  return (
                    <div key={pz.id} className="rounded-2xl p-4 bg-[#0E0E0E] border border-[#27272A]">
                      <div className="font-semibold mb-2 truncate" title={pz.label}>{pz.label}</div>
                      <div className="grid grid-cols-5 gap-2">
                        {rv.pairs.map((pp, i) => {
                          const active = i === rv.step && !rv.done && !w;
                          return (
                            <div
                              key={i}
                              className={
                                classNames(
                                  'relative rounded-xl border bg-[#0E0E0E] h-16 flex items-center justify-center text-2xl font-extrabold tracking-widest overflow-hidden',
                                  active
                                    ? 'border-amber-400/60 shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_0_20px_rgba(245,158,11,0.25)]'
                                    : 'border-[#27272A]'
                                )
                              }
                            >
                              {active && <div className="absolute inset-0 bg-gradient-to-b from-amber-300/25 via-transparent to-amber-400/10" />}
                              <div className="relative z-10">{active && rv.spinning ? (rv.spin ?? pp) : (i < rv.step ? pp : pp)}</div>
                              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-black/40 to-transparent" />
                              <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-black/40 to-transparent" />
                            </div>
                          );
                        })}
                      </div>
                      {w && (
                        <div className="mt-3 text-sm">
                          <div className="font-medium">Winner: {w.name}</div>
                          <div className="opacity-80">{maskWinnerPhone ? `09${maskPhoneLast3(w.phoneNorm)}` : w.phoneNorm} • Tier {w.tier.slice(1)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action buttons (symbol-only) */}
            <div className="mt-6 flex items-center gap-4 hidden">
              {groupMode && activeGroupPrizes.length > 0 && (
                <button
                  onClick={drawFlash}
                  disabled={spinning}
                  title="Draw group (Space)"
                  aria-label="Draw group"
                  className={
                    classNames(
                      'relative w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl',
                      'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500',
                      'shadow-[0_10px_25px_rgba(245,158,11,0.35)] border border-amber-300/40',
                      spinning && 'opacity-80'
                    )
                  }
                >
                  �s��,?
                </button>
              )}
              {currentPrize && !currentWinner && (
                <button
                  onClick={drawFlash}
                  disabled={spinning}
                  title="Draw (Space)"
                  aria-label="Draw (Flash)"
                  className={
                    classNames(
                      'relative w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl',
                      'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500',
                      'shadow-[0_10px_25px_rgba(245,158,11,0.35)] border border-amber-300/40',
                      spinning && 'opacity-80'
                    )
                  }
                >
                  ⚡️
                </button>
              )}

              { !groupMode && currentPrize && ( 
                <button
                  onClick={resetRound}
                  title="Reset round (R)"
                  aria-label="Reset round"
                  className="w-12 h-12 rounded-full bg-[#27272A] border border-[#3a3a3f] flex items-center justify-center text-lg"
                >
                  ↻
                </button>
              )}
              { !groupMode && currentPrize && ( 
                <button
                  onClick={nextPrize}
                  title="Next prize (N)"
                  aria-label="Next prize"
                  className="w-12 h-12 rounded-full bg-[#27272A] border border-[#3a3a3f] flex items-center justify-center text-lg"
                >
                  ⏭️
                </button>
              )}
              { !groupMode && currentPrize && ( 
                <button
                  onClick={undoLastPrize}
                  title="Undo last (U)"
                  aria-label="Undo last"
                  className="w-12 h-12 rounded-full bg-[#27272A] border border-[#3a3a3f] flex items-center justify-center text-lg"
                >
                  ↩️
                </button>
              )}
            </div>
          </div>

          {/* Winner banner */}
          {!groupMode && currentWinner && (
            <div className="relative rounded-2xl p-6 bg-[#161616]/90 border border-[#27272A] overflow-hidden">
              <Confetti show={showConfetti} />
              <div className="relative z-10 flex items-center justify-between">
                <div className="text-lg md:text-xl font-bold">🎉 Winner: {currentWinner.name}</div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-sm font-medium bg-[#2563EB]/20 text-[#A6C8FF] border border-[#2563EB]/30">
                    Tier {currentWinner.tier.slice(1)}
                  </span>
                </div>
              </div>
              <div className="relative z-10 mt-2 text-lg md:text-xl opacity-90">
                {maskWinnerPhone ? `09${maskPhoneLast3(currentWinner.phoneNorm)}` : currentWinner.phoneNorm}
              </div>
            </div>
          )}
        </div>

        {/* Right pane: Participants left — independently scrollable */}
        <div className="col-span-12 lg:col-span-4 min-h-0">
          <div className="rounded-2xl p-5 bg-[#161616]/80 border border-[#27272A] h-full flex flex-col overflow-y-auto min-h-0">
            <div className="flex items-center sticky top-0 bg-[#161616]/80 backdrop-blur-sm z-10 pb-2">
              <div className="text-lg font-semibold">Participants left</div>
            </div>

            <div className="mt-2 flex-1">
              {(groupMode ? groupRemaining : remainingList).length > 30 ? (
                <div className="pr-2">
                  <ul className="space-y-2 text-sm">
                    {(groupMode ? groupRemaining : remainingList).slice(0, 2000).map((p) => (
                      <li key={p.id} className="flex items-center justify-between border-b border-[#27272A]/50 py-1">
                        <span className="truncate mr-2">{p.name}</span>
                        <span className="opacity-80">09{maskPhoneLast3(p.phoneNorm)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 pr-2">
                  {(groupMode ? groupRemaining : remainingList).map((p) => (
                    <div key={p.id} className="rounded-xl border border-[#27272A] bg-[#0E0E0E] p-3">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-sm opacity-80">09{maskPhoneLast3(p.phoneNorm)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-3 text-xs opacity-70">Filtering by revealed digits…</div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="col-span-12 hidden">
          <div className="text-center text-xs opacity-70 mt-2">Hotkeys hint: Space = Draw • N = Next prize • R = Reset round</div>
        </div>
      </div>

      {/* Settings Panel (slide-over) */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSettingsOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-neutral-950 border-l border-neutral-800 p-6 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-semibold">Settings</div>
              <button
                className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center"
                onClick={() => setSettingsOpen(false)}
                title="Close"
                aria-label="Close"
              >
                ✖️
              </button>
            </div>

            <div className="grid grid-cols-12 gap-6">
              {/* Group draw options */}
              <div className="col-span-12 rounded-2xl p-5 bg-neutral-900 border border-neutral-800">
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-neutral-300"
                      checked={groupMode}
                      onChange={(e) => setGroupMode(e.target.checked)}
                    />
                    Group draw mode
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="opacity-70 text-sm">Group:</span>
                    <select
                      className="bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1 text-sm"
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      disabled={!groupMode || groupNames.length === 0}
                    >
                      {groupNames.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    {groupMode && (
                      <span className="opacity-70 text-xs">Active prizes in group: {activeGroupPrizes.length}</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Participants */}
              <div className="col-span-12 xl:col-span-5 rounded-2xl p-5 bg-neutral-900 border border-neutral-800">
                <div className="text-lg font-semibold">Participants</div>
                <div className="mt-3 text-sm opacity-80">
                  CSV headers: <code>name,phone,tier</code>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input type="file" accept=".csv" onChange={handleParticipantsCSVFile} className="text-sm" />
                  <button
                    className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center"
                    onClick={() => setParticipants(generateSampleParticipants(5000))}
                    title="Load sample 5000"
                    aria-label="Load sample"
                  >
                    📂
                  </button>
                  <button
                    className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 disabled:opacity-50 flex items-center justify-center"
                    disabled={!participants.length || frozen}
                    onClick={() => setFrozen(true)}
                    title={frozen ? 'List locked' : 'Lock list'}
                    aria-label="Lock list"
                  >
                    🔒
                  </button>
                </div>
                <div className="mt-3 text-sm">
                  Total uploaded: <span className="font-semibold">{participants.length}</span> • Deduplicated: <span className="font-semibold">{dedupedParticipants.length}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  {(['T1', 'T2', 'T3'] as Tier[]).map((t) => (
                    <div key={t} className="rounded-lg bg-neutral-800 border border-neutral-700 p-3">
                      <div className="opacity-70">{t}</div>
                      <div className="text-xl font-bold">{dedupedParticipants.filter((p) => p.tier === t).length}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prizes */}
              <div className="col-span-12 xl:col-span-7 rounded-2xl p-5 bg-neutral-900 border border-neutral-800">
                <div className="text-lg font-semibold">Prizes</div>
                <div className="mt-3 text-sm opacity-80">
                  CSV headers: <code>id,label,group,subtitle,eligible</code>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input type="file" accept=".csv" onChange={handlePrizesCSVFile} className="text-sm" />
                  <button
                    className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center"
                    onClick={() => setPrizes(buildDefaultPrizes())}
                    title="Load sample 100"
                    aria-label="Load sample prizes"
                  >
                    🎁
                  </button>
                </div>
                <div className="mt-3 text-sm">Total prizes: <span className="font-semibold">{prizes.length}</span></div>
                <div className="mt-3 rounded-xl bg-neutral-800 border border-neutral-700 p-4 max-h-56 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left opacity-70">
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Label</th>
                        <th className="py-1 pr-2">Group</th>
                        <th className="py-1 pr-2">Eligible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prizes.slice(0, 50).map((pz, i) => (
                        <tr key={pz.id} className="border-t border-neutral-700/60">
                          <td className="py-1 pr-2">{i + 1}</td>
                          <td className="py-1 pr-2">{pz.label}</td>
                          <td className="py-1 pr-2">{pz.group}</td>
                          <td className="py-1 pr-2">{pz.eligible.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {prizes.length > 50 && <div className="text-xs opacity-70 mt-2">(+{prizes.length - 50} more…)</div>}
                </div>

                <div className="mt-4 rounded-xl bg-neutral-800 border border-neutral-700 p-4">
                  <div className="text-sm opacity-80 mb-2">Winners so far</div>
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left opacity-70">
                          <th className="py-1 pr-2">#</th>
                          <th className="py-1 pr-2">Prize</th>
                          <th className="py-1 pr-2">Group</th>
                          <th className="py-1 pr-2">Winner</th>
                          <th className="py-1 pr-2">Phone</th>
                          <th className="py-1 pr-2">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prizes.map((pz, i) => {
                          const wid = winnersByPrizeId[pz.id];
                          const w = dedupedParticipants.find((p) => p.id === wid);
                          return (
                            <tr key={pz.id} className="border-t border-neutral-700/60">
                              <td className="py-1 pr-2">{i + 1}</td>
                              <td className="py-1 pr-2">{pz.label}</td>
                              <td className="py-1 pr-2">{pz.group}</td>
                              <td className="py-1 pr-2">{w ? w.name : '—'}</td>
                              <td className="py-1 pr-2">{w ? w.phoneNorm : '—'}</td>
                              <td className="py-1 pr-2">{w ? w.tier : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-neutral-300"
                        checked={maskWinnerPhone}
                        onChange={(e) => setMaskWinnerPhone(e.target.checked)}
                      />
                      Mask winner phone on stream
                    </label>
                    <button
                      className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center"
                      onClick={() => {
                        const items = prizes.map((pz, i) => {
                          const wid = winnersByPrizeId[pz.id];
                          const w = dedupedParticipants.find((p) => p.id === wid);
                          return {
                            order: i + 1,
                            prizeId: pz.id,
                            prizeLabel: pz.label,
                            group: pz.group,
                            eligible: pz.eligible,
                            winner: w ? { name: w.name, phone: w.phoneNorm, tier: w.tier } : null,
                          };
                        });
                        const blob = new Blob(
                          [
                            JSON.stringify(
                              {
                                eventTitle,
                                seedText,
                                participantCount: dedupedParticipants.length,
                                timestamp: new Date().toISOString(),
                                results: items,
                              },
                              null,
                              2
                            ),
                          ],
                          { type: 'application/json' }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `lottery-results-${Date.now()}.json`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      }}
                      title="Export results (JSON)"
                      aria-label="Export results"
                    >
                      ⬇️
                    </button>
                  </div>
                </div>

                {isBrowser && new URLSearchParams(window.location.search).get('test') === '1' && (
                  <div className="mt-4 rounded-xl bg-neutral-800 border border-neutral-700 p-4">
                    <div className="text-sm font-semibold mb-2">Self-tests</div>
                    <SelfTests />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed bottom control bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="px-6 pb-4 pt-3 flex items-center justify-between gap-4 bg-[#0B0B0B]/80 backdrop-blur supports-[backdrop-filter]:bg-[#0B0B0B]/60 border-t border-[#27272A]">
          <div className="text-xs opacity-70">Hotkeys: Space = Draw • N = Next • U = Undo • R = Reset</div>
          <div className="flex items-center gap-3">
            <button
              onClick={drawFlash}
              disabled={!groupMode ? (!!currentWinner || !currentPrize) : !activeGroupPrizes.some((pz) => !winnersByPrizeId[pz.id] && !(groupRevealByPrizeId[pz.id]?.done))}
              title="Draw (Space)"
              aria-label="Draw"
              className={
                classNames(
                  'relative w-12 h-12 rounded-full flex items-center justify-center font-bold text-base',
                  'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500',
                  'shadow-[0_10px_25px_rgba(245,158,11,0.35)] border border-amber-300/40',
                  (!groupMode && (!!currentWinner || !currentPrize)) && 'opacity-50',
                  (groupMode && !activeGroupPrizes.some((pz) => !winnersByPrizeId[pz.id] && !(groupRevealByPrizeId[pz.id]?.done))) && 'opacity-50'
                )
              }
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-black" fill="currentColor" aria-hidden>
                <path d="M13 2L5 13h6l-2 9 10-14h-6l2-6z"/>
              </svg>
            </button>
            {/* Reset: single mode resets round; group mode resets current group */}
            <button
              onClick={groupMode ? resetCurrentGroup : resetRound}
              title={groupMode ? 'Reset group (R)' : 'Reset round (R)'}
              aria-label="Reset"
              className={
                classNames('w-11 h-11 rounded-full bg-[#27272A] border border-[#3a3a3f] flex items-center justify-center text-sm')
              }
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-neutral-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-9-9"/>
                <path d="M3 5v6h6"/>
              </svg>
            </button>

            {/* Prev / Undo */}
            {groupMode ? (
              <button
                onClick={prevGroup}
                title="Prev group"
                aria-label="Prev group"
                className="w-11 h-11 rounded-full bg-[#27272A] border border-[#3a3a3f] flex items-center justify-center text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-neutral-200" fill="currentColor" aria-hidden>
                  <path d="M19 7l-7 5 7 5V7z"/>
                  <path d="M12 7l-7 5 7 5V7z"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={undoLastPrize}
                disabled={prizes.length === 0}
                title="Undo last (U)"
                aria-label="Undo last"
                className={
                  classNames('w-11 h-11 rounded-full bg-[#27272A] border border-[#3a3a3f] flex items-center justify-center text-sm',
                    prizes.length === 0 && 'opacity-50 cursor-not-allowed')
                }
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-neutral-200" fill="currentColor" aria-hidden>
                  <path d="M7 12l5-5v3h7v4h-7v3l-5-5z"/>
                </svg>
              </button>
            )}

            {/* Next: single -> next prize, group -> next group */}
            <button
              onClick={groupMode ? nextGroup : nextPrize}
              title={groupMode ? 'Next group (N)' : 'Next prize (N)'}
              aria-label="Next"
              className="w-11 h-11 rounded-full bg-[#27272A] border border-[#3a3a3f] flex items-center justify-center text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-neutral-200" fill="currentColor" aria-hidden>
                <path d="M5 7l7 5-7 5V7z"/>
                <path d="M12 7l7 5-7 5V7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Settings button (symbol-only) */}
      <button
        aria-label="Settings"
        className="fixed top-6 right-6 rounded-full w-9 h-9 flex items-center justify-center bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-transparent"
        onClick={() => setSettingsOpen(true)}
        title="Open settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.26 1.3.73 1.77.47.47 1.11.73 1.77.73H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        ⚙️
      </button>

      {/* SETUP OVERLAY */}
      {setupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-4xl mx-auto bg-[#0E0E0E] border border-[#27272A] rounded-2xl p-6 text-sm shadow-2xl">
            <div className="text-xl font-semibold mb-4">Setup — load your CSV</div>
            {/* Seed selection */}
            <div className="rounded-xl bg-[#161616] border border-[#27272A] p-4 mb-4">
              <div className="font-medium mb-2">Seed</div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={seedText}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    if (!raw) { setSeedText(''); return; }
                    let n = parseInt(raw, 10);
                    if (Number.isNaN(n)) { setSeedText(''); return; }
                    n = Math.max(1, Math.min(100, n));
                    setSeedText(String(n));
                  }}
                  placeholder="Enter seed (1-100)"
                  className="flex-1 rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
                />
                <button
                  className="w-10 h-10 rounded-md bg-neutral-800 border border-neutral-700 flex items-center justify-center hover:bg-neutral-700"
                  onClick={() => setSeedText(String(Math.floor(Math.random() * 100) + 1))}
                  title="Pick random numeric seed"
                  aria-label="Random seed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 10a8 8 0 0 0-14.9-4M4 14a8 8 0 0 0 14.9 4" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 text-xs opacity-70">Seed must be a number between 1 and 100. Draws are deterministic for a given seed.</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-[#161616] border border-[#27272A] p-4">
                <div className="font-medium mb-2">Participants CSV</div>
                <div className="opacity-80 mb-3">
                  Headers: <code>name,phone,tier</code>
                </div>
                <div className="flex items-center gap-3">
                  <input type="file" accept=".csv" onChange={handleParticipantsCSVFile} />
                  <button
                    className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center"
                    onClick={() => setParticipants(generateSampleParticipants(5000))}
                    title="Load sample 5000"
                    aria-label="Load sample participants"
                  >
                    📂
                  </button>
                </div>
                <div className="mt-3 text-xs opacity-80">
                  Loaded: <span className="font-semibold">{participants.length}</span> • Deduped: <span className="font-semibold">{dedupedParticipants.length}</span>
                </div>
              </div>

              <div className="rounded-xl bg-[#161616] border border-[#27272A] p-4">
                <div className="font-medium mb-2">Prizes CSV</div>
                <div className="opacity-80 mb-3">
                  Headers: <code>id,label,group,subtitle,eligible</code>
                </div>
                <div className="flex items-center gap-3">
                  <input type="file" accept=".csv" onChange={handlePrizesCSVFile} />
                  <button
                    className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center"
                    onClick={() => setPrizes(buildDefaultPrizes())}
                    title="Load sample 100"
                    aria-label="Load sample prizes"
                  >
                    🎁
                  </button>
                </div>
                <div className="mt-3 text-xs opacity-80">
                  Loaded prizes: <span className="font-semibold">{prizes.length}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="opacity-70">You can also change these later from ⚙️ Settings.</div>
              <button
                disabled={dedupedParticipants.length === 0 || prizes.length === 0}
                onClick={() => setSetupOpen(false)}
                title="Start show"
                aria-label="Start show"
                className={
                  classNames(
                    'w-12 h-12 rounded-full flex items-center justify-center text-xl',
                    dedupedParticipants.length && prizes.length
                      ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_10px_25px_rgba(245,158,11,0.35)] border border-amber-300/40'
                      : 'bg-neutral-800 border border-neutral-700 opacity-60'
                  )
                }
              >
                ▶️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelfTests() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  useEffect(() => {
    setResults(runSelfTests());
  }, []);
  if (!results) return <div className="text-sm opacity-70">Running…</div>;
  const okAll = results.every((r) => r.ok);
  return (
    <div>
      <div className={okAll ? 'text-green-300' : 'text-red-300'}>Overall: {okAll ? 'PASS' : 'FAIL'}</div>
      <ul className="mt-2 text-xs space-y-1">
        {results.map((r, i) => (
          <li key={i} className={r.ok ? 'text-neutral-300' : 'text-red-400'}>
            {r.ok ? '✔' : '✖'} {r.name} {r.ok ? '' : `— ${r.err}`}
          </li>
        ))}
      </ul>
    </div>
  );
}









