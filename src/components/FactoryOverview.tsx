import React from 'react';
import { ProductionLine } from '../types/uph';
import {
  calculateLineCapacity,
  evaluateHourlyPerformance,
} from '../utils/calculations';
import { AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

interface FactoryOverviewProps {
  lines: ProductionLine[];
  onSelectLine: (lineId: string, mode: 'dashboard' | 'calculator') => void;
}

export const FactoryOverview: React.FC<FactoryOverviewProps> = ({
  lines,
  onSelectLine,
}) => {
  const lineSummaries = lines.map((line) => ({
    line,
    cap: calculateLineCapacity(line),
    hourly: evaluateHourlyPerformance(line, 1),
  }));

  const totalTargetUPH = lineSummaries.reduce((acc, item) => acc + item.cap.targetUPH, 0);
  const totalDailyTargetOutput = lineSummaries.reduce(
    (acc, item) => acc + item.cap.dailyTargetGoodOutput,
    0
  );
  const totalDailyGrossOutput = lineSummaries.reduce(
    (acc, item) => acc + item.cap.dailyGrossOutput,
    0
  );
  const totalRequiredOperators = lineSummaries.reduce(
    (acc, item) => acc + item.cap.requiredOperators,
    0
  );
  const avgFactoryOEE =
    lineSummaries.length > 0
      ? lineSummaries.reduce((acc, item) => acc + item.cap.oeePct, 0) / lineSummaries.length
      : 0;

  const totalActualShift1 = lineSummaries.reduce(
    (acc, item) => acc + item.hourly.totalActualGood,
    0
  );
  const totalCompletedTargetShift1 = lineSummaries.reduce(
    (acc, item) => acc + item.hourly.completedTargetGood,
    0
  );
  const allAlerts = lineSummaries.flatMap((item) => item.hourly.alerts);

  return (
    <div className="space-y-6">
      {/* Factory Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0B4F9F] text-white rounded-xl p-5">
          <div className="text-xs text-blue-100 font-medium">
            รวม Target UPH ทั้งโรงงาน ({lines.length} ไลน์ผลิต)
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums my-1.5">
            {totalTargetUPH.toLocaleString()}
          </div>
          <div className="text-xs text-blue-200">
            ชิ้นดี/ชั่วโมง · เฉลี่ย OEE {avgFactoryOEE.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500 font-medium">
            Output เป้าหมายรวมต่อวัน (Good / Gross)
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 my-1.5">
            {totalDailyTargetOutput.toLocaleString()} ชิ้น/วัน
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            รวมเผื่อของเสีย (Gross): {totalDailyGrossOutput.toLocaleString()} ชิ้น/วัน
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500 font-medium">
            ยอดผลิตจริงสะสมวันนี้ (Actual vs แผนสะสม)
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 my-1.5">
            {totalActualShift1.toLocaleString()} / {totalCompletedTargetShift1.toLocaleString()}
          </div>
          <div className="text-xs font-mono tabular-nums">
            <span
              className={
                totalActualShift1 - totalCompletedTargetShift1 >= 0
                  ? 'text-emerald-700 font-semibold'
                  : 'text-red-700 font-semibold'
              }
            >
              ส่วนต่างสะสม:{' '}
              {totalActualShift1 - totalCompletedTargetShift1 >= 0
                ? `+${totalActualShift1 - totalCompletedTargetShift1}`
                : totalActualShift1 - totalCompletedTargetShift1}{' '}
              ชิ้น
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500 font-medium">
            กำลังคนรวมทั้งโรงงาน &amp; การแจ้งเตือน
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 my-1.5">
            {totalRequiredOperators.toLocaleString()} คน/กะ
          </div>
          <div className="text-xs">
            {allAlerts.length > 0 ? (
              <span className="text-red-700 font-semibold">
                มีแจ้งเตือนเป้าหมายพลาด {allAlerts.length} รายการ
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold">ทุกไลน์ผลิตได้ตามเป้าหมาย</span>
            )}
          </div>
        </div>
      </div>

      {/* Line-by-Line Comparison Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-blue-900">
            ตารางเปรียบเทียบประสิทธิภาพและ Capacity แยกตามไลน์ผลิต
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            คลิกที่แต่ละไลน์เพื่อเปิดดู Dashboard รายชั่วโมง หรือแก้ไขค่าพารามิเตอร์ UPH / Takt Time / Line Balance
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                <th className="py-3 px-3">ไลน์ผลิต</th>
                <th className="py-3 px-3 text-right">Target UPH</th>
                <th className="py-3 px-3 text-right">Takt Time</th>
                <th className="py-3 px-3 text-right">Target CT</th>
                <th className="py-3 px-3 text-right">Design UPH</th>
                <th className="py-3 px-3 text-right">OEE</th>
                <th className="py-3 px-3 text-right">Output/วัน</th>
                <th className="py-3 px-3 text-right">พนักงาน (คน)</th>
                <th className="py-3 px-3 text-right">ผลิตจริงสะสมวันนี้</th>
                <th className="py-3 px-3">สถานะ Real-time</th>
                <th className="py-3 px-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lineSummaries.map(({ line, cap, hourly }) => {
                const hasCritical = hourly.alerts.some((a) => a.severity === 'critical');
                const hasWarning = hourly.alerts.length > 0;

                return (
                  <tr key={line.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{line.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{line.productCode}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {cap.targetUPH.toFixed(0)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {cap.taktTimeSec.toFixed(1)} s
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {cap.targetCTSec.toFixed(1)} s
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-blue-900">
                      {cap.designUPH.toFixed(1)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {cap.oeePct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                      {cap.dailyTargetGoodOutput.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                      {cap.requiredOperators}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span className="font-bold text-slate-900">
                        {hourly.totalActualGood.toLocaleString()}
                      </span>{' '}
                      <span className="text-slate-500">
                        / {hourly.completedTargetGood.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold">
                      {hasCritical ? (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          พลาดเป้า ({hourly.missedHoursCount} ชม.)
                        </span>
                      ) : hasWarning ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          เฝ้าระวัง
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          ได้ตามเป้า ({hourly.overallAchievementPct.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => onSelectLine(line.id, 'dashboard')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-950 rounded-md transition-colors"
                      >
                        Dashboard <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectLine(line.id, 'calculator')}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                      >
                        คำนวณ UPH
                      </button>
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
