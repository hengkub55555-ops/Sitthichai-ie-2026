import React, { useState, useEffect } from 'react';
import { ProductionLine, HourlySlot } from '../types/uph';
import {
  calculateLineCapacity,
  evaluateHourlyPerformance,
  EnrichedHourlySlot,
} from '../utils/calculations';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Wrench,
  Volume2,
  VolumeX,
  BarChart3,
  TrendingUp,
} from 'lucide-react';

interface HourlyDashboardProps {
  line: ProductionLine;
  onUpdateLine: (updated: ProductionLine) => void;
  onSwitchToCalculator: () => void;
}

const QUICK_DOWNTIME_REASONS = [
  'รอวัตถุดิบ/พาร์ทจากคลัง',
  'เซ็นเซอร์/เครื่องจักรขัดข้อง',
  'ปรับตั้ง Jig / Torque',
  'ปัญหาคุณภาพชิ้นงาน (QC Hold)',
  'เปลี่ยนรุ่นการผลิต (Changeover)',
];

export const HourlyDashboard: React.FC<HourlyDashboardProps> = ({
  line,
  onUpdateLine,
  onSwitchToCalculator,
}) => {
  const [selectedShift, setSelectedShift] = useState<1 | 2>(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'missed_or_warn' | 'on_target'>('all');
  const [chartType, setChartType] = useState<'hourly' | 'cumulative'>('hourly');
  const [activeSlotId, setActiveSlotId] = useState<string>(() => {
    const current = line.hourlySlots.find((s) => s.isCurrentHour && s.shift === 1);
    return current ? current.id : line.hourlySlots[0]?.id || '';
  });

  const [isLiveRunning, setIsLiveRunning] = useState<boolean>(false);
  const [elapsedCycleSec, setElapsedCycleSec] = useState<number>(0);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(true);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);

  const cap = calculateLineCapacity(line);
  const summary = evaluateHourlyPerformance(line, selectedShift);

  useEffect(() => {
    const shiftSlots = line.hourlySlots.filter((s) => s.shift === selectedShift);
    const current =
      shiftSlots.find((s) => s.isCurrentHour) ||
      shiftSlots.find((s) => s.actualGood !== null) ||
      shiftSlots[0];
    if (current) {
      setActiveSlotId(current.id);
    }
  }, [line.id, selectedShift]);

  const playAlertBeep = () => {
    if (!soundAlertsEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Ignore if audio context not unlocked
    }
  };

  useEffect(() => {
    if (!isLiveRunning) return;
    const interval = setInterval(() => {
      setElapsedCycleSec((prev) => +(prev + 0.5).toFixed(1));
    }, 500);
    return () => clearInterval(interval);
  }, [isLiveRunning]);

  const activeSlot: EnrichedHourlySlot | undefined =
    summary.enrichedSlots.find((s) => s.id === activeSlotId) || summary.enrichedSlots[0];

  const handleUpdateSlot = (slotId: string, changes: Partial<HourlySlot>) => {
    const updatedSlots = line.hourlySlots.map((slot) =>
      slot.id === slotId ? { ...slot, ...changes } : slot
    );
    onUpdateLine({
      ...line,
      hourlySlots: updatedSlots,
    });
  };

  const handleQuickIncrement = (
    field: 'actualGood' | 'defectCount' | 'downtimeMinutes',
    delta: number
  ) => {
    if (!activeSlot) return;
    const currentVal =
      field === 'actualGood'
        ? activeSlot.actualGood ?? 0
        : field === 'defectCount'
        ? activeSlot.defectCount
        : activeSlot.downtimeMinutes;

    const nextVal = Math.max(0, currentVal + delta);
    handleUpdateSlot(activeSlot.id, { [field]: nextVal });

    if (field === 'actualGood') {
      setElapsedCycleSec(0);
    }
  };

  const handleSimulateMissedHour = () => {
    if (!activeSlot) return;
    const missedVal = Math.max(0, Math.round(activeSlot.adjustedTargetGood * 0.75));
    handleUpdateSlot(activeSlot.id, {
      actualGood: missedVal,
      defectCount: Math.max(4, activeSlot.defectCount),
      downtimeMinutes: 12,
      downtimeReason: 'เครื่องจักรสถานี Bottleneck หยุดฉุกเฉิน (Sensor Fault)',
      actionNote: 'แจ้งเตือนหัวหน้างานและฝ่ายซ่อมบำรุงเข้าแก้ไข',
    });
    playAlertBeep();
  };

  const handleResetShiftActuals = () => {
    const updatedSlots = line.hourlySlots.map((slot) =>
      slot.shift === selectedShift
        ? {
            ...slot,
            actualGood: slot.hourIndex <= 2 ? slot.targetGood : null,
            defectCount: 0,
            downtimeMinutes: 0,
            downtimeReason: '',
            actionNote: '',
          }
        : slot
    );
    onUpdateLine({
      ...line,
      hourlySlots: updatedSlots,
    });
  };

  const handleAddHourSlot = () => {
    const shiftSlots = line.hourlySlots.filter((s) => s.shift === selectedShift);
    const nextIdx = shiftSlots.length + 1;
    const newSlot: HourlySlot = {
      id: `${line.id}-s${selectedShift}-h${Date.now()}`,
      shift: selectedShift,
      hourIndex: nextIdx,
      timeRange: `ชั่วโมงที่ ${nextIdx} (OT)`,
      plannedMinutes: 60,
      targetGood: Math.round(cap.targetUPH),
      actualGood: null,
      defectCount: 0,
      downtimeMinutes: 0,
      downtimeReason: '',
      actionNote: '',
    };
    onUpdateLine({
      ...line,
      hourlySlots: [...line.hourlySlots, newSlot],
    });
  };

  const visibleAlerts = summary.alerts.filter((a) => !dismissedAlertIds.includes(a.id));

  const filteredTableSlots = summary.enrichedSlots.filter((slot) => {
    if (statusFilter === 'missed_or_warn') {
      return slot.status === 'missed' || slot.status === 'warning';
    }
    if (statusFilter === 'on_target') {
      return slot.status === 'on_target';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. REAL-TIME ALERT SYSTEM BANNER */}
      {visibleAlerts.length > 0 ? (
        <div className="bg-red-50/90 border-2 border-red-600 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-red-200 pb-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-600 text-white rounded-xl shrink-0 mt-0.5">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-red-950 font-bold text-base">
                  <span>แจ้งเตือนเป้าหมายการผลิตพลาด (Missed UPH Target Alert)</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums text-sm text-red-700">
                    พบ {visibleAlerts.length} จุดที่ต้องเร่งแก้ไข
                  </span>
                </div>
                <p className="text-xs text-red-800 mt-0.5">
                  ระบบตรวจพบชั่วโมงที่ผลิตได้ต่ำกว่าเกณฑ์ ({line.criticalThresholdPct}% ของ Target UPH) หรือยอดผลิตสะสมตามหลังแผน
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSoundAlertsEnabled(!soundAlertsEnabled)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap"
              >
                {soundAlertsEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    เสียงเตือน: เปิด
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    เสียงเตือน: ปิด
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setDismissedAlertIds(summary.alerts.map((a) => a.id))}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors whitespace-nowrap"
              >
                รับทราบทั้งหมด
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {visibleAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border ${
                  alert.severity === 'critical'
                    ? 'bg-white border-red-300'
                    : 'bg-amber-50/80 border-amber-300'
                } flex flex-col justify-between gap-2.5`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <span
                        className={
                          alert.severity === 'critical' ? 'text-red-700' : 'text-amber-800'
                        }
                      >
                        {alert.severity === 'critical' ? 'วิกฤต (Critical)' : 'เฝ้าระวัง (Warning)'}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-900">{alert.title}</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">{alert.description}</p>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-bold text-red-700 shrink-0">
                    -{alert.shortfallUnits} ชิ้น
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-600">
                    <strong className="text-slate-900">คำแนะนำ:</strong> {alert.recommendedAction}
                  </span>
                  {alert.slotId && (
                    <button
                      type="button"
                      onClick={() => setActiveSlotId(alert.slotId!)}
                      className="text-[#0B4F9F] hover:underline font-bold whitespace-nowrap shrink-0"
                    >
                      เลือกชั่วโมงนี้ →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {summary.remainingPlannedHours > 0 && summary.cumulativeVariance < 0 && (
            <div className="bg-red-900 text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs space-y-1">
                <div className="font-bold text-sm">
                  แผนชดเชยยอดผลิตที่ขาดในกะนี้ (Auto Recovery UPH Plan)
                </div>
                <div className="text-red-100">
                  ขณะนี้ยอดสะสมตามหลังแผนอยู่{' '}
                  <strong className="font-mono tabular-nums text-white underline">
                    {Math.abs(summary.cumulativeVariance)} ชิ้น
                  </strong>{' '}
                  · เหลือเวลาเดินเครื่องในกะนี้อีก{' '}
                  <strong className="font-mono tabular-nums text-white">
                    {summary.remainingPlannedHours.toFixed(2)} ชม.
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0 bg-red-950/70 px-4 py-2.5 rounded-lg border border-red-700">
                <div className="text-right">
                  <div className="text-xs text-red-200">ต้องเร่งความเร็วในชั่วโมงที่เหลือเป็น</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-white">
                    {summary.requiredRecoveryUPH.toFixed(1)} ชิ้น/ชม.
                  </div>
                  <div className="text-[11px] text-red-200 font-mono">
                    (Design UPH สูงสุดของไลน์ = {cap.designUPH.toFixed(1)} ชิ้น/ชม.)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <div className="text-sm font-bold text-emerald-950">
                สถานะการผลิตปกติ (All Hourly Targets On Track)
              </div>
              <div className="text-xs text-emerald-800">
                ทุกชั่วโมงที่บันทึกผลผ่านเกณฑ์เป้าหมาย UPH ({cap.targetUPH} ชิ้น/ชม.) หรือรับทราบการแจ้งเตือนครบแล้ว
              </div>
            </div>
          </div>
          {dismissedAlertIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDismissedAlertIds([])}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
            >
              แสดงรายการแจ้งเตือน ({dismissedAlertIds.length})
            </button>
          )}
        </div>
      )}

      {/* 2. TOP KPI SUMMARY STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">ยอดผลิตสะสม (จริง / เป้าสะสม)</span>
            <span>กะที่ {selectedShift}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {summary.totalActualGood.toLocaleString()}
            </span>
            <span className="text-sm font-mono tabular-nums text-slate-500">
              / {summary.completedTargetGood.toLocaleString()} ชิ้น
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                summary.cumulativeVariance >= 0 ? 'bg-emerald-600' : 'bg-red-600'
              }`}
              style={{ width: `${Math.min(100, summary.overallAchievementPct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span
              className={`font-mono tabular-nums font-bold ${
                summary.cumulativeVariance >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {summary.cumulativeVariance >= 0
                ? `+${summary.cumulativeVariance} ชิ้น (นำแผน)`
                : `${summary.cumulativeVariance} ชิ้น (ตามหลังแผน)`}
            </span>
            <span className="text-slate-500 font-mono">
              เป้ากะนี้ {summary.totalShiftTargetGood.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">UPH เฉลี่ยจริงเทียบเป้าหมาย</span>
            <span className="font-mono">เป้า {cap.targetUPH}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                summary.overallAchievementPct >= 100
                  ? 'text-emerald-700'
                  : summary.overallAchievementPct >= line.warningThresholdPct
                  ? 'text-amber-700'
                  : 'text-red-700'
              }`}
            >
              {summary.averageActualUPH.toFixed(1)}
            </span>
            <span className="text-sm text-slate-500">ชิ้นดี/ชม.</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0B4F9F] rounded-full"
              style={{
                width: `${Math.min(100, (summary.averageActualUPH / Math.max(1, cap.designUPH)) * 100)}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              บรรลุเป้า: <strong className="font-mono text-slate-900">{summary.overallAchievementPct.toFixed(1)}%</strong>
            </span>
            <span className="font-mono">Design: {cap.designUPH.toFixed(1)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Takt Time / Target Line CT</span>
            <button
              type="button"
              onClick={onSwitchToCalculator}
              className="text-[#0B4F9F] hover:underline font-semibold"
            >
              ปรับตั้งค่า →
            </button>
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-bold text-[#0B4F9F]">
              {cap.taktTimeSec.toFixed(1)}s
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-xl font-bold text-slate-800">
              {cap.targetCTSec.toFixed(1)}s
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full"
              style={{ width: `${Math.min(100, cap.oeePct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 font-mono">
            <span>Speed: {cap.lineSpeedMPerMin.toFixed(2)} m/min</span>
            <span>OEE: {cap.oeePct.toFixed(1)}%</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">คุณภาพ (FPY) &amp; เวลาหยุดเครื่อง</span>
            <span className="font-mono">เกณฑ์ {line.qualityPct}%</span>
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span
              className={`text-2xl font-bold ${
                summary.overallFpyPct >= line.qualityPct ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {summary.overallFpyPct.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">
              (ของเสีย {summary.totalDefects} ชิ้น)
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                summary.overallFpyPct >= line.qualityPct ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, summary.overallFpyPct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              Downtime:{' '}
              <strong
                className={`font-mono ${
                  summary.totalDowntimeMinutes > 15 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {summary.totalDowntimeMinutes} นาที
              </strong>
            </span>
            <span>พลาดเป้า {summary.missedHoursCount} ชม.</span>
          </div>
        </div>
      </div>

      {/* 3. SHOP-FLOOR REAL-TIME PACER & HOURLY CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white rounded-2xl border-2 border-[#0B4F9F] shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="text-xs font-bold text-[#0B4F9F]">
                แผงควบคุมและบันทึกยอดหน้างาน (Live Shop-Floor Counter)
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {activeSlot ? `กำลังบันทึก: ${activeSlot.timeRange}` : 'เลือกชั่วโมงทำงาน'}
              </h3>
            </div>

            <select
              value={activeSlot?.id || ''}
              onChange={(e) => setActiveSlotId(e.target.value)}
              className="bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none"
            >
              {summary.enrichedSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.timeRange} ({slot.actualGood ?? 0}/{slot.adjustedTargetGood} ชิ้น)
                </option>
              ))}
            </select>
          </div>

          {activeSlot && (
            <>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-xs text-slate-500">ยอดผลิตชิ้นดีชั่วโมงนี้ (Actual / Target)</div>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                        {activeSlot.actualGood ?? 0}
                      </span>
                      <span className="text-base font-mono tabular-nums text-slate-500">
                        / {activeSlot.adjustedTargetGood} ชิ้น
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-500">บรรลุเป้าหมาย</div>
                    <div
                      className={`text-2xl font-bold font-mono tabular-nums ${
                        activeSlot.achievementPct >= 100
                          ? 'text-emerald-700'
                          : activeSlot.achievementPct >= line.criticalThresholdPct
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {activeSlot.achievementPct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 ${
                      activeSlot.achievementPct >= 100
                        ? 'bg-emerald-600'
                        : activeSlot.achievementPct >= line.criticalThresholdPct
                        ? 'bg-amber-500'
                        : 'bg-red-600'
                    }`}
                    style={{ width: `${Math.min(100, activeSlot.achievementPct)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
                  <span>เวลาเดินสายพาน: {activeSlot.plannedMinutes} นาที</span>
                  <span>สปีดเทียบเท่า: {activeSlot.actualUPHRate.toFixed(1)} UPH</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleQuickIncrement('actualGood', 1)}
                  className="py-2.5 px-3 bg-[#0B4F9F] hover:bg-blue-900 active:scale-[0.98] text-white rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-0.5 transition-all"
                >
                  <span className="text-base font-mono tabular-nums font-bold">+1</span>
                  <span>ชิ้นงานดี (Good)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickIncrement('actualGood', 5)}
                  className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-950 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-0.5 transition-colors"
                >
                  <span className="text-base font-mono tabular-nums font-bold">+5</span>
                  <span>ชิ้นงานดี (Lot)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickIncrement('defectCount', 1)}
                  className="py-2.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-0.5 transition-colors"
                >
                  <span className="text-base font-mono tabular-nums font-bold">+1 NG</span>
                  <span>ของเสีย ({activeSlot.defectCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickIncrement('downtimeMinutes', 5)}
                  className="py-2.5 px-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-950 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-0.5 transition-colors"
                >
                  <span className="text-base font-mono tabular-nums font-bold">+5 นาที</span>
                  <span>เครื่องหยุด ({activeSlot.downtimeMinutes}m)</span>
                </button>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-medium text-slate-600">
                  ระบุสาเหตุปัญหาด่วน (คลิกเพื่อบันทึกในชั่วโมง {activeSlot.timeRange}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_DOWNTIME_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => handleUpdateSlot(activeSlot.id, { downtimeReason: reason })}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                        activeSlot.downtimeReason === reason
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Clock className="w-4 h-4 text-[#0B4F9F]" />
                    <span>ตัวจับเวลาต่อชิ้น (Live Takt &amp; Cycle Timer)</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsLiveRunning(!isLiveRunning)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white transition-colors ${
                        isLiveRunning
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-emerald-700 hover:bg-emerald-800'
                      }`}
                    >
                      {isLiveRunning ? (
                        <>
                          <Pause className="w-3.5 h-3.5" /> หยุดจับเวลา
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" /> เริ่มจับเวลา
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setElapsedCycleSec(0)}
                      className="p-1 text-slate-500 hover:text-slate-800 rounded border border-slate-200"
                      title="รีเซ็ตเวลาชิ้นปัจจุบัน"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span>
                    เวลาชิ้นปัจจุบัน:{' '}
                    <strong
                      className={`text-sm ${
                        elapsedCycleSec > cap.taktTimeSec
                          ? 'text-red-700'
                          : elapsedCycleSec > cap.targetCTSec
                          ? 'text-amber-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {elapsedCycleSec.toFixed(1)}s
                    </strong>
                  </span>
                  <span>
                    Target CT: <strong>{cap.targetCTSec.toFixed(1)}s</strong> · Takt:{' '}
                    <strong>{cap.taktTimeSec.toFixed(1)}s</strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSimulateMissedHour}
                  className="w-full py-2 px-3 text-xs font-semibold text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors text-center"
                >
                  จำลองเหตุการณ์เป้าหมายพลาดในชั่วโมงนี้ (ทดสอบระบบแจ้งเตือน)
                </button>
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-[#0B4F9F]">
                กราฟวิเคราะห์ผลการผลิตรายชั่วโมง (Hourly &amp; Cumulative Chart)
              </h3>
              <p className="text-xs text-slate-500">
                คลิกที่แท่งกราฟเพื่อเลือกชั่วโมงทำงาน · เส้นประสีน้ำเงินคือเป้าหมายตามเวลาเดินสายพานจริง
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setChartType('hourly')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    chartType === 'hourly'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  รายชั่วโมง
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('cumulative')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    chartType === 'cumulative'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  ยอดสะสม (S-Curve)
                </button>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedShift(1)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    selectedShift === 1
                      ? 'bg-[#0B4F9F] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  กะ 1 (Day)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedShift(2)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    selectedShift === 2
                      ? 'bg-[#0B4F9F] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  กะ 2 (Night)
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <div className="grid grid-cols-10 gap-2 items-end h-60 pt-6 pb-2 px-2 border-b border-slate-200 bg-slate-50/60 rounded-t-xl">
              {summary.enrichedSlots.map((slot) => {
                const maxHourlyScale = Math.max(cap.designUPH * 1.35, 160);
                const maxCumulativeScale = Math.max(summary.totalShiftTargetGood * 1.08, 500);

                const displayVal =
                  chartType === 'hourly' ? slot.actualGood ?? 0 : slot.cumulativeActual;
                const displayTarget =
                  chartType === 'hourly' ? slot.adjustedTargetGood : slot.cumulativeTarget;
                const maxScale =
                  chartType === 'hourly' ? maxHourlyScale : maxCumulativeScale;

                const actualHeightPct = Math.min(100, (displayVal / maxScale) * 100);
                const targetHeightPct = Math.min(100, (displayTarget / maxScale) * 100);
                const isSelected = activeSlot?.id === slot.id;

                let barColor = 'bg-slate-300';
                if (slot.actualGood !== null) {
                  if (chartType === 'cumulative') {
                    barColor =
                      slot.cumulativeVariance >= 0
                        ? 'bg-[#0B4F9F] hover:bg-blue-900'
                        : 'bg-red-600 hover:bg-red-700';
                  } else {
                    if (slot.status === 'on_target')
                      barColor = 'bg-emerald-600 hover:bg-emerald-700';
                    else if (slot.status === 'warning')
                      barColor = 'bg-amber-500 hover:bg-amber-600';
                    else if (slot.status === 'missed')
                      barColor = 'bg-red-600 hover:bg-red-700';
                  }
                }

                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setActiveSlotId(slot.id)}
                    className={`group relative h-full flex flex-col justify-end items-center rounded-lg px-1 transition-colors ${
                      isSelected ? 'bg-blue-50/90 ring-2 ring-[#0B4F9F]' : 'hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-mono tabular-nums font-bold mb-1 ${
                        slot.actualGood === null
                          ? 'text-slate-400'
                          : slot.status === 'missed'
                          ? 'text-red-700'
                          : slot.status === 'warning'
                          ? 'text-amber-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {slot.actualGood !== null ? displayVal : '-'}
                    </span>

                    {displayTarget > 0 && (
                      <div
                        className="absolute left-1 right-1 border-t-2 border-dashed border-[#0B4F9F] z-10 pointer-events-none"
                        style={{ bottom: `${targetHeightPct}%` }}
                        title={`Target: ${displayTarget} ชิ้น`}
                      />
                    )}

                    <div className="w-full max-w-[34px] bg-slate-200/70 rounded-t h-full flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t transition-all duration-200 ${barColor}`}
                        style={{
                          height: `${slot.actualGood !== null ? Math.max(4, actualHeightPct) : 0}%`,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-10 gap-2 px-2 pt-2 text-center">
              {summary.enrichedSlots.map((slot) => (
                <div key={slot.id} className="space-y-0.5">
                  <div className="text-[11px] font-mono tabular-nums font-semibold text-slate-700 truncate">
                    {slot.timeRange.split(' - ')[0]}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500">
                    เป้า {chartType === 'hourly' ? slot.adjustedTargetGood : slot.cumulativeTarget}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                ได้ตามเป้าหมาย (&ge;{line.warningThresholdPct}%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                เฝ้าระวัง ({line.criticalThresholdPct}–{line.warningThresholdPct - 1}%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-red-600 inline-block" />
                เป้าหมายพลาด (&lt;{line.criticalThresholdPct}%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-[#0B4F9F] inline-block" />
                เส้นเป้าหมาย
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. DETAILED HOURLY PRODUCTION LOG TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-base font-bold text-[#0B4F9F]">
              ตารางบันทึกและติดตามผลการผลิตรายชั่วโมง (Real-Time Hourly Log)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              กรอกจำนวนชิ้นงานดี (Actual Good), ของเสีย (NG), และเวลาหยุดเครื่อง (Downtime) ระบบจะคำนวณและบันทึกอัตโนมัติทันที
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทั้งหมด ({summary.enrichedSlots.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('missed_or_warn')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === 'missed_or_warn'
                    ? 'bg-white text-red-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ต่ำกว่าเป้า ({summary.missedHoursCount + summary.warningHoursCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('on_target')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === 'on_target'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ได้ตามเป้า
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddHourSlot}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มชั่วโมง
            </button>

            <button
              type="button"
              onClick={handleResetShiftActuals}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              รีเซ็ตข้อมูลกะนี้
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                <th className="py-2.5 px-3 whitespace-nowrap">ช่วงเวลา</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">นาทีเดินงาน</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">เป้าหมาย (ชิ้น)</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">ผลิตได้จริง (Good)</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">ส่วนต่าง</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">สะสม (จริง/เป้า)</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">% บรรลุเป้า</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">ของเสีย (NG)</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">หยุด (นาที)</th>
                <th className="py-2.5 px-3 whitespace-nowrap">สาเหตุเมื่อพลาดเป้า / การแก้ไข</th>
                <th className="py-2.5 px-3 whitespace-nowrap">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTableSlots.map((slot) => {
                const isMissed = slot.status === 'missed';
                const isWarn = slot.status === 'warning';
                const isPending = slot.status === 'pending';

                return (
                  <tr
                    key={slot.id}
                    onClick={() => setActiveSlotId(slot.id)}
                    className={`cursor-pointer transition-colors ${
                      isMissed
                        ? 'bg-red-50/60 hover:bg-red-50'
                        : isWarn
                        ? 'bg-amber-50/40 hover:bg-amber-50/80'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {slot.timeRange}
                    </td>

                    <td className="py-2.5 px-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        max="120"
                        step="5"
                        value={slot.plannedMinutes}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleUpdateSlot(slot.id, {
                            plannedMinutes: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-16 bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded px-2 py-1 text-right font-mono tabular-nums text-xs text-slate-900 outline-none"
                      />
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-medium text-slate-700">
                      {slot.adjustedTargetGood}
                    </td>

                    <td className="py-2.5 px-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        placeholder="รอผลิต"
                        value={slot.actualGood === null ? '' : slot.actualGood}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const raw = e.target.value;
                          handleUpdateSlot(slot.id, {
                            actualGood: raw === '' ? null : Math.max(0, Number(raw)),
                          });
                        }}
                        className={`w-20 border rounded px-2 py-1 text-right font-mono tabular-nums font-bold text-sm outline-none ${
                          isMissed
                            ? 'bg-white border-red-500 text-red-800'
                            : isWarn
                            ? 'bg-white border-amber-500 text-amber-900'
                            : 'bg-slate-50 border-slate-300 focus:border-[#0B4F9F] focus:bg-white text-slate-900'
                        }`}
                      />
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-bold">
                      {isPending ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span
                          className={
                            slot.varianceUnits >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }
                        >
                          {slot.varianceUnits >= 0
                            ? `+${slot.varianceUnits}`
                            : slot.varianceUnits}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                      {isPending ? (
                        <span className="text-slate-400">- / {slot.cumulativeTarget}</span>
                      ) : (
                        <span>
                          <strong className="text-slate-900">{slot.cumulativeActual}</strong> /{' '}
                          {slot.cumulativeTarget}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-bold">
                      {isPending ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span
                          className={
                            isMissed
                              ? 'text-red-700'
                              : isWarn
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }
                        >
                          {slot.achievementPct.toFixed(1)}%
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        value={slot.defectCount}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleUpdateSlot(slot.id, {
                            defectCount: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-16 bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded px-2 py-1 text-right font-mono tabular-nums text-xs text-slate-900 outline-none"
                      />
                    </td>

                    <td className="py-2.5 px-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        value={slot.downtimeMinutes}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleUpdateSlot(slot.id, {
                            downtimeMinutes: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-16 bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded px-2 py-1 text-right font-mono tabular-nums text-xs text-slate-900 outline-none"
                      />
                    </td>

                    <td className="py-2.5 px-3 min-w-[220px]">
                      <input
                        type="text"
                        placeholder="คลิกเพื่อระบุสาเหตุ..."
                        value={slot.downtimeReason}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleUpdateSlot(slot.id, { downtimeReason: e.target.value })
                        }
                        className="w-full bg-transparent border border-slate-200 focus:border-[#0B4F9F] focus:bg-white rounded px-2.5 py-1 text-xs text-slate-800 outline-none"
                      />
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-xs font-semibold">
                      {isPending && <span className="text-slate-400">รอผลิต</span>}
                      {slot.status === 'on_target' && (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> ได้ตามเป้า
                        </span>
                      )}
                      {isWarn && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Wrench className="w-3.5 h-3.5" /> ต่ำกว่าเป้า
                        </span>
                      )}
                      {isMissed && (
                        <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" /> เป้าหมายพลาด!
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
