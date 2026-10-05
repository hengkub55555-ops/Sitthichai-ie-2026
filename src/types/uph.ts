export interface ProcessStep {
  id: string;
  stationNumber: number;
  name: string;
  cycleTimeSec: number;
  operators: number;
}

export type HourlyStatus = 'on_target' | 'warning' | 'missed' | 'break' | 'pending';

export interface HourlySlot {
  id: string;
  shift: 1 | 2;
  hourIndex: number;
  timeRange: string;
  plannedMinutes: number;
  isBreakSlot?: boolean;
  targetGood: number;
  actualGood: number | null;
  defectCount: number;
  downtimeMinutes: number;
  downtimeReason: string;
  actionNote: string;
  isCurrentHour?: boolean;
}

export interface AlertItem {
  id: string;
  lineId: string;
  lineName: string;
  slotId?: string;
  timeRange: string;
  severity: 'critical' | 'warning';
  category: 'uph_miss' | 'cumulative_lag' | 'quality_drop' | 'downtime_spike' | 'bottleneck';
  title: string;
  description: string;
  shortfallUnits: number;
  recommendedAction: string;
  acknowledged: boolean;
}

export interface ProductionLine {
  id: string;
  name: string;
  productCode: string;
  // Core Target
  targetUPH: number; // Good units per hour (ชิ้นดี ต่อชั่วโมง)
  // Available Time
  shiftsPerDay: number; // จำนวนกะ/วัน
  hoursPerShift: number; // ชั่วโมง/กะ
  breakMinutesPerShift: number; // พัก/กินข้าว (นาที/กะ)
  plannedStopMinutesPerShift: number; // Planned stop อื่น (นาที/กะ)
  // OEE Factors (%)
  availabilityPct: number; // Availability (%)
  performancePct: number; // Performance (%)
  qualityPct: number; // Quality / FPY (%)
  // Line & Manpower
  pitchMeters: number; // Pitch ระหว่างชิ้นงานบน Conveyor (m)
  totalWorkContentSec: number; // Total Work Content (วินาที/ชิ้น)
  useProcessTableForWorkContent: boolean;
  targetLineBalancePct: number; // Line Balance Efficiency เป้า (%)
  manualBottleneckCTSec: number; // Bottleneck CT (วินาที) - 0 means auto/use Target CT
  // Alert Thresholds
  warningThresholdPct: number; // e.g., 95% of Target UPH
  criticalThresholdPct: number; // e.g., 85% of Target UPH
  // Stations & Hourly Logs
  processes: ProcessStep[];
  hourlySlots: HourlySlot[];
}
