import React, { useState, useEffect } from 'react';
import { ProductionLine, ProcessStep } from '../types/uph';
import { calculateLineCapacity } from '../utils/calculations';
import {
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeftRight,
  Clock,
  Gauge,
  Users,
  Sparkles,
  Info,
} from 'lucide-react';

interface CapacityCalculatorProps {
  line: ProductionLine;
  onUpdateLine: (updated: ProductionLine) => void;
}

export const CapacityCalculator: React.FC<CapacityCalculatorProps> = ({
  line,
  onUpdateLine,
}) => {
  const cap = calculateLineCapacity(line);

  // Local string state for the 4 linked fields so typing decimals is smooth
  const [editingField, setEditingField] = useState<'uph' | 'tt' | 'ct' | 'speed' | null>(null);
  const [localVal, setLocalVal] = useState<string>('');

  useEffect(() => {
    setEditingField(null);
  }, [line.id]);

  const updateField = <K extends keyof ProductionLine>(key: K, value: ProductionLine[K]) => {
    onUpdateLine({
      ...line,
      [key]: value,
    });
  };

  // Linked handlers: UPH <-> TT <-> CT <-> Line Speed
  const handleLinkedChange = (field: 'uph' | 'tt' | 'ct' | 'speed', raw: string) => {
    setEditingField(field);
    setLocalVal(raw);
    const num = parseFloat(raw);
    if (isNaN(num) || num <= 0) return;

    const oeeDec = cap.oeeDecimal > 0 ? cap.oeeDecimal : 0.85;
    const safePitch = Math.max(0.01, line.pitchMeters || 1);

    let newUPH = line.targetUPH;
    if (field === 'uph') {
      newUPH = num;
    } else if (field === 'tt') {
      newUPH = 3600 / num;
    } else if (field === 'ct') {
      const impliedTT = num / oeeDec;
      newUPH = 3600 / impliedTT;
    } else if (field === 'speed') {
      const impliedCT = (safePitch * 60) / num;
      const impliedTT = impliedCT / oeeDec;
      newUPH = 3600 / impliedTT;
    }

    onUpdateLine({
      ...line,
      targetUPH: Math.round(newUPH * 100) / 100,
    });
  };

  const handleAddProcess = () => {
    const nextNum = line.processes.length + 1;
    const newStep: ProcessStep = {
      id: `proc-${Date.now()}`,
      stationNumber: nextNum,
      name: `Station #${nextNum}`,
      cycleTimeSec: Number(cap.targetCTSec.toFixed(1)),
      operators: 1,
    };
    onUpdateLine({
      ...line,
      processes: [...line.processes, newStep],
    });
  };

  const handleUpdateProcess = (id: string, key: keyof ProcessStep, val: string | number) => {
    const updated = line.processes.map((p) => (p.id === id ? { ...p, [key]: val } : p));
    onUpdateLine({
      ...line,
      processes: updated,
    });
  };

  const handleRemoveProcess = (id: string) => {
    const filtered = line.processes
      .filter((p) => p.id !== id)
      .map((p, idx) => ({ ...p, stationNumber: idx + 1 }));
    onUpdateLine({
      ...line,
      processes: filtered,
    });
  };

  return (
    <div className="space-y-6">
      {/* VISUAL FLOW BANNER: แผนภาพสรุปความเชื่อมโยงของสูตรให้เข้าใจง่ายใน 5 วินาที */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-5 rounded-full bg-[#0B4F9F]" />
            <h2 className="text-sm font-bold text-slate-900">
              แผนภาพสรุปความสัมพันธ์ของการคำนวณ ({line.name} · {line.productCode})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            แก้ไขตัวเลขช่องใดก็ได้ ระบบจะคำนวณเชื่อมโยงทั้งสายการผลิตให้อัตโนมัติ
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
          {/* Step 1 */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-blue-900">
              01. เป้าหมายลูกค้า (Target UPH)
            </div>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#0B4F9F]">
                {cap.targetUPH.toFixed(0)}
              </span>
              <span className="text-xs text-slate-600">ชิ้นดี/ชม.</span>
            </div>
            <div className="text-[11px] text-slate-600">
              ผลิตวันละ <strong className="text-slate-900 font-mono">{cap.dailyTargetGoodOutput.toLocaleString()}</strong> ชิ้นดี
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-slate-700">
              02. จังหวะส่งมอบ (Takt Time)
            </div>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {cap.taktTimeSec.toFixed(1)}
              </span>
              <span className="text-xs text-slate-600">วินาที/ชิ้น</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              สูตร: 3,600 ÷ {cap.targetUPH.toFixed(0)} UPH
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-slate-700">
              03. ประสิทธิภาพ OEE รวม
            </div>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {cap.oeePct.toFixed(1)}%
              </span>
              <span className="text-xs text-slate-600">A×P×Q</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {line.availabilityPct}% × {line.performancePct}% × {line.qualityPct}%
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-blue-900">
              04. เวลาผลิตจริง (Target CT)
            </div>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#0B4F9F]">
                {cap.targetCTSec.toFixed(2)}
              </span>
              <span className="text-xs text-slate-600">วินาที/ชิ้น</span>
            </div>
            <div className="text-[11px] text-slate-600">
              ต้องออกแบบไลน์ที่ <strong className="text-slate-900 font-mono">{cap.designUPH.toFixed(1)}</strong> UPH
            </div>
          </div>

          {/* Step 5 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-slate-700">
              05. กำลังคน &amp; ความเร็วสายพาน
            </div>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {cap.requiredOperators}
              </span>
              <span className="text-xs text-slate-600">คน/สถานี</span>
            </div>
            <div className="text-[11px] text-slate-600 font-mono">
              Speed: {cap.lineSpeedMPerMin.toFixed(2)} m/min ({cap.estimatedLineLengthMeters.toFixed(0)}m)
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Calculator Layout matching Reference Image */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (5 cols on desktop) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Primary Target UPH Card (Blue Highlight Border) */}
          <div className="bg-white rounded-2xl border-2 border-[#0B4F9F] shadow-xs p-5">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="primary-target-uph"
                className="block text-sm font-bold text-slate-900"
              >
                Target UPH (เป้าหมายชิ้นงานดี ต่อชั่วโมง)
              </label>
              <span className="text-xs text-blue-800 font-semibold">ช่องกรอกหลัก</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              ระบุจำนวนชิ้นงานดี (Good Units) ที่ต้องการให้ผลิตสำเร็จใน 1 ชั่วโมง
            </p>
            <div className="relative">
              <input
                id="primary-target-uph"
                type="number"
                step="any"
                min="1"
                value={editingField === 'uph' ? localVal : line.targetUPH}
                onChange={(e) => handleLinkedChange('uph', e.target.value)}
                onBlur={() => setEditingField(null)}
                className="w-full bg-slate-50 border-2 border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-xl pl-4 pr-24 py-3 text-right text-3xl font-bold font-mono tabular-nums text-slate-900 outline-none transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 pointer-events-none">
                ชิ้นดี/ชม.
              </span>
            </div>

            {/* Quick Preset UPH Buttons for easy testing */}
            <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">เลือกค่าด่วน:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[60, 100, 120, 150, 200].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleLinkedChange('uph', String(preset))}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono tabular-nums font-semibold transition-colors ${
                      Math.round(line.targetUPH) === preset
                        ? 'bg-[#0B4F9F] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. เวลาทำงาน (Available time) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0B4F9F]">
                  เวลาทำงาน (Available Time)
                </h2>
                <p className="text-xs text-slate-500">
                  คำนวณเวลาเดินสายพานสุทธิหลังหักเวลาพักและกิจกรรมตามแผน
                </p>
              </div>
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">จำนวนกะ/วัน</div>
                  <div className="text-xs text-slate-500">จำนวนกะที่เปิดเดินสายพาน</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="1"
                    max="4"
                    step="1"
                    value={line.shiftsPerDay}
                    onChange={(e) => updateField('shiftsPerDay', Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-11 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    กะ
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">ชั่วโมง/กะ</div>
                  <div className="text-xs text-slate-500">เวลารวมต่อ 1 กะ (รวม OT ถ้ามี)</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="1"
                    max="24"
                    step="0.5"
                    value={line.hoursPerShift}
                    onChange={(e) => updateField('hoursPerShift', Math.max(0.5, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-11 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    ชม.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">พัก/กินข้าว (นาที/กะ)</div>
                  <div className="text-xs text-slate-500">Lunch + Break หยุดสายพาน</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={line.breakMinutesPerShift}
                    onChange={(e) => updateField('breakMinutesPerShift', Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-12 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    นาที
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">Planned stop อื่น (นาที/กะ)</div>
                  <div className="text-xs text-slate-500">5S, ประชุมกะ, Changeover ตามแผน</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={line.plannedStopMinutesPerShift}
                    onChange={(e) =>
                      updateField('plannedStopMinutesPerShift', Math.max(0, Number(e.target.value)))
                    }
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-12 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    นาที
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Net Available Time Summary Box */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">เวลาผลิตสุทธิต่อวัน (Net Available):</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {cap.netAvailableMinutesPerDay.toLocaleString()} นาที ({cap.netAvailableHoursPerDay.toFixed(2)} ชม./วัน)
              </span>
            </div>
          </div>

          {/* 3. ประสิทธิภาพ (OEE factors) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0B4F9F]">
                  ประสิทธิภาพเครื่องจักรและไลน์ (OEE Factors)
                </h2>
                <p className="text-xs text-slate-500">
                  ตัวคูณเผื่อความสูญเสียเพื่อหา Target CT ที่แท้จริง
                </p>
              </div>
              <Gauge className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="space-y-4">
              {/* Availability */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Availability (A)</div>
                    <div className="text-xs text-slate-500">หักเครื่องเสีย/รอวัสดุ ที่ไม่ได้วางแผน</div>
                  </div>
                  <div className="relative w-36 shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="0.5"
                      value={line.availabilityPct}
                      onChange={(e) =>
                        updateField('availabilityPct', Math.min(100, Math.max(1, Number(e.target.value))))
                      }
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-9 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, line.availabilityPct)}%` }}
                  />
                </div>
              </div>

              {/* Performance */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Performance (P)</div>
                    <div className="text-xs text-slate-500">ความเร็วเดินงานจริง ÷ ความเร็วออกแบบ</div>
                  </div>
                  <div className="relative w-36 shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="0.5"
                      value={line.performancePct}
                      onChange={(e) =>
                        updateField('performancePct', Math.min(100, Math.max(1, Number(e.target.value))))
                      }
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-9 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, line.performancePct)}%` }}
                  />
                </div>
              </div>

              {/* Quality */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Quality / FPY (Q)</div>
                    <div className="text-xs text-slate-500">สัดส่วนชิ้นงานดีตั้งแต่รอบแรก (First Pass Yield)</div>
                  </div>
                  <div className="relative w-36 shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="0.5"
                      value={line.qualityPct}
                      onChange={(e) =>
                        updateField('qualityPct', Math.min(100, Math.max(1, Number(e.target.value))))
                      }
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-9 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, line.qualityPct)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Combined OEE Bar */}
            <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-200 flex items-center justify-between text-xs">
              <span className="text-emerald-950 font-semibold">
                OEE รวมของไลน์ (A × P × Q):
              </span>
              <span className="font-mono tabular-nums font-bold text-base text-emerald-800">
                {cap.oeePct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* 4. Line & Manpower (ไม่บังคับ) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0B4F9F]">
                  Line &amp; Manpower (คำนวณคนและสายพาน)
                </h2>
                <p className="text-xs text-slate-500">
                  ข้อมูลระยะห่างชิ้นงานและเวลางานรวมเพื่อหาจำนวนพนักงาน
                </p>
              </div>
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    Pitch ระหว่างชิ้นงานบน Conveyor
                  </div>
                  <div className="text-xs text-slate-500">ระยะห่างต่อ 1 ชิ้นงาน หรือ 1 Jig</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={line.pitchMeters}
                    onChange={(e) => updateField('pitchMeters', Math.max(0.05, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-9 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    m
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    Total Work Content (เวลางานรวม)
                  </div>
                  <div className="text-xs text-slate-500">ผลรวมเวลาทุกสถานีเพื่อประกอบ 1 ชิ้น</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="10"
                    disabled={line.useProcessTableForWorkContent}
                    value={
                      line.useProcessTableForWorkContent
                        ? Number(cap.effectiveWorkContentSec.toFixed(1))
                        : line.totalWorkContentSec
                    }
                    onChange={(e) =>
                      updateField('totalWorkContentSec', Math.max(0, Number(e.target.value)))
                    }
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white disabled:opacity-60 rounded-lg pl-3 pr-9 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    s
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    Line Balance Efficiency เป้า
                  </div>
                  <div className="text-xs text-slate-500">เป้าหมายความสมดุลของการจัดสถานี (ปกติ 85%)</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="10"
                    max="100"
                    step="1"
                    value={line.targetLineBalancePct}
                    onChange={(e) =>
                      updateField(
                        'targetLineBalancePct',
                        Math.min(100, Math.max(10, Number(e.target.value)))
                      )
                    }
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-9 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    %
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">Bottleneck CT (คอขวด)</div>
                  <div className="text-xs text-slate-500">ใส่ 0 เพื่อใช้ค่า Target CT ({cap.targetCTSec.toFixed(1)}s)</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={line.manualBottleneckCTSec}
                    onChange={(e) =>
                      updateField('manualBottleneckCTSec', Math.max(0, Number(e.target.value)))
                    }
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded-lg pl-3 pr-9 py-2 text-right font-mono tabular-nums text-base font-semibold text-slate-900 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols on desktop) */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. UPH <-> TT <-> CT <-> Line Speed (เชื่อมกัน แก้ช่องไหนก็ได้) */}
          <div className="bg-white rounded-2xl border-2 border-[#0B4F9F] shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0B4F9F] flex items-center gap-2">
                  <span>UPH ⇄ TT ⇄ CT ⇄ Line Speed</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  ทั้ง 4 ช่องผูกสูตรเชื่อมถึงกันทั้งหมด ลองแก้ช่องใดช่องหนึ่ง ค่าที่เหลือจะปรับตามทันที
                </p>
              </div>
              <ArrowLeftRight className="w-4 h-4 text-[#0B4F9F] shrink-0" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Box 1: Target UPH */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Target UPH</div>
                  <div className="text-xs text-slate-500">ชิ้นงานดี/ชั่วโมง</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    step="any"
                    value={editingField === 'uph' ? localVal : Number(cap.targetUPH.toFixed(2))}
                    onChange={(e) => handleLinkedChange('uph', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    className="w-full bg-white border border-slate-300 focus:border-[#0B4F9F] rounded-lg px-3 py-2 text-right font-mono tabular-nums text-base font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              {/* Box 2: Takt Time */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">TT (Takt Time)</div>
                  <div className="text-xs text-slate-500 font-mono">= 3600 ÷ UPH (วินาที)</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    step="any"
                    value={editingField === 'tt' ? localVal : Number(cap.taktTimeSec.toFixed(2))}
                    onChange={(e) => handleLinkedChange('tt', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    className="w-full bg-white border border-slate-300 focus:border-[#0B4F9F] rounded-lg px-3 py-2 text-right font-mono tabular-nums text-base font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              {/* Box 3: Target CT */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Target CT</div>
                  <div className="text-xs text-slate-500 font-mono">= TT × A × P × Q (วินาที)</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    step="any"
                    value={editingField === 'ct' ? localVal : Number(cap.targetCTSec.toFixed(2))}
                    onChange={(e) => handleLinkedChange('ct', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    className="w-full bg-white border border-slate-300 focus:border-[#0B4F9F] rounded-lg px-3 py-2 text-right font-mono tabular-nums text-base font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              {/* Box 4: Line Speed */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Line Speed</div>
                  <div className="text-xs text-slate-500 font-mono">= Pitch × 60 ÷ CT (m/min)</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    type="number"
                    step="any"
                    value={editingField === 'speed' ? localVal : Number(cap.lineSpeedMPerMin.toFixed(2))}
                    onChange={(e) => handleLinkedChange('speed', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    className="w-full bg-white border border-slate-300 focus:border-[#0B4F9F] rounded-lg px-3 py-2 text-right font-mono tabular-nums text-base font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. ผลลัพธ์ที่ต้องใช้ (Required Results) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#0B4F9F]">
                  ผลลัพธ์ที่ต้องใช้ควบคุมหน้างาน (Key Engineering Outputs)
                </h2>
                <p className="text-xs text-slate-500">
                  ค่าพารามิเตอร์หลักสำหรับตั้งค่าความเร็วสายพานและเป้าหมายประจำวัน
                </p>
              </div>
            </div>

            {/* 3 Deep Blue Metric Boxes matching Reference Image */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="bg-[#0B4F9F] text-white rounded-xl p-4 shadow-xs">
                <div className="text-xs text-blue-100 font-medium">Takt Time (จังหวะลูกค้า)</div>
                <div className="text-3xl font-bold font-mono tabular-nums my-1.5">
                  {cap.taktTimeSec.toFixed(1)}
                </div>
                <div className="text-xs text-blue-200">วินาที/ชิ้น (3600 ÷ UPH)</div>
              </div>

              <div className="bg-[#0B4F9F] text-white rounded-xl p-4 shadow-xs">
                <div className="text-xs text-blue-100 font-medium">Target Line CT (เวลาผลิตจริง)</div>
                <div className="text-3xl font-bold font-mono tabular-nums my-1.5">
                  {cap.targetCTSec.toFixed(1)}
                </div>
                <div className="text-xs text-blue-200">วินาที/ชิ้น (เผื่อ OEE {cap.oeePct.toFixed(1)}%)</div>
              </div>

              <div className="bg-[#0B4F9F] text-white rounded-xl p-4 shadow-xs">
                <div className="text-xs text-blue-100 font-medium">Line Speed (ความเร็วสายพาน)</div>
                <div className="text-3xl font-bold font-mono tabular-nums my-1.5">
                  {cap.lineSpeedMPerMin.toFixed(2)}
                </div>
                <div className="text-xs text-blue-200">เมตร/นาที (Pitch {line.pitchMeters}m)</div>
              </div>
            </div>

            {/* Key-Value Table with clear explanations */}
            <div className="divide-y divide-slate-200 text-sm border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between py-2.5 px-4 text-xs font-semibold text-slate-600 bg-slate-50">
                <span>รายการผลลัพธ์ (Parameter)</span>
                <span>ค่าที่ได้ (Calculated Value)</span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/70">
                <div>
                  <div className="text-slate-800 font-medium">Net available time/วัน</div>
                  <div className="text-xs text-slate-500">เวลาเดินสายพานสุทธิรวมทุกกะต่อวัน</div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cap.netAvailableMinutesPerDay.toLocaleString()} นาที ({cap.netAvailableHoursPerDay.toFixed(2)} ชม.)
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/70">
                <div>
                  <div className="text-slate-800 font-medium">Target UPH (Good) → Takt</div>
                  <div className="text-xs text-slate-500">ความสัมพันธ์ระหว่างเป้าหมายต่อชั่วโมงและเวลาต่อชิ้น</div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cap.targetUPH.toFixed(1)} UPH = {cap.taktTimeSec.toFixed(1)} s/ชิ้น
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/70">
                <div>
                  <div className="text-slate-800 font-medium">Output/วัน จาก Target UPH</div>
                  <div className="text-xs text-slate-500">จำนวนชิ้นงานดีที่ต้องส่งมอบได้ต่อวัน</div>
                </div>
                <span className="font-mono tabular-nums font-bold text-emerald-700 text-base">
                  {cap.dailyTargetGoodOutput.toLocaleString()} ชิ้น
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/70">
                <div>
                  <div className="text-slate-800 font-medium">Gross UPH (รวมเผื่อของเสีย)</div>
                  <div className="text-xs text-slate-500">ยอดผลิตรวมของเสียตามค่า Quality ({line.qualityPct}%)</div>
                </div>
                <span className="font-mono tabular-nums text-slate-900 font-semibold">
                  {cap.grossUPH.toFixed(1)} ชิ้น/ชม.
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 bg-blue-50/60">
                <div>
                  <div className="font-bold text-blue-950">UPH ที่ Line ต้องออกแบบ (Design UPH)</div>
                  <div className="text-xs text-blue-800">ความเร็วเครื่องจักร/ไลน์ที่ต้องตั้งไว้เพื่อชดเชย OEE</div>
                </div>
                <span className="font-mono tabular-nums font-bold text-[#0B4F9F] text-lg">
                  {cap.designUPH.toFixed(1)} ชิ้น/ชม.
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/70">
                <div>
                  <div className="text-slate-800 font-medium">Gross output ที่ต้องผลิต (รวมของเสีย)</div>
                  <div className="text-xs text-slate-500">จำนวนชิ้นงานทั้งหมดที่ต้องป้อนเข้าไลน์ต่อวัน</div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cap.dailyGrossOutput.toLocaleString()} ชิ้น/วัน
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/70">
                <div>
                  <div className="text-slate-800 font-medium">Throughput (อัตราไหลของงาน)</div>
                  <div className="text-xs text-slate-500">จำนวนชิ้นงานที่ออกจากปลายสายพานต่อนาที</div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cap.throughputPerMin.toFixed(2)} ชิ้น/นาที
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/70">
                <div>
                  <div className="text-slate-800 font-medium">OEE โดยรวม (A×P×Q)</div>
                  <div className="text-xs text-slate-500">ประสิทธิผลโดยรวมของเครื่องจักรและสายการผลิต</div>
                </div>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {cap.oeePct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* 3. Manpower & Line Balance with Visual Efficiency Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#0B4F9F]">
                Manpower &amp; Line Balance (กำลังคนและความสมดุลสายการผลิต)
              </h2>
              <p className="text-xs text-slate-500">
                คำนวณจำนวนสถานีงานและพนักงานจากเวลางานรวม ({cap.effectiveWorkContentSec} วินาที/ชิ้น)
              </p>
            </div>

            {/* Visual Balance Efficiency vs Delay Bar */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-emerald-800">
                  Balance Efficiency ที่ได้: {cap.achievedBalanceEfficiencyPct.toFixed(1)}% (เวลางานคุ้มค่า)
                </span>
                <span className="text-amber-800">
                  Balance Delay: {cap.balanceDelayPct.toFixed(1)}% (เวลารอคอยระหว่างสถานี)
                </span>
              </div>
              <div className="w-full h-3 bg-amber-200 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-emerald-600 transition-all duration-200"
                  style={{ width: `${Math.min(100, cap.achievedBalanceEfficiencyPct)}%` }}
                />
              </div>
            </div>

            <div className="divide-y divide-slate-200 text-sm border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between py-2.5 px-4 text-xs font-semibold text-slate-600 bg-slate-50">
                <span>รายการ (Manpower Parameter)</span>
                <span>ค่าที่ได้</span>
              </div>

              <div className="flex items-center justify-between py-3 px-4">
                <div>
                  <div className="text-slate-800 font-medium">Theoretical min operators</div>
                  <div className="text-xs text-slate-500">จำนวนคนตามทฤษฎีที่สมดุล 100% (Work Content ÷ CT)</div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cap.theoreticalMinOperators.toFixed(2)} คน
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4 bg-blue-50/60">
                <div>
                  <div className="font-bold text-blue-950">Operators/Stations ที่ต้องใช้จริง</div>
                  <div className="text-xs text-blue-800">ปัดขึ้นตามเป้า Line Balance Efficiency ({line.targetLineBalancePct}%)</div>
                </div>
                <span className="font-mono tabular-nums font-bold text-[#0B4F9F] text-lg">
                  {cap.requiredOperators.toLocaleString()} คน/สถานี
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4">
                <span className="text-slate-800 font-medium">Balance Efficiency ที่ได้จริง</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  {cap.achievedBalanceEfficiencyPct.toFixed(1)}%
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4">
                <span className="text-slate-800 font-medium">Balance Delay (ความสูญเสียจากความไม่สมดุล)</span>
                <span className="font-mono tabular-nums font-semibold text-amber-700">
                  {cap.balanceDelayPct.toFixed(1)}%
                </span>
              </div>

              <div className="flex items-center justify-between py-3 px-4">
                <div>
                  <div className="text-slate-800 font-medium">Line length ประมาณ (สถานี × Pitch)</div>
                  <div className="text-xs text-slate-500">ความยาวสายพานโดยประมาณสำหรับจัดวางสถานี</div>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cap.estimatedLineLengthMeters.toFixed(1)} m
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Process Station Table & Bottleneck Analyzer */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-[#0B4F9F]">
              ตารางวิเคราะห์เวลาแต่ละสถานีงาน (Process Cycle Time &amp; Bottleneck Check)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ตรวจสอบว่าสถานีใดใช้เวลาเกินกว่า Target Line CT ({cap.targetCTSec.toFixed(1)} วินาที) หรือ Takt Time ({cap.taktTimeSec.toFixed(1)} วินาที)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer select-none">
              <input
                type="checkbox"
                checked={line.useProcessTableForWorkContent}
                onChange={(e) => updateField('useProcessTableForWorkContent', e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>ใช้ผลรวมจากตารางนี้คำนวณ Work Content อัตโนมัติ</span>
            </label>

            <button
              type="button"
              onClick={handleAddProcess}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B4F9F] hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มสถานีงาน
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                <th className="py-2.5 px-3 w-16">สถานี</th>
                <th className="py-2.5 px-3">ชื่อกระบวนการ (Process Name)</th>
                <th className="py-2.5 px-3 text-right w-36">เวลารวม (วินาที)</th>
                <th className="py-2.5 px-3 text-right w-28">จำนวนคน</th>
                <th className="py-2.5 px-3 text-right w-36">CT สุทธิ/คน (วินาที)</th>
                <th className="py-2.5 px-3 w-56">เทียบกับ Target CT ({cap.targetCTSec.toFixed(1)}s)</th>
                <th className="py-2.5 px-3 text-right w-16">ลบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {line.processes.map((proc) => {
                const netCT =
                  proc.operators > 0 ? proc.cycleTimeSec / proc.operators : proc.cycleTimeSec;
                const loadPct = cap.targetCTSec > 0 ? (netCT / cap.targetCTSec) * 100 : 0;
                const isOverTargetCT = netCT > cap.targetCTSec + 0.1;
                const isOverTakt = netCT > cap.taktTimeSec;

                return (
                  <tr key={proc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-700">
                      #{proc.stationNumber}
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={proc.name}
                        onChange={(e) => handleUpdateProcess(proc.id, 'name', e.target.value)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded px-2 py-1 text-slate-900 font-medium outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={proc.cycleTimeSec}
                        onChange={(e) =>
                          handleUpdateProcess(
                            proc.id,
                            'cycleTimeSec',
                            Math.max(0.1, Number(e.target.value))
                          )
                        }
                        className="w-28 bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded px-2.5 py-1 text-right font-mono tabular-nums text-slate-900 outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        step="1"
                        value={proc.operators}
                        onChange={(e) =>
                          handleUpdateProcess(
                            proc.id,
                            'operators',
                            Math.max(1, Number(e.target.value))
                          )
                        }
                        className="w-20 bg-slate-50 border border-slate-300 focus:border-[#0B4F9F] focus:bg-white rounded px-2.5 py-1 text-right font-mono tabular-nums text-slate-900 outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                      <span
                        className={
                          isOverTakt
                            ? 'text-red-700'
                            : isOverTargetCT
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        {netCT.toFixed(2)} s
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          {isOverTargetCT ? (
                            <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              คอขวด ({loadPct.toFixed(0)}% ของ CT)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              ทันตามเกณฑ์ ({loadPct.toFixed(0)}%)
                            </span>
                          )}
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isOverTakt
                                ? 'bg-red-600'
                                : isOverTargetCT
                                ? 'bg-amber-500'
                                : 'bg-emerald-600'
                            }`}
                            style={{ width: `${Math.min(100, loadPct)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveProcess(proc.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="ลบสถานีงาน"
                      >
                        <Trash2 className="w-4 h-4" />
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
