import React, { useState, useEffect } from 'react';
import { ProductionLine } from './types/uph';
import { INITIAL_LINES } from './data/initialData';
import { calculateLineCapacity, evaluateHourlyPerformance } from './utils/calculations';
import { CapacityCalculator } from './components/CapacityCalculator';
import { HourlyDashboard } from './components/HourlyDashboard';
import { SummaryDashboard } from './components/SummaryDashboard';
import {
  Plus,
  Download,
  Bell,
  Calculator,
  BarChart3,
  LayoutDashboard,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

const STORAGE_KEY_LINES = 'uph_performance_lines_v2';
const STORAGE_KEY_UI_STATE = 'uph_performance_ui_state_v2';

interface SavedUIState {
  selectedTab: string;
  activeView: 'both' | 'dashboard' | 'calculator' | 'summary';
  lastSavedAt: string;
}

function formatCurrentTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function App() {
  const [lines, setLines] = useState<ProductionLine[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LINES) || localStorage.getItem('uph_performance_lines_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback to initial data
    }
    return INITIAL_LINES;
  });

  const [selectedTab, setSelectedTab] = useState<string>(() => {
    try {
      const savedUI = localStorage.getItem(STORAGE_KEY_UI_STATE);
      if (savedUI) {
        const parsed: SavedUIState = JSON.parse(savedUI);
        if (parsed.selectedTab) return parsed.selectedTab;
      }
    } catch {
      // ignore
    }
    return 'line-b';
  });

  const [activeView, setActiveView] = useState<'both' | 'dashboard' | 'calculator' | 'summary'>(() => {
    try {
      const savedUI = localStorage.getItem(STORAGE_KEY_UI_STATE);
      if (savedUI) {
        const parsed: SavedUIState = JSON.parse(savedUI);
        if (parsed.activeView) return parsed.activeView;
      }
    } catch {
      // ignore
    }
    return 'both';
  });

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string>(() => {
    try {
      const savedUI = localStorage.getItem(STORAGE_KEY_UI_STATE);
      if (savedUI) {
        const parsed: SavedUIState = JSON.parse(savedUI);
        if (parsed.lastSavedAt) return parsed.lastSavedAt;
      }
    } catch {
      // ignore
    }
    return formatCurrentTime();
  });

  // Real-Time Auto-Save Effect whenever lines, selectedTab, or activeView changes
  useEffect(() => {
    setSaveStatus('saving');
    const nowStr = formatCurrentTime();
    try {
      localStorage.setItem(STORAGE_KEY_LINES, JSON.stringify(lines));
      const uiState: SavedUIState = {
        selectedTab,
        activeView,
        lastSavedAt: nowStr,
      };
      localStorage.setItem(STORAGE_KEY_UI_STATE, JSON.stringify(uiState));
    } catch {
      // Ignore storage quota issues
    }
    const timer = setTimeout(() => {
      setLastSavedAt(nowStr);
      setSaveStatus('saved');
    }, 150);

    return () => clearTimeout(timer);
  }, [lines, selectedTab, activeView]);

  // Cross-tab Auto-Sync listener (if user opens Calculator on one tab and Summary Dashboard on another)
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_LINES && e.newValue) {
        try {
          const updatedLines = JSON.parse(e.newValue);
          if (Array.isArray(updatedLines) && updatedLines.length > 0) {
            setLines(updatedLines);
            setLastSavedAt(formatCurrentTime());
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  const activeLine = lines.find((l) => l.id === selectedTab) || lines[0];

  // Count total active alerts across all lines
  const totalAlertsCount = lines.reduce((sum, l) => {
    const perf = evaluateHourlyPerformance(l, 1);
    return sum + perf.alerts.length;
  }, 0);

  const handleUpdateLine = (updatedLine: ProductionLine) => {
    setLines((prev) => prev.map((l) => (l.id === updatedLine.id ? updatedLine : l)));
  };

  const handleAddLine = () => {
    const nextLetter = String.fromCharCode(65 + lines.length);
    const template = activeLine || INITIAL_LINES[1];
    const newId = `line-${Date.now()}`;
    const newLine: ProductionLine = {
      ...template,
      id: newId,
      name: `Line ${nextLetter}`,
      productCode: `ASSY-NEW-${100 + lines.length * 50}`,
      hourlySlots: template.hourlySlots.map((s, idx) => ({
        ...s,
        id: `${newId}-s${s.shift}-h${idx + 1}`,
        actualGood: s.hourIndex <= 3 ? s.targetGood : null,
        defectCount: 0,
        downtimeMinutes: 0,
        downtimeReason: '',
        actionNote: '',
      })),
    };
    setLines((prev) => [...prev, newLine]);
    setSelectedTab(newId);
    if (activeView === 'summary') {
      setActiveView('both');
    }
  };

  const handleResetAllToDefaults = () => {
    setLines(INITIAL_LINES);
    setSelectedTab('line-b');
    setActiveView('both');
    localStorage.removeItem(STORAGE_KEY_LINES);
    localStorage.removeItem(STORAGE_KEY_UI_STATE);
  };

  const handleExportCSV = () => {
    const targetLine = activeLine;
    const cap = calculateLineCapacity(targetLine);
    const hourly = evaluateHourlyPerformance(targetLine, 1);

    const rows: string[][] = [
      ['UPH Performance & Capacity Report', targetLine.name, targetLine.productCode],
      ['Target UPH', String(cap.targetUPH), 'Takt Time (s)', cap.taktTimeSec.toFixed(2)],
      ['Target CT (s)', cap.targetCTSec.toFixed(2), 'Line Speed (m/min)', cap.lineSpeedMPerMin.toFixed(2)],
      ['Design UPH', cap.designUPH.toFixed(1), 'OEE (%)', cap.oeePct.toFixed(1)],
      ['Operators Required', String(cap.requiredOperators), 'Daily Target Output', String(cap.dailyTargetGoodOutput)],
      [],
      [
        'Time Range',
        'Planned Mins',
        'Target Good',
        'Actual Good',
        'Variance',
        'Cumulative Actual',
        'Cumulative Target',
        'Achievement (%)',
        'NG Defects',
        'Downtime (m)',
        'Reason / Action',
      ],
      ...hourly.enrichedSlots.map((s) => [
        s.timeRange,
        String(s.plannedMinutes),
        String(s.adjustedTargetGood),
        s.actualGood === null ? '' : String(s.actualGood),
        s.actualGood === null ? '' : String(s.varianceUnits),
        String(s.cumulativeActual),
        String(s.cumulativeTarget),
        s.actualGood === null ? '' : s.achievementPct.toFixed(1),
        String(s.defectCount),
        String(s.downtimeMinutes),
        `"${(s.downtimeReason || s.actionNote || '').replace(/"/g, '""')}"`,
      ]),
    ];

    const csvContent = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetLine.name.replace(/\s+/g, '_')}_UPH_Report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isSummaryPage = selectedTab === 'factory' || activeView === 'summary';

  return (
    <div className="min-h-screen bg-[#F3F5F8] text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones (Brand wordmark | Nav links | Primary Action) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              if (selectedTab === 'factory') setSelectedTab('line-b');
              setActiveView('both');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            Capacity UPH Calculator
          </a>

          {/* Zone 2: Clean text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => {
                setSelectedTab('factory');
                setActiveView('summary');
              }}
              className={`hover:text-slate-900 transition-colors py-1 border-b-2 whitespace-nowrap ${
                isSummaryPage
                  ? 'border-blue-800 text-blue-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              Summary Dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedTab === 'factory') setSelectedTab('line-b');
                setActiveView('both');
              }}
              className={`hover:text-slate-900 transition-colors py-1 border-b-2 whitespace-nowrap ${
                !isSummaryPage && activeView === 'both'
                  ? 'border-blue-800 text-blue-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              หน้าหลัก (Calculator + รายชั่วโมง)
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedTab === 'factory') setSelectedTab('line-b');
                setActiveView('dashboard');
              }}
              className={`hover:text-slate-900 transition-colors py-1 border-b-2 whitespace-nowrap ${
                !isSummaryPage && activeView === 'dashboard'
                  ? 'border-blue-800 text-blue-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              Dashboard รายชั่วโมง ({totalAlertsCount} แจ้งเตือน)
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedTab === 'factory') setSelectedTab('line-b');
                setActiveView('calculator');
              }}
              className={`hover:text-slate-900 transition-colors py-1 border-b-2 whitespace-nowrap ${
                !isSummaryPage && activeView === 'calculator'
                  ? 'border-blue-800 text-blue-900 font-semibold'
                  : 'border-transparent'
              }`}
            >
              คำนวณ UPH &amp; Line Balance
            </button>
            <button
              type="button"
              onClick={handleResetAllToDefaults}
              className="hover:text-slate-900 transition-colors py-1 border-b-2 border-transparent whitespace-nowrap text-slate-500"
            >
              คืนค่าเริ่มต้น
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B4F9F] hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Subtitle, Auto-Save Status Indicator & Line Selector Bar */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Capacity UPH Calculator &amp; Real-Time Summary Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                กรอกเฉพาะ Target แล้วระบบคำนวณ Takt Time, Cycle Time, UPH และ Line Speed ให้อัตโนมัติ พร้อมบันทึกข้อมูลอัตโนมัติและสรุปผลผ่าน Summary Dashboard
              </p>
            </div>

            {/* Real-Time Auto-Save Status Display */}
            <div className="flex items-center gap-2 text-xs text-slate-600 self-start md:self-end whitespace-nowrap">
              {saveStatus === 'saved' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>บันทึกอัตโนมัติแล้ว</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums text-slate-500">{lastSavedAt}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />
                  <span>กำลังบันทึกอัตโนมัติ...</span>
                </>
              )}
            </div>
          </div>

          {/* Line Selector Tabs + Page Mode Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {lines.map((line) => {
                const isSelected = !isSummaryPage && selectedTab === line.id;
                const lineAlerts = evaluateHourlyPerformance(line, 1).alerts;
                const hasCritical = lineAlerts.some((a) => a.severity === 'critical');

                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => {
                      setSelectedTab(line.id);
                      if (activeView === 'summary') {
                        setActiveView('both');
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#0B4F9F] text-white border-[#0B4F9F]'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{line.name}</span>
                    {hasCritical && (
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isSelected ? 'bg-red-300' : 'bg-red-600'
                        }`}
                        title="มีชั่วโมงที่พลาดเป้าหมาย UPH"
                      />
                    )}
                  </button>
                );
              })}

              {/* Summary Dashboard / รวมโรงงาน Button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedTab('factory');
                  setActiveView('summary');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  isSummaryPage
                    ? 'bg-[#0B4F9F] text-white border-[#0B4F9F]'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Summary Dashboard (รวมโรงงาน)</span>
              </button>

              <button
                type="button"
                onClick={handleAddLine}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                เพิ่มไลน์ผลิต
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg self-start">
              <button
                type="button"
                onClick={() => {
                  setSelectedTab('factory');
                  setActiveView('summary');
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  isSummaryPage
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Summary Dashboard
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedTab === 'factory') setSelectedTab('line-b');
                  setActiveView('both');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  !isSummaryPage && activeView === 'both'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Calculator + รายชั่วโมง
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedTab === 'factory') setSelectedTab('line-b');
                  setActiveView('calculator');
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  !isSummaryPage && activeView === 'calculator'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                คำนวณ UPH
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedTab === 'factory') setSelectedTab('line-b');
                  setActiveView('dashboard');
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  !isSummaryPage && activeView === 'dashboard'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Dashboard รายชั่วโมง
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Switcher */}
        {isSummaryPage ? (
          <SummaryDashboard
            lines={lines}
            lastSavedAt={lastSavedAt}
            onSelectLine={(lineId, mode) => {
              setSelectedTab(lineId);
              setActiveView(mode);
            }}
          />
        ) : (
          <div className="space-y-8">
            {/* Section A: Capacity UPH Calculator */}
            {(activeView === 'both' || activeView === 'calculator') && (
              <section aria-label="Capacity UPH Calculator" className="space-y-3">
                <CapacityCalculator line={activeLine} onUpdateLine={handleUpdateLine} />
              </section>
            )}

            {/* Section B: Real-Time Hourly UPH Performance Dashboard & Alert System */}
            {(activeView === 'both' || activeView === 'dashboard') && (
              <section aria-label="Real-time Hourly UPH Dashboard" className="space-y-3">
                {activeView === 'both' && (
                  <div className="flex items-center justify-between border-t border-slate-300 pt-6">
                    <div className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-blue-900" />
                      <h2 className="text-xl font-bold text-slate-900">
                        Real-Time Hourly UPH Dashboard &amp; ระบบแจ้งเตือนเมื่อเป้าหมายพลาด ({activeLine.name})
                      </h2>
                    </div>
                  </div>
                )}
                <HourlyDashboard
                  line={activeLine}
                  onUpdateLine={handleUpdateLine}
                  onSwitchToCalculator={() => setActiveView('calculator')}
                />
              </section>
            )}
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-12">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>Capacity UPH Calculator &amp; Real-Time Hourly Production Monitoring</span>
          <span>
            สูตรมาตรฐาน: TT = 3600 ÷ UPH · Target CT = TT × OEE · Line Speed = Pitch × 60 ÷ CT
          </span>
        </div>
      </footer>
    </div>
  );
}
