import { ProductionLine, HourlySlot, AlertItem, HourlyStatus } from '../types/uph';

export interface CalculatedCapacity {
  // Core linked metrics
  targetUPH: number;
  taktTimeSec: number; // 3600 / targetUPH
  oeeDecimal: number; // (A * P * Q) / 1000000
  oeePct: number; // oeeDecimal * 100
  targetCTSec: number; // taktTimeSec * oeeDecimal
  lineSpeedMPerMin: number; // (pitchMeters * 60) / targetCTSec

  // Time & Daily Output
  netAvailableMinutesPerShift: number;
  netAvailableMinutesPerDay: number;
  netAvailableHoursPerDay: number;
  dailyTargetGoodOutput: number; // targetUPH * netAvailableHoursPerDay
  grossUPH: number; // targetUPH / (qualityPct / 100)
  designUPH: number; // 3600 / targetCTSec  (UPH ที่ Line ต้องออกแบบ)
  dailyGrossOutput: number; // dailyTargetGoodOutput / (qualityPct / 100)
  throughputPerMin: number; // 60 / targetCTSec

  // Manpower & Line Balance
  effectiveWorkContentSec: number;
  effectiveBottleneckCTSec: number;
  theoreticalMinOperators: number; // effectiveWorkContentSec / effectiveCT
  requiredOperators: number; // ceil(theoreticalMinOperators / (targetLineBalancePct / 100))
  achievedBalanceEfficiencyPct: number; // (theoreticalMinOperators / requiredOperators) * 100
  balanceDelayPct: number; // 100 - achievedBalanceEfficiencyPct
  estimatedLineLengthMeters: number; // requiredOperators * pitchMeters
}

export function calculateLineCapacity(line: ProductionLine): CalculatedCapacity {
  const safeUPH = Math.max(0.1, line.targetUPH || 0.1);
  const avail = Math.min(100, Math.max(1, line.availabilityPct || 1)) / 100;
  const perf = Math.min(100, Math.max(1, line.performancePct || 1)) / 100;
  const qual = Math.min(100, Math.max(1, line.qualityPct || 1)) / 100;
  const oeeDecimal = avail * perf * qual;
  const oeePct = oeeDecimal * 100;

  // TT = 3600 / UPH
  const taktTimeSec = 3600 / safeUPH;
  // Target CT = TT * A * P * Q
  const targetCTSec = taktTimeSec * oeeDecimal;
  // Line Speed (m/min) = Pitch * 60 / CT
  const safePitch = Math.max(0.01, line.pitchMeters || 1);
  const lineSpeedMPerMin = targetCTSec > 0 ? (safePitch * 60) / targetCTSec : 0;

  // Available time
  const grossMinutesPerShift = Math.max(0, line.hoursPerShift * 60);
  const deductionsPerShift = Math.max(0, line.breakMinutesPerShift) + Math.max(0, line.plannedStopMinutesPerShift);
  const netAvailableMinutesPerShift = Math.max(0, grossMinutesPerShift - deductionsPerShift);
  const netAvailableMinutesPerDay = netAvailableMinutesPerShift * Math.max(1, line.shiftsPerDay);
  const netAvailableHoursPerDay = netAvailableMinutesPerDay / 60;

  // Outputs
  const dailyTargetGoodOutput = Math.round(safeUPH * netAvailableHoursPerDay);
  const grossUPH = safeUPH / qual;
  const designUPH = targetCTSec > 0 ? 3600 / targetCTSec : 0;
  const dailyGrossOutput = Math.round(dailyTargetGoodOutput / qual);
  const throughputPerMin = targetCTSec > 0 ? 60 / targetCTSec : 0;

  // Work Content & Bottleneck
  const processSumWorkContent = line.processes.reduce((sum, p) => sum + Math.max(0, p.cycleTimeSec), 0);
  const processMaxBottleneck = line.processes.reduce(
    (max, p) => Math.max(max, p.operators > 0 ? p.cycleTimeSec / p.operators : p.cycleTimeSec),
    0
  );

  const effectiveWorkContentSec =
    line.useProcessTableForWorkContent && line.processes.length > 0
      ? processSumWorkContent
      : Math.max(0, line.totalWorkContentSec);

  const effectiveBottleneckCTSec =
    line.manualBottleneckCTSec > 0
      ? line.manualBottleneckCTSec
      : line.useProcessTableForWorkContent && processMaxBottleneck > 0
      ? processMaxBottleneck
      : 0;

  const divisorCT = effectiveBottleneckCTSec > 0 ? effectiveBottleneckCTSec : targetCTSec;
  const theoreticalMinOperators = divisorCT > 0 ? effectiveWorkContentSec / divisorCT : 0;

  const targetBalanceDec = Math.min(100, Math.max(1, line.targetLineBalancePct || 85)) / 100;
  const requiredOperators =
    theoreticalMinOperators > 0 ? Math.ceil(theoreticalMinOperators / targetBalanceDec) : 0;

  const achievedBalanceEfficiencyPct =
    requiredOperators > 0 ? (theoreticalMinOperators / requiredOperators) * 100 : 0;
  const balanceDelayPct = requiredOperators > 0 ? Math.max(0, 100 - achievedBalanceEfficiencyPct) : 0;
  const estimatedLineLengthMeters = requiredOperators * safePitch;

  return {
    targetUPH: safeUPH,
    taktTimeSec,
    oeeDecimal,
    oeePct,
    targetCTSec,
    lineSpeedMPerMin,
    netAvailableMinutesPerShift,
    netAvailableMinutesPerDay,
    netAvailableHoursPerDay,
    dailyTargetGoodOutput,
    grossUPH,
    designUPH,
    dailyGrossOutput,
    throughputPerMin,
    effectiveWorkContentSec,
    effectiveBottleneckCTSec,
    theoreticalMinOperators,
    requiredOperators,
    achievedBalanceEfficiencyPct,
    balanceDelayPct,
    estimatedLineLengthMeters,
  };
}

export interface EnrichedHourlySlot extends HourlySlot {
  adjustedTargetGood: number;
  actualUPHRate: number; // Normalized to 60 mins
  achievementPct: number;
  varianceUnits: number;
  cumulativeTarget: number;
  cumulativeActual: number;
  cumulativeVariance: number;
  hourlyFpyPct: number;
  status: HourlyStatus;
}

export interface HourlySummaryMetrics {
  enrichedSlots: EnrichedHourlySlot[];
  completedHoursCount: number;
  remainingPlannedHours: number;
  totalShiftTargetGood: number;
  completedTargetGood: number;
  totalActualGood: number;
  totalDefects: number;
  totalDowntimeMinutes: number;
  cumulativeVariance: number;
  overallAchievementPct: number;
  averageActualUPH: number;
  overallFpyPct: number;
  requiredRecoveryUPH: number; // UPH needed in remaining hours to hit totalShiftTargetGood
  missedHoursCount: number;
  warningHoursCount: number;
  alerts: AlertItem[];
}

export function evaluateHourlyPerformance(
  line: ProductionLine,
  selectedShift: 1 | 2 | 'all' = 1
): HourlySummaryMetrics {
  const cap = calculateLineCapacity(line);
  const filteredSlots =
    selectedShift === 'all'
      ? line.hourlySlots
      : line.hourlySlots.filter((s) => s.shift === selectedShift);

  let runningTarget = 0;
  let runningActual = 0;
  let completedHoursCount = 0;
  let remainingPlannedMinutes = 0;
  let totalShiftTargetGood = 0;
  let totalDefects = 0;
  let totalDowntimeMinutes = 0;
  let missedHoursCount = 0;
  let warningHoursCount = 0;

  const alerts: AlertItem[] = [];

  const enrichedSlots: EnrichedHourlySlot[] = filteredSlots.map((slot) => {
    const adjustedTargetGood =
      slot.isBreakSlot || slot.plannedMinutes <= 0
        ? 0
        : Math.round((cap.targetUPH * slot.plannedMinutes) / 60);

    totalShiftTargetGood += adjustedTargetGood;

    if (slot.isBreakSlot || slot.plannedMinutes <= 0) {
      return {
        ...slot,
        adjustedTargetGood: 0,
        actualUPHRate: 0,
        achievementPct: 100,
        varianceUnits: 0,
        cumulativeTarget: runningTarget,
        cumulativeActual: runningActual,
        cumulativeVariance: runningActual - runningTarget,
        hourlyFpyPct: 100,
        status: 'break',
      };
    }

    if (slot.actualGood === null) {
      remainingPlannedMinutes += slot.plannedMinutes;
      return {
        ...slot,
        adjustedTargetGood,
        actualUPHRate: 0,
        achievementPct: 0,
        varianceUnits: 0,
        cumulativeTarget: runningTarget + adjustedTargetGood,
        cumulativeActual: runningActual,
        cumulativeVariance: runningActual - runningTarget,
        hourlyFpyPct: 100,
        status: 'pending',
      };
    }

    // Completed or active hour
    completedHoursCount += 1;
    runningTarget += adjustedTargetGood;
    runningActual += slot.actualGood;
    totalDefects += slot.defectCount;
    totalDowntimeMinutes += slot.downtimeMinutes;

    const actualUPHRate = slot.plannedMinutes > 0 ? (slot.actualGood * 60) / slot.plannedMinutes : 0;
    const achievementPct = adjustedTargetGood > 0 ? (slot.actualGood / adjustedTargetGood) * 100 : 100;
    const varianceUnits = slot.actualGood - adjustedTargetGood;
    const cumulativeVariance = runningActual - runningTarget;
    const totalProduced = slot.actualGood + slot.defectCount;
    const hourlyFpyPct = totalProduced > 0 ? (slot.actualGood / totalProduced) * 100 : 100;

    let status: HourlyStatus = 'on_target';
    if (achievementPct < line.criticalThresholdPct) {
      status = 'missed';
      missedHoursCount += 1;
      alerts.push({
        id: `alert-uph-${line.id}-${slot.id}`,
        lineId: line.id,
        lineName: line.name,
        slotId: slot.id,
        timeRange: slot.timeRange,
        severity: 'critical',
        category: 'uph_miss',
        title: `${line.name} หลุดเป้าหมาย UPH ช่วง ${slot.timeRange}`,
        description: `ผลิตได้ ${slot.actualGood} ชิ้น จากเป้า ${adjustedTargetGood} ชิ้น (${achievementPct.toFixed(1)}%)${
          slot.downtimeReason ? ` · สาเหตุ: ${slot.downtimeReason}` : ''
        }`,
        shortfallUnits: Math.abs(varianceUnits),
        recommendedAction:
          slot.downtimeMinutes > 0
            ? `ตรวจสอบจุดหยุดชะงัก (${slot.downtimeMinutes} นาที) และเกลี่ยงานสถานีคอขวดเพื่อชดเชย ${Math.abs(varianceUnits)} ชิ้น`
            : `ตรวจสอบ Cycle Time สถานีคอขวด (เป้า ${cap.targetCTSec.toFixed(1)}s/ชิ้น) เพื่อดึงสปีดกลับ`,
        acknowledged: false,
      });
    } else if (achievementPct < line.warningThresholdPct || varianceUnits < 0) {
      status = 'warning';
      warningHoursCount += 1;
      alerts.push({
        id: `alert-warn-${line.id}-${slot.id}`,
        lineId: line.id,
        lineName: line.name,
        slotId: slot.id,
        timeRange: slot.timeRange,
        severity: 'warning',
        category: 'uph_miss',
        title: `${line.name} ต่ำกว่าเป้าเล็กน้อย ช่วง ${slot.timeRange}`,
        description: `ผลิตได้ ${slot.actualGood}/${adjustedTargetGood} ชิ้น (${achievementPct.toFixed(1)}%) ขาด ${Math.abs(
          varianceUnits
        )} ชิ้น`,
        shortfallUnits: Math.abs(varianceUnits),
        recommendedAction: `เร่งจังหวะป้อนงานเพิ่ม +${Math.abs(varianceUnits)} ชิ้นในชั่วโมงถัดไป`,
        acknowledged: false,
      });
    }

    // Quality alert if FPY < Quality target - 2%
    if (hourlyFpyPct < line.qualityPct - 2 && slot.defectCount >= 3) {
      alerts.push({
        id: `alert-qual-${line.id}-${slot.id}`,
        lineId: line.id,
        lineName: line.name,
        slotId: slot.id,
        timeRange: slot.timeRange,
        severity: hourlyFpyPct < line.qualityPct - 5 ? 'critical' : 'warning',
        category: 'quality_drop',
        title: `อัตราของเสีย (NG) สูงเกินเกณฑ์ ช่วง ${slot.timeRange}`,
        description: `พบงานเสีย ${slot.defectCount} ชิ้น (FPY ${hourlyFpyPct.toFixed(1)}% ต่ำกว่าเกณฑ์ ${line.qualityPct}%)`,
        shortfallUnits: slot.defectCount,
        recommendedAction: `ให้ QC ตรวจสอบ Jig/Fixture และวัตถุดิบล็อตปัจจุบันทันที`,
        acknowledged: false,
      });
    }

    return {
      ...slot,
      adjustedTargetGood,
      actualUPHRate,
      achievementPct,
      varianceUnits,
      cumulativeTarget: runningTarget,
      cumulativeActual: runningActual,
      cumulativeVariance,
      hourlyFpyPct,
      status,
    };
  });

  // Check bottleneck station alert
  if (cap.effectiveBottleneckCTSec > cap.targetCTSec + 0.2) {
    alerts.unshift({
      id: `alert-bottleneck-${line.id}`,
      lineId: line.id,
      lineName: line.name,
      timeRange: 'ทั้งกะ',
      severity: 'critical',
      category: 'bottleneck',
      title: `Bottleneck CT (${cap.effectiveBottleneckCTSec.toFixed(1)}s) เกินกว่า Target CT (${cap.targetCTSec.toFixed(1)}s)`,
      description: `สถานีคอขวดใช้เวลาเกินพิกัด ทำให้ UPH สูงสุดทำได้เพียง ${(3600 / cap.effectiveBottleneckCTSec).toFixed(1)} ชิ้น/ชม.`,
      shortfallUnits: Math.max(0, Math.round(cap.targetUPH - 3600 / cap.effectiveBottleneckCTSec)),
      recommendedAction: `เพิ่มคนหรือแบ่งงานออกจากสถานีคอขวดให้ CT ต่ำกว่า ${cap.targetCTSec.toFixed(1)} วินาที`,
      acknowledged: false,
    });
  }

  const remainingPlannedHours = remainingPlannedMinutes / 60;
  const remainingUnitsNeeded = Math.max(0, totalShiftTargetGood - runningActual);
  const requiredRecoveryUPH =
    remainingPlannedHours > 0 ? remainingUnitsNeeded / remainingPlannedHours : 0;

  const overallAchievementPct =
    runningTarget > 0 ? (runningActual / runningTarget) * 100 : 100;

  const completedPlannedMinutes = filteredSlots.reduce(
    (sum, s) => (!s.isBreakSlot && s.actualGood !== null ? sum + s.plannedMinutes : sum),
    0
  );
  const averageActualUPH =
    completedPlannedMinutes > 0 ? (runningActual * 60) / completedPlannedMinutes : 0;

  const totalProducedAll = runningActual + totalDefects;
  const overallFpyPct = totalProducedAll > 0 ? (runningActual / totalProducedAll) * 100 : 100;

  return {
    enrichedSlots,
    completedHoursCount,
    remainingPlannedHours,
    totalShiftTargetGood,
    completedTargetGood: runningTarget,
    totalActualGood: runningActual,
    totalDefects,
    totalDowntimeMinutes,
    cumulativeVariance: runningActual - runningTarget,
    overallAchievementPct,
    averageActualUPH,
    overallFpyPct,
    requiredRecoveryUPH,
    missedHoursCount,
    warningHoursCount,
    alerts,
  };
}
