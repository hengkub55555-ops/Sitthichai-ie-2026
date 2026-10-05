import React, { useState } from 'react';
import { ProductionLine } from '../types/uph';
import {
  calculateLineCapacity,
  evaluateHourlyPerformance,
} from '../utils/calculations';
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Layers,
  Activity,
  ShieldAlert,
  TrendingUp,
  Wrench,
  BookOpen,
} from 'lucide-react';

interface SummaryDashboardProps {
  lines: ProductionLine[];
  lastSavedAt: string;
  onSelectLine: (lineId: string, view: 'dashboard' | 'calculator' | 'both') => void;
}

export const SummaryDashboard: React.FC<SummaryDashboardProps> = ({
  lines,
  lastSavedAt,
  onSelectLine,
}) => {
  const [shiftFilter, setShiftFilter] = useState<1 | 2 | 'all'>('all');
  const [showGuide, setShowGuide] = useState<boolean>(false);

  const lineAnalytics = lines.map((line) => {
    const cap = calculateLineCapacity(line);
    const perfSelected = evaluateHourlyPerformance(line, shiftFilter);
    const perfShift1 = evaluateHourlyPerformance(line, 1);
    const perfShift2 = evaluateHourlyPerformance(line, 2);

    const completedPlannedMins = perfSelected.enrichedSlots.reduce(
      (sum, s) => (!s.isBreakSlot && s.actualGood !== null ? sum + s.plannedMinutes : sum),
      0
    );
    const runTimeMins = Math.max(0, completedPlannedMins - perfSelected.totalDowntimeMinutes);
    const actualAvailabilityPct =
      completedPlannedMins > 0 ? (runTimeMins / completedPlannedMins) * 100 : line.availabilityPct;

    const totalProduced = perfSelected.totalActualGood + perfSelected.totalDefects;
    const actualQualityPct =
      totalProduced > 0 ? (perfSelected.totalActualGood / totalProduced) * 100 : line.qualityPct;

    const idealCycleSec = cap.targetCTSec;
    const actualPerformancePct =
      runTimeMins > 0
        ? Math.min(115, ((totalProduced * idealCycleSec) / (runTimeMins * 60)) * 100)
        : line.performancePct;

    const actualOeePct =
      (actualAvailabilityPct / 100) *
      (actualPerformancePct / 100) *
      (actualQualityPct / 100) *
      100;

    return {
      line,
      cap,
      perf: perfSelected,
      perfShift1,
      perfShift2,
      completedPlannedMins,
      actualAvailabilityPct,
      actualPerformancePct,
      actualQualityPct,
      actualOeePct,
    };
  });

  const totalTargetUPH = lineAnalytics.reduce((s, x) => s + x.cap.targetUPH, 0);
  const totalDesignUPH = lineAnalytics.reduce((s, x) => s + x.cap.designUPH, 0);
  const totalDailyTargetGood = lineAnalytics.reduce((s, x) => s + x.cap.dailyTargetGoodOutput, 0);
  const totalCompletedTargetGood = lineAnalytics.reduce((s, x) => s + x.perf.completedTargetGood, 0);
  const totalActualGood = lineAnalytics.reduce((s, x) => s + x.perf.totalActualGood, 0);
  const totalDefects = lineAnalytics.reduce((s, x) => s + x.perf.totalDefects, 0);
  const totalDowntimeMinutes = lineAnalytics.reduce((s, x) => s + x.perf.totalDowntimeMinutes, 0);
  const totalRequiredOperators = lineAnalytics.reduce((s, x) => s + x.cap.requiredOperators, 0);
  const totalCumulativeVariance = totalActualGood - totalCompletedTargetGood;

  const factoryAchievementPct =
    totalCompletedTargetGood > 0 ? (totalActualGood / totalCompletedTargetGood) * 100 : 100;

  const factoryFpyPct =
    totalActualGood + totalDefects > 0
      ? (totalActualGood / (totalActualGood + totalDefects)) * 100
      : 100;

  const avgPlannedOeePct =
    lineAnalytics.length > 0
      ? lineAnalytics.reduce((s, x) => s + x.cap.oeePct, 0) / lineAnalytics.length
      : 0;

  const avgActualOeePct =
    lineAnalytics.length > 0
      ? lineAnalytics.reduce((s, x) => s + x.actualOeePct, 0) / lineAnalytics.length
      : 0;

  const allAlerts = lineAnalytics.flatMap((x) => x.perf.alerts);
  const criticalAlertsCount = allAlerts.filter((a) => a.severity === 'critical').length;

  const maxHourIndex = 10;
  const hourlyAggregates = Array.from({ length: maxHourIndex }, (_, i) => {
    const hourIdx = i + 1;
    let targetSum = 0;
    let actualSum = 0;
    let hasActual = false;
    let downtimeSum = 0;
    let defectSum = 0;
    let timeLabel = `ชม.ที่ ${hourIdx}`;

    lineAnalytics.forEach(({ perf }) => {
      const matchingSlots = perf.enrichedSlots.filter((s) => s.hourIndex === hourIdx);
      matchingSlots.forEach((slot) => {
        if (slot.timeRange && timeLabel.startsWith('ชม.ที่')) {
          timeLabel = slot.timeRange;
        }
        if (slot.actualGood !== null) {
          targetSum += slot.adjustedTargetGood;
          actualSum += slot.actualGood;
          downtimeSum += slot.downtimeMinutes;
          defectSum += slot.defectCount;
          hasActual = true;
        } else {
          targetSum += slot.adjustedTargetGood;
        }
      });
    });

    const pct = targetSum > 0 && hasActual ? (actualSum / targetSum) * 100 : 0;
    return {
      hourIdx,
      timeLabel,
      targetSum,
      actualSum,
      hasActual,
      downtimeSum,
      defectSum,
      pct,
      variance: hasActual ? actualSum - targetSum : 0,
    };
  });

  const downtimeReasonsList: {
    lineName: string;
    timeRange: string;
    reason: string;
    minutes: number;
    lostUnits: number;
  }[] = [];

  lineAnalytics.forEach(({ line, perf }) => {
    perf.enrichedSlots.forEach((slot) => {
      if (slot.downtimeMinutes > 0 || (slot.actualGood !== null && slot.varianceUnits < 0)) {
        downtimeReasonsList.push({
          lineName: line.name,
          timeRange: slot.timeRange,
          reason:
            slot.downtimeReason.trim() ||
            (slot.varianceUnits < 0 ? 'ความเร็วต่ำกว่า Takt Time (Speed Loss)' : 'หยุดปรับตั้งเครื่อง'),
          minutes: slot.downtimeMinutes,
          lostUnits: slot.varianceUnits < 0 ? Math.abs(slot.varianceUnits) : 0,
        });
      }
    });
  });

  downtimeReasonsList.sort((a, b) => b.lostUnits - a.lostUnits || b.minutes - a.minutes);

  return (
    <div className="space-y-6">
      {/* Header Bar of Summary Dashboard */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Executive Summary Dashboard</span>
              <span>·</span>
              <span>บันทึกอัตโนมัติล่าสุด {lastSavedAt}</span>
              <span>·</span>
              <span>รวม {lines.length} ไลน์ผลิต</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              สรุปภาพรวมประสิทธิภาพการผลิตและ UPH รายชั่วโมงทั้งโรงงาน
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {showGuide ? 'ซ่อนคำอธิบายสูตร' : 'คู่มืออ่านค่า UPH & OEE'}
            </button>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setShiftFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  shiftFilter === 'all'
                    ? 'bg-[#0B4F9F] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                รวมทุกกะ
              </button>
              <button
                type="button"
                onClick={() => setShiftFilter(1)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  shiftFilter === 1
                    ? 'bg-[#0B4F9F] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เฉพาะกะ 1 (Day)
              </button>
              <button
                type="button"
                onClick={() => setShiftFilter(2)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  shiftFilter === 2
                    ? 'bg-[#0B4F9F] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เฉพาะกะ 2 (Night)
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Easy-to-Understand Formula Guide */}
        {showGuide && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1">
              <div className="font-bold text-[#0B4F9F]">1. UPH vs Design UPH</div>
              <p className="text-slate-600 leading-relaxed">
                <strong>Target UPH</strong> คือจำนวนชิ้นดีที่ต้องการต่อชั่วโมง ส่วน{' '}
                <strong>Design UPH</strong> คือความเร็วที่ไลน์ต้องออกแบบเผื่อไว้ชดเชย OEE (เช่น เป้า 120 แต่ต้องเดินเครื่องที่ 141.5 ชิ้น/ชม.)
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1">
              <div className="font-bold text-[#0B4F9F]">2. Takt Time vs Target CT</div>
              <p className="text-slate-600 leading-relaxed">
                <strong>Takt Time</strong> = 3600 ÷ UPH (จังหวะที่ลูกค้าต้องการ) ส่วน{' '}
                <strong>Target CT</strong> = Takt × OEE คือเวลาต่อชิ้นที่สถานีคอขวดห้ามทำเกินเด็ดขาด
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1">
              <div className="font-bold text-[#0B4F9F]">3. OEE (A × P × Q)</div>
              <p className="text-slate-600 leading-relaxed">
                คิดจาก <strong>Availability</strong> (เวลาเดินจริง) × <strong>Performance</strong>{' '}
                (สปีดเดินงาน) × <strong>Quality</strong> (สัดส่วนชิ้นงานดี FPY)
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1">
              <div className="font-bold text-[#0B4F9F]">4. Recovery UPH</div>
              <p className="text-slate-600 leading-relaxed">
                เมื่อชั่วโมงก่อนหน้าหลุดเป้า ระบบจะคำนวณ <strong>Recovery UPH</strong>{' '}
                คือความเร็วใหม่ที่ต้องเร่งในชั่วโมงที่เหลือเพื่อให้ทันยอดรวมทั้งกะ
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 1. TOP EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0B4F9F] text-white rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-blue-100">
            <span>ผลผลิตชิ้นดีสะสมรวม (Actual / แผนสะสม)</span>
            <Activity className="w-4 h-4 text-blue-200" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-3xl font-bold">{totalActualGood.toLocaleString()}</span>
            <span className="text-sm text-blue-200">
              / {totalCompletedTargetGood.toLocaleString()} ชิ้น
            </span>
          </div>
          <div className="w-full h-1.5 bg-blue-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full"
              style={{ width: `${Math.min(100, factoryAchievementPct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span>บรรลุเป้าหมาย: {factoryAchievementPct.toFixed(1)}%</span>
            <span className="font-mono tabular-nums font-bold">
              {totalCumulativeVariance >= 0
                ? `+${totalCumulativeVariance} ชิ้น`
                : `${totalCumulativeVariance} ชิ้น`}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">ความสามารถการผลิต (Target / Design UPH)</span>
            <TrendingUp className="w-4 h-4 text-[#0B4F9F]" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-3xl font-bold text-slate-900">
              {totalTargetUPH.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">
              ชิ้น/ชม. (Design {totalDesignUPH.toFixed(1)})
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0B4F9F] rounded-full"
              style={{ width: `${Math.min(100, (totalTargetUPH / Math.max(1, totalDesignUPH)) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <span>เป้าหมายรวมทั้งวัน:</span>
            <strong className="font-mono tabular-nums text-slate-900">
              {totalDailyTargetGood.toLocaleString()} ชิ้น/วัน
            </strong>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">OEE เฉลี่ยจริง &amp; อัตราชิ้นงานดี (FPY)</span>
            <Layers className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-baseline gap-3 font-mono tabular-nums">
            <span className="text-3xl font-bold text-slate-900">
              {avgActualOeePct.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">
              (เป้า OEE {avgPlannedOeePct.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full"
              style={{ width: `${Math.min(100, avgActualOeePct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <span>First Pass Yield: {factoryFpyPct.toFixed(1)}%</span>
            <span className="font-mono tabular-nums text-amber-800 font-semibold">
              NG สะสม {totalDefects} ชิ้น
            </span>
          </div>
        </div>

        <div
          className={`rounded-2xl border shadow-xs p-5 space-y-2 ${
            criticalAlertsCount > 0
              ? 'bg-red-50/70 border-red-300'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium">แจ้งเตือนเป้าหมายพลาด &amp; เวลาหยุดเครื่อง</span>
            <ShieldAlert
              className={`w-4 h-4 ${
                criticalAlertsCount > 0 ? 'text-red-600' : 'text-slate-400'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span
              className={`text-3xl font-bold ${
                criticalAlertsCount > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {allAlerts.length}
            </span>
            <span className="text-xs text-slate-600">
              รายการ ({criticalAlertsCount} วิกฤต)
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                criticalAlertsCount > 0 ? 'bg-red-600' : 'bg-emerald-600'
              }`}
              style={{ width: criticalAlertsCount > 0 ? '100%' : '20%' }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <span>Downtime สะสม: {totalDowntimeMinutes} นาที</span>
            <span>พนักงานรวม: {totalRequiredOperators} คน</span>
          </div>
        </div>
      </div>

      {/* 2. LINE-BY-LINE REAL-TIME STATUS CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {lineAnalytics.map(
          ({
            line,
            cap,
            perf,
            perfShift1,
            perfShift2,
            actualAvailabilityPct,
            actualPerformancePct,
            actualQualityPct,
            actualOeePct,
          }) => {
            const hasCritical = perf.alerts.some((a) => a.severity === 'critical');
            const isBehind = perf.cumulativeVariance < 0;

            return (
              <div
                key={line.id}
                className={`bg-white rounded-2xl border shadow-xs p-5 space-y-4 ${
                  hasCritical ? 'border-red-400' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">{line.name}</h3>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs font-mono text-slate-600">{line.productCode}</span>
                      <span className="text-xs text-slate-400">·</span>
                      {hasCritical ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          หลุดเป้าหมาย ({perf.missedHoursCount} ชม.)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          เดินเครื่องตามแผน
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                      Target UPH: {cap.targetUPH} ชิ้น/ชม. · Takt Time: {cap.taktTimeSec.toFixed(1)}s ·
                      Target CT: {cap.targetCTSec.toFixed(1)}s · Speed: {cap.lineSpeedMPerMin.toFixed(2)} m/min
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectLine(line.id, 'dashboard')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B4F9F] hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap"
                    >
                      เจาะลึกรายชั่วโมง <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar: Cumulative Actual vs Completed Target */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">
                      ความคืบหน้ายอดผลิตสะสมเทียบแผนปัจจุบัน
                    </span>
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      {perf.totalActualGood.toLocaleString()} / {perf.completedTargetGood.toLocaleString()} ชิ้น (
                      {perf.overallAchievementPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        perf.overallAchievementPct >= 100
                          ? 'bg-emerald-600'
                          : perf.overallAchievementPct >= line.criticalThresholdPct
                          ? 'bg-amber-500'
                          : 'bg-red-600'
                      }`}
                      style={{ width: `${Math.min(100, perf.overallAchievementPct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      กะ 1: {perfShift1.totalActualGood}/{perfShift1.completedTargetGood} ชิ้น
                    </span>
                    <span>
                      กะ 2: {perfShift2.totalActualGood}/{perfShift2.completedTargetGood} ชิ้น
                    </span>
                    <span
                      className={
                        isBehind ? 'text-red-700 font-bold' : 'text-emerald-700 font-semibold'
                      }
                    >
                      {isBehind
                        ? `ขาดอีก ${Math.abs(perf.cumulativeVariance)} ชิ้น (ต้องเร่ง ${perf.requiredRecoveryUPH.toFixed(1)} UPH)`
                        : `เกินแผน +${perf.cumulativeVariance} ชิ้น`}
                    </span>
                  </div>
                </div>

                {/* 4 Sub-metrics Grid inside Line Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">UPH เฉลี่ยจริง</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {perf.averageActualUPH.toFixed(1)}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      เป้า {cap.targetUPH} / ออกแบบ {cap.designUPH.toFixed(1)}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">OEE จริง (A×P×Q)</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {actualOeePct.toFixed(1)}%
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      A:{actualAvailabilityPct.toFixed(0)}% P:{actualPerformancePct.toFixed(0)}% Q:
                      {actualQualityPct.toFixed(0)}%
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">Manpower &amp; Balance</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {cap.requiredOperators} คน
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      Eff: {cap.achievedBalanceEfficiencyPct.toFixed(1)}%
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">ของเสีย &amp; Downtime</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {perf.totalDefects} ชิ้น
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      หยุด {perf.totalDowntimeMinutes} นาที
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        )}
      </div>

      {/* 3. FACTORY HOURLY OUTPUT TREND & PARETO DOWNTIME ANALYSIS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-[#0B4F9F]">
              กราฟสรุปผลผลิตรายชั่วโมงรวมทุกไลน์ (Factory Hourly Output vs Target)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              เปรียบเทียบยอดผลิตรวมทุกไลน์ในแต่ละชั่วโมงเทียบกับเป้าหมายรวม (เส้นประสีน้ำเงิน)
            </p>
          </div>

          <div className="grid grid-cols-10 gap-2 items-end h-56 pt-6 pb-2 px-2 border-b border-slate-200 bg-slate-50/60 rounded-t-xl">
            {hourlyAggregates.map((bucket) => {
              const maxScale =
                Math.max(
                  ...hourlyAggregates.map((b) => Math.max(b.targetSum, b.actualSum)),
                  100
                ) * 1.2;
              const actualHeightPct = Math.min(100, (bucket.actualSum / maxScale) * 100);
              const targetHeightPct = Math.min(100, (bucket.targetSum / maxScale) * 100);

              let barColor = 'bg-slate-300';
              if (bucket.hasActual) {
                if (bucket.pct >= 98) barColor = 'bg-emerald-600';
                else if (bucket.pct >= 88) barColor = 'bg-amber-500';
                else barColor = 'bg-red-600';
              }

              return (
                <div
                  key={bucket.hourIdx}
                  className="relative h-full flex flex-col justify-end items-center px-1"
                >
                  <span className="text-[11px] font-mono tabular-nums font-bold text-slate-800 mb-1">
                    {bucket.hasActual ? bucket.actualSum : '-'}
                  </span>

                  {bucket.targetSum > 0 && (
                    <div
                      className="absolute left-1 right-1 border-t-2 border-dashed border-[#0B4F9F] z-10 pointer-events-none"
                      style={{ bottom: `${targetHeightPct}%` }}
                      title={`เป้าหมายรวม: ${bucket.targetSum} ชิ้น`}
                    />
                  )}

                  <div className="w-full max-w-[34px] bg-slate-200/70 rounded-t h-full flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-t transition-all duration-200 ${barColor}`}
                      style={{
                        height: `${bucket.hasActual ? Math.max(4, actualHeightPct) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-10 gap-2 px-2 text-center">
            {hourlyAggregates.map((bucket) => (
              <div key={bucket.hourIdx} className="space-y-0.5">
                <div className="text-[11px] font-mono tabular-nums font-semibold text-slate-700 truncate">
                  {bucket.timeLabel.split(' - ')[0]}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-500">
                  เป้า {bucket.targetSum}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#0B4F9F]">
                วิเคราะห์สาเหตุที่ทำเป้าหมายพลาด (Loss &amp; Downtime Pareto)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                เรียงลำดับตามจำนวนชิ้นงานที่สูญเสียและเวลาเครื่องจักรหยุดชะงัก
              </p>
            </div>
            <Wrench className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {downtimeReasonsList.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              ไม่มีชั่วโมงที่ต่ำกว่าเป้าหมายหรือเครื่องจักรหยุดในกะที่เลือก
            </div>
          ) : (
            <div className="space-y-3">
              {downtimeReasonsList.slice(0, 6).map((item, idx) => (
                <div
                  key={`${item.lineName}-${item.timeRange}-${idx}`}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <div className="font-semibold text-slate-900">
                      <span>
                        {idx + 1}. {item.reason}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-red-700 shrink-0">
                      {item.lostUnits > 0 ? `-${item.lostUnits} ชิ้น` : `${item.minutes} นาที`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {item.lineName} · ช่วงเวลา {item.timeRange}
                    </span>
                    <span className="font-mono tabular-nums">
                      เวลาเครื่องหยุด: {item.minutes} นาที
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. COMPREHENSIVE SUMMARY MATRIX TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#0B4F9F]">
              ตารางสรุปพารามิเตอร์วิศวกรรมการผลิตและผลลัพธ์จริง (Master Production &amp; UPH Matrix)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              สรุปค่าที่ได้จากการคำนวณ UPH Capacity คู่กับผลผลิตจริงแบบ Real-Time ของทุกไลน์ผลิต
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                <th className="py-3 px-3">ไลน์ผลิต</th>
                <th className="py-3 px-2.5 text-right">Target UPH</th>
                <th className="py-3 px-2.5 text-right">Takt Time</th>
                <th className="py-3 px-2.5 text-right">Target CT</th>
                <th className="py-3 px-2.5 text-right">Line Speed</th>
                <th className="py-3 px-2.5 text-right">Design UPH</th>
                <th className="py-3 px-2.5 text-right">พนักงาน</th>
                <th className="py-3 px-2.5 text-right">UPH เฉลี่ยจริง</th>
                <th className="py-3 px-2.5 text-right">ผลิตจริง / เป้าสะสม</th>
                <th className="py-3 px-2.5 text-right">% บรรลุเป้า</th>
                <th className="py-3 px-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lineAnalytics.map(({ line, cap, perf }) => (
                <tr key={line.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">{line.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{line.productCode}</div>
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                    {cap.targetUPH.toFixed(0)}
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                    {cap.taktTimeSec.toFixed(1)}s
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                    {cap.targetCTSec.toFixed(2)}s
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                    {cap.lineSpeedMPerMin.toFixed(2)} m/min
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0B4F9F]">
                    {cap.designUPH.toFixed(1)}
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-900">
                    {cap.requiredOperators} คน
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                    {perf.averageActualUPH.toFixed(1)}
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                    <strong className="text-slate-900">
                      {perf.totalActualGood.toLocaleString()}
                    </strong>{' '}
                    / {perf.completedTargetGood.toLocaleString()}
                  </td>
                  <td className="py-3 px-2.5 text-right font-mono tabular-nums font-bold">
                    <span
                      className={
                        perf.overallAchievementPct >= 100
                          ? 'text-emerald-700'
                          : perf.overallAchievementPct >= line.criticalThresholdPct
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }
                    >
                      {perf.overallAchievementPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectLine(line.id, 'dashboard')}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0B4F9F] hover:bg-blue-900 rounded-md transition-colors"
                    >
                      Dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectLine(line.id, 'calculator')}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    >
                      ตั้งค่า UPH
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
